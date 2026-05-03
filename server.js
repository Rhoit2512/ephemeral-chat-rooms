const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7 // Allow 10MB payloads for Base64 files
});

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Ping Endpoint
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// State Management
const roomsState = new Map(); // roomId -> { expiryTimer, nicknames: Map(nickname -> sessionId) }
const gracePeriods = new Map(); // sessionId -> timeout

// Rate Limiting Config
const MAX_MSGS_PER_SEC = 5;

io.on('connection', (socket) => {
    let currentUser = null;
    let currentRoom = null;
    let currentSessionId = null;

    // Rate limiting tracking
    let messageTimestamps = [];

    const isRateLimited = () => {
        const now = Date.now();
        messageTimestamps = messageTimestamps.filter(t => now - t < 1000);
        if (messageTimestamps.length >= MAX_MSGS_PER_SEC) return true;
        messageTimestamps.push(now);
        return false;
    };

    // Join Room
    socket.on('join_room', ({ action, nickname, roomHash, roomExpiry, sessionId }, callback) => {
        nickname = (nickname || '').trim();
        roomHash = (roomHash || '').trim();

        if (!nickname || !roomHash) {
            return callback({ success: false, message: 'Nickname and Room Code are required.' });
        }

        // Room Expiry logic
        if (!roomsState.has(roomHash)) {
            if (action === 'join') {
                return callback({ success: false, message: 'room has not been created' });
            }

            const expiryMs = (roomExpiry || 12) * 60 * 60 * 1000;
            const timer = setTimeout(() => {
                io.to(roomHash).emit('room_expired');
                io.socketsLeave(roomHash);
                roomsState.delete(roomHash);
                console.log(`⏳ Room [${roomHash}] expired and deleted.`);
            }, expiryMs);

            roomsState.set(roomHash, {
                expiryTimer: timer,
                nicknames: new Map() // nickname -> sessionId
            });
            console.log(`🆕 Room [${roomHash}] created with expiry ${roomExpiry}h.`);
        }

        const roomData = roomsState.get(roomHash);

        // Nickname Locking & Grace Period Check
        let finalSessionId = sessionId || crypto.randomUUID();
        let isRejoin = false;

        if (roomData.nicknames.has(nickname)) {
            const existingSession = roomData.nicknames.get(nickname);
            if (existingSession === finalSessionId) {
                // Reclaiming nickname from grace period
                if (gracePeriods.has(finalSessionId)) {
                    clearTimeout(gracePeriods.get(finalSessionId));
                    gracePeriods.delete(finalSessionId);
                    isRejoin = true;
                }
            } else {
                return callback({ success: false, message: 'Nickname is currently taken in this room.' });
            }
        }

        roomData.nicknames.set(nickname, finalSessionId);
        currentUser = nickname;
        currentRoom = roomHash;
        currentSessionId = finalSessionId;

        socket.join(currentRoom);

        const roomSize = io.sockets.adapter.rooms.get(currentRoom)?.size || 0;
        
        if (!isRejoin) {
            console.log(`✅ ${currentUser} joined room [${currentRoom}]. Room size: ${roomSize}`);
            socket.to(currentRoom).emit('system_message', `${currentUser} joined the room.`);
        } else {
            console.log(`🔄 ${currentUser} seamlessly rejoined [${currentRoom}].`);
        }
        
        io.to(currentRoom).emit('online_count', roomSize);

        callback({ success: true, username: currentUser, room: currentRoom, sessionId: currentSessionId });
    });

    // Chat Message
    socket.on('chat_message', (data) => {
        if (!currentUser || !currentRoom) return;
        if (isRateLimited()) {
            return socket.emit('system_error', 'You are sending messages too fast!');
        }

        const msg = {
            username: currentUser,
            payload: data.payload, 
            duration: data.duration || 10,
            isBurnOnRead: !!data.isBurnOnRead,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        io.to(currentRoom).emit('chat_message', msg);
    });

    // Chat File
    socket.on('chat_file', (fileData) => {
        if (!currentUser || !currentRoom) return;
        if (isRateLimited()) {
            return socket.emit('system_error', 'You are sending files too fast!');
        }

        // Server-Side Size Validation (~7MB limit for Base64 representation of 5MB file)
        try {
            const payloadStr = JSON.stringify(fileData.payload);
            if (payloadStr.length > 7 * 1024 * 1024) {
                return socket.emit('system_error', 'Payload size limit exceeded (Max 5MB). File dropped.');
            }
        } catch (e) {
            return socket.emit('system_error', 'Invalid file payload.');
        }

        const msg = {
            username: currentUser,
            fileName: fileData.fileName,
            fileType: fileData.fileType,
            payload: fileData.payload, 
            duration: fileData.duration || 10,
            isBurnOnRead: !!fileData.isBurnOnRead, // also support burn-on-read for files
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        io.to(currentRoom).emit('chat_file', msg);
    });

    // Typing Indicators
    socket.on('typing', () => {
        if (currentUser && currentRoom) {
            socket.to(currentRoom).emit('typing', currentUser);
        }
    });

    socket.on('stop_typing', () => {
        if (currentUser && currentRoom) {
            socket.to(currentRoom).emit('stop_typing', currentUser);
        }
    });

    // Handle User Disconnect/Logout
    const handleLeave = (isDisconnect) => {
        if (!currentUser || !currentRoom) return;

        const savedUser = currentUser;
        const savedRoom = currentRoom;
        const savedSessionId = currentSessionId;
        const roomData = roomsState.get(savedRoom);

        if (isDisconnect) {
            // Grace Period: Wait 15s before broadcasting disconnect and removing from state
            const timer = setTimeout(() => {
                const rd = roomsState.get(savedRoom);
                if (rd && rd.nicknames.get(savedUser) === savedSessionId) {
                    rd.nicknames.delete(savedUser);
                    
                    io.to(savedRoom).emit('system_message', `${savedUser} disconnected.`);
                    const roomSize = io.sockets.adapter.rooms.get(savedRoom)?.size || 0;
                    io.to(savedRoom).emit('online_count', roomSize);
                    
                    console.log(`🔌 ${savedUser} disconnected from [${savedRoom}] (timeout expired).`);
                }
                gracePeriods.delete(savedSessionId);
            }, 15000);
            
            gracePeriods.set(savedSessionId, timer);
        } else {
            // Explicit logout, delete immediately and broadcast
            if (roomData) roomData.nicknames.delete(savedUser);
            socket.leave(savedRoom);
            
            socket.to(savedRoom).emit('system_message', `${savedUser} left the room.`);
            const roomSize = io.sockets.adapter.rooms.get(savedRoom)?.size || 0;
            io.to(savedRoom).emit('online_count', roomSize);
            console.log(`👋 ${savedUser} left [${savedRoom}].`);
        }

        currentUser = null;
        currentRoom = null;
        currentSessionId = null;
    };

    socket.on('logout', () => handleLeave(false));
    socket.on('disconnect', () => handleLeave(true));
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 Chat server running at http://localhost:${PORT}\n`);
});
