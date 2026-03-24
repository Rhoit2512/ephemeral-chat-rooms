const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io Logic
io.on('connection', (socket) => {
    let currentUser = null;
    let currentRoom = null;

    // Join Room
    socket.on('join_room', ({ nickname, roomCode }, callback) => {
        nickname = (nickname || '').trim();
        roomCode = (roomCode || '').trim();

        if (!nickname || !roomCode) {
            return callback({ success: false, message: 'Nickname and Room Code are required.' });
        }

        currentUser = nickname;
        currentRoom = roomCode;

        socket.join(currentRoom);

        // Calculate online count for this room
        const roomSize = io.sockets.adapter.rooms.get(currentRoom)?.size || 0;
        
        console.log(`✅ ${currentUser} joined room [${currentRoom}]. Room size: ${roomSize}`);

        // Notify others in room
        socket.to(currentRoom).emit('system_message', `${currentUser} joined the room.`);
        io.to(currentRoom).emit('online_count', roomSize);

        callback({ success: true, username: currentUser, room: currentRoom });
    });

    // Chat Message
    socket.on('chat_message', (text) => {
        if (!currentUser || !currentRoom) return;
        const msg = {
            username: currentUser,
            text: (text || '').slice(0, 1000), // sanitize
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        io.to(currentRoom).emit('chat_message', msg);
    });

    // Logout
    socket.on('logout', () => {
        if (currentUser && currentRoom) {
            socket.to(currentRoom).emit('system_message', `${currentUser} left the room.`);
            socket.leave(currentRoom);
            const roomSize = io.sockets.adapter.rooms.get(currentRoom)?.size || 0;
            io.to(currentRoom).emit('online_count', roomSize);
            console.log(`👋 ${currentUser} left room [${currentRoom}].`);
            currentUser = null;
            currentRoom = null;
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        if (currentUser && currentRoom) {
            socket.to(currentRoom).emit('system_message', `${currentUser} disconnected.`);
            const roomSize = io.sockets.adapter.rooms.get(currentRoom)?.size || 0;
            io.to(currentRoom).emit('online_count', roomSize);
            console.log(`🔌 ${currentUser} disconnected from [${currentRoom}].`);
        }
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 Chat server running at http://localhost:${PORT}\n`);
});
