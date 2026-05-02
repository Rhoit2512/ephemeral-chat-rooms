const socket = io();

// ---- Screen references ----
const joinScreen = document.getElementById('join-screen');
const chatScreen = document.getElementById('chat-screen');

// ---- Join form ----
const joinForm     = document.getElementById('join-form');
const joinNickname = document.getElementById('join-nickname');
const joinRoomCode = document.getElementById('join-roomcode');
const joinRoomExpiry = document.getElementById('join-roomexpiry');
const joinAlert    = document.getElementById('join-alert');

// ---- Auth Tabs ----
const tabBtns = document.querySelectorAll('.tab-btn');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const roomcodeField = document.getElementById('roomcode-field');
const roomexpiryField = document.getElementById('roomexpiry-field');
const joinBtn = document.getElementById('join-btn');

// ---- Chat ----
const sidebarUsername = document.getElementById('sidebar-username');
const sidebarAvatar   = document.getElementById('sidebar-avatar');
const sidebarRoomName = document.getElementById('sidebar-room-name');
const topbarRoomName  = document.getElementById('topbar-room-name');
const btnLogout       = document.getElementById('btn-logout');
const messagesArea    = document.getElementById('messages-area');
const chatForm        = document.getElementById('chat-form');
const timerSelect     = document.getElementById('timer-select');
const messageInput    = document.getElementById('message-input');
const onlineCount     = document.getElementById('online-count');
const typingIndicator = document.getElementById('typing-indicator');
const burnCheckbox    = document.getElementById('burn-checkbox');

let currentUser = null;
let currentRoom = null;
let unhashedRoomCode = null; // Store plaintext room code locally to copy

// ===========================
//   E2EE Crypto Utilities
// ===========================
const cryptoUtils = {
    key: null,
    async deriveKey(roomCode) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(roomCode),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );
        this.key = await crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: enc.encode("ephemeral-salt-123"), 
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
        
        // Compute SHA-256 hash to use as the public Room ID
        const hashBuffer = await crypto.subtle.digest("SHA-256", enc.encode(roomCode));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },
    async encrypt(text) {
        if (!this.key) return null;
        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            this.key,
            enc.encode(text)
        );
        return {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(ciphertext))
        };
    },
    async decrypt(encryptedObj) {
        if (!this.key || !encryptedObj || !encryptedObj.iv || !encryptedObj.data) return null;
        try {
            const iv = new Uint8Array(encryptedObj.iv);
            const ciphertext = new Uint8Array(encryptedObj.data);
            const decrypted = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                this.key,
                ciphertext
            );
            const dec = new TextDecoder();
            return dec.decode(decrypted);
        } catch(e) {
            console.error("Decryption failed", e);
            return "[Encrypted Message - Unable to decrypt]";
        }
    }
};

// ===========================
//   URL Hash Parsing
// ===========================
window.addEventListener('DOMContentLoaded', () => {
    if (window.location.hash && window.location.hash.length > 1) {
        const hashRoomCode = window.location.hash.substring(1).toUpperCase();
        // Switch to join tab
        const joinTabBtn = Array.from(tabBtns).find(b => b.dataset.tab === 'join');
        if (joinTabBtn) joinTabBtn.click();
        
        joinRoomCode.value = hashRoomCode;
        joinNickname.focus();
    }
});

// ===========================
//   Screen navigation
// ===========================
function showScreen(name) {
    [joinScreen, chatScreen].forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    const target = document.getElementById(name + '-screen');
    target.classList.remove('hidden');
    target.offsetWidth; 
    target.classList.add('active');
}

// ===========================
//   Alert helpers
// ===========================
function showAlert(el, msg, type = 'error') {
    el.textContent = msg;
    el.className = `alert ${type}`;
}
function hideAlert(el) {
    el.className = 'alert hidden';
}

// ===========================
//   Join & Create Room
// ===========================
let originalJoinMode = 'create'; // default

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        originalJoinMode = btn.dataset.tab;

        if (originalJoinMode === 'create') {
            authTitle.textContent = 'Create a Room';
            authSubtitle.textContent = 'Get a secret code to share with your friends.';
            roomcodeField.style.display = 'none';
            if(roomexpiryField) roomexpiryField.style.display = 'block';
            joinRoomCode.removeAttribute('required');
            joinBtn.textContent = 'Create & Join';
        } else {
            authTitle.textContent = 'Join a Room';
            authSubtitle.textContent = 'Enter a room code to connect.';
            roomcodeField.style.display = 'block';
            if(roomexpiryField) roomexpiryField.style.display = 'none';
            joinRoomCode.setAttribute('required', 'true');
            joinBtn.textContent = 'Join Chat';
        }
        hideAlert(joinAlert);
    });
});

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

joinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(joinAlert);

    const nickname = joinNickname.value.trim();
    let roomCode = joinRoomCode.value.trim();
    let roomExpiry = 12;
    if(joinRoomExpiry) {
        roomExpiry = parseInt(joinRoomExpiry.value, 10) || 12;
    }

    if (originalJoinMode === 'create') {
        roomCode = generateRoomCode();
        window.location.hash = roomCode; // Set hash for easy sharing
    }

    if (!nickname || !roomCode) return showAlert(joinAlert, 'Please enter all fields.');

    const btn = document.getElementById('join-btn');
    btn.disabled = true;
    btn.textContent = 'Joining...';

    const savedSessionId = sessionStorage.getItem('chatSessionId');
    const roomHash = await cryptoUtils.deriveKey(roomCode);
    unhashedRoomCode = roomCode;

    socket.emit('join_room', { 
        nickname, 
        roomHash, 
        roomExpiry, 
        sessionId: savedSessionId 
    }, (res) => {
        btn.disabled = false;
        btn.textContent = originalJoinMode === 'create' ? 'Create & Join' : 'Join Chat';
        
        if (res.success) {
            currentUser = res.username;
            currentRoom = res.room;
            if (res.sessionId) {
                sessionStorage.setItem('chatSessionId', res.sessionId);
            }

            sidebarUsername.textContent = res.username;
            sidebarAvatar.textContent = res.username.charAt(0).toUpperCase();
            
            sidebarRoomName.textContent = unhashedRoomCode;
            topbarRoomName.textContent = `# ${unhashedRoomCode}`;

            joinNickname.value = '';
            joinRoomCode.value = '';
            showScreen('chat');
        } else {
            showAlert(joinAlert, res.message);
        }
    });
});

// ===========================
//   Leave / Disconnect
// ===========================
btnLogout.addEventListener('click', () => {
    socket.emit('logout');
    sessionStorage.removeItem('chatSessionId');
    resetToJoin();
});

socket.on('disconnect', () => {
    if (currentUser) {
        resetToJoin();
        showAlert(joinAlert, '⏱ Disconnected from server.', 'error');
    }
});

socket.on('room_expired', () => {
    if (currentUser) {
        sessionStorage.removeItem('chatSessionId');
        resetToJoin();
        showAlert(joinAlert, '⏳ The room has expired and was closed.', 'error');
    }
});

function resetToJoin() {
    currentUser = null;
    currentRoom = null;
    cryptoUtils.key = null;
    messagesArea.innerHTML = `
        <div class="welcome-msg">
            <div class="welcome-icon">🔒</div>
            <p>This is an End-to-End Encrypted live session. Messages are not stored. Once you disconnect, your session ends.</p>
        </div>`;
    showScreen('join');
}

// ===========================
//   Typing Indicators
// ===========================
let typingTimeout = null;
let activeTypers = new Set();

messageInput.addEventListener('input', () => {
    if (!currentUser) return;
    socket.emit('typing');
    
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop_typing');
    }, 2000);
});

messageInput.addEventListener('blur', () => {
    if (!currentUser) return;
    socket.emit('stop_typing');
    if (typingTimeout) clearTimeout(typingTimeout);
});

function updateTypingIndicator() {
    if (!typingIndicator) return;
    if (activeTypers.size === 0) {
        typingIndicator.classList.remove('active');
        typingIndicator.textContent = '';
    } else {
        const typersArray = Array.from(activeTypers);
        if (typersArray.length === 1) {
            typingIndicator.textContent = `${typersArray[0]} is typing...`;
        } else if (typersArray.length === 2) {
            typingIndicator.textContent = `${typersArray[0]} and ${typersArray[1]} are typing...`;
        } else {
            typingIndicator.textContent = 'Several people are typing...';
        }
        typingIndicator.classList.add('active');
    }
}

socket.on('typing', (username) => {
    if (username !== currentUser) {
        activeTypers.add(username);
        updateTypingIndicator();
    }
});

socket.on('stop_typing', (username) => {
    activeTypers.delete(username);
    updateTypingIndicator();
});

// ===========================
//   Chat Messages & Countdown Logic
// ===========================
function createCountdownTimer(durationSeconds) {
    const timerEl = document.createElement('div');
    timerEl.className = 'msg-timer';
    timerEl.innerHTML = `
        <div class="timer-ring" id="ring-${Date.now()}">
            <svg viewBox="0 0 14 14">
                <circle class="ring-bg" cx="7" cy="7" r="6"/>
                <circle class="ring-progress" cx="7" cy="7" r="6"/>
            </svg>
        </div>
        <span class="timer-seconds">${durationSeconds}s</span>
    `;
    return timerEl;
}

function startMessageCountdown(row, timerEl, durationSeconds) {
    const ring = timerEl.querySelector('.timer-ring');
    const ringProgress = timerEl.querySelector('.ring-progress');
    const secondsDisplay = timerEl.querySelector('.timer-seconds');
    const circumference = 38;

    let remaining = durationSeconds;
    const interval = setInterval(() => {
        remaining--;
        secondsDisplay.textContent = `${remaining}s`;

        const offset = circumference * (1 - remaining / durationSeconds);
        ringProgress.style.strokeDashoffset = offset;

        if (remaining <= 3) {
            ring.className = 'timer-ring danger';
            secondsDisplay.className = 'timer-seconds danger';
        } else if (remaining <= 6) {
            ring.className = 'timer-ring warning';
            secondsDisplay.className = 'timer-seconds warning';
        }

        if (remaining <= 0) {
            clearInterval(interval);
            row.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
            row.style.opacity = '0';
            row.style.transform = 'translateY(-10px) scale(0.95)';
            row.style.pointerEvents = 'none';
            setTimeout(() => row.remove(), 850);
        }
    }, 1000);
}

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    if (!msg) return;
    const duration = parseInt(timerSelect.value, 10) || 10;
    const isBurn = burnCheckbox && burnCheckbox.checked;
    
    const btn = document.querySelector('.btn-send');
    btn.disabled = true;

    try {
        const encryptedPayload = await cryptoUtils.encrypt(msg);
        socket.emit('chat_message', { 
            payload: encryptedPayload, 
            duration: duration,
            isBurnOnRead: isBurn
        });
        messageInput.value = '';
        socket.emit('stop_typing');
        if (typingTimeout) clearTimeout(typingTimeout);
    } catch(err) {
        console.error("Encryption failed", err);
        alert("Encryption failed.");
    }

    btn.disabled = false;
    messageInput.focus();
});

socket.on('chat_message', async (data) => {
    const isOwn = data.username === currentUser;
    const decryptedText = await cryptoUtils.decrypt(data.payload);

    const row = document.createElement('div');
    row.className = `msg-row ${isOwn ? 'own' : 'other'}`;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = decryptedText;

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.innerHTML = isOwn
        ? `<span>${data.time}</span>`
        : `<span><strong>${data.username}</strong></span><span>${data.time}</span>`;

    const DURATION = data.duration || 10;
    const timerEl = createCountdownTimer(DURATION);

    if (isOwn) {
        row.appendChild(bubble);
        row.appendChild(meta);
        row.appendChild(timerEl);
    } else {
        row.appendChild(meta);
        row.appendChild(bubble);
        row.appendChild(timerEl);
    }

    const welcome = messagesArea.querySelector('.welcome-msg');
    if (welcome) welcome.remove();

    messagesArea.appendChild(row);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    // Handle Burn on Read
    if (data.isBurnOnRead && !isOwn) {
        bubble.classList.add('burn-masked');
        bubble.addEventListener('click', () => {
            bubble.classList.remove('burn-masked');
            startMessageCountdown(row, timerEl, DURATION);
        }, { once: true });
    } else {
        startMessageCountdown(row, timerEl, DURATION);
    }
});

// ===========================
//   File Sharing
// ===========================
const fileInput = document.getElementById('file-input');
const attachmentBtn = document.getElementById('attachment-btn');

if (attachmentBtn && fileInput) {
    attachmentBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert('File must be less than 5MB to ensure snappy performance.');
            fileInput.value = '';
            return;
        }

        const btnIcon = attachmentBtn.innerHTML;
        attachmentBtn.innerHTML = '⏳';
        attachmentBtn.disabled = true;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const duration = parseInt(document.getElementById('timer-select').value, 10) || 10;
            const isBurn = burnCheckbox && burnCheckbox.checked;
            const encryptedPayload = await cryptoUtils.encrypt(evt.target.result);
            
            socket.emit('chat_file', {
                fileName: file.name,
                fileType: file.type,
                payload: encryptedPayload,
                duration: duration,
                isBurnOnRead: isBurn
            });
            attachmentBtn.innerHTML = btnIcon;
            attachmentBtn.disabled = false;
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
    });
}

socket.on('chat_file', async (data) => {
    const isOwn = data.username === currentUser;
    const decryptedFile = await cryptoUtils.decrypt(data.payload);

    const row = document.createElement('div');
    row.className = `msg-row ${isOwn ? 'own' : 'other'}`;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    if (data.fileType && data.fileType.startsWith('image/')) {
        bubble.innerHTML = `<img src="${decryptedFile}" alt="${data.fileName}" class="chat-image" onclick="window.open(this.src)">`;
    } else {
        bubble.innerHTML = `<a href="${decryptedFile}" download="${data.fileName}" class="chat-file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            ${data.fileName}
        </a>`;
    }

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.innerHTML = isOwn
        ? `<span>${data.time}</span>`
        : `<span><strong>${data.username}</strong></span><span>${data.time}</span>`;

    const DURATION = data.duration || 10;
    const timerEl = createCountdownTimer(DURATION);

    if (isOwn) {
        row.appendChild(bubble);
        row.appendChild(meta);
        row.appendChild(timerEl);
    } else {
        row.appendChild(meta);
        row.appendChild(bubble);
        row.appendChild(timerEl);
    }

    const welcome = messagesArea.querySelector('.welcome-msg');
    if (welcome) welcome.remove();

    messagesArea.appendChild(row);
    messagesArea.scrollTop = messagesArea.scrollHeight;

    // Handle Burn on Read
    if (data.isBurnOnRead && !isOwn) {
        bubble.classList.add('burn-masked');
        bubble.addEventListener('click', () => {
            bubble.classList.remove('burn-masked');
            startMessageCountdown(row, timerEl, DURATION);
        }, { once: true });
    } else {
        startMessageCountdown(row, timerEl, DURATION);
    }
});

socket.on('system_message', (msg) => {
    const el = document.createElement('div');
    el.className = 'system-msg';
    el.textContent = msg;
    messagesArea.appendChild(el);
    messagesArea.scrollTop = messagesArea.scrollHeight;
});

socket.on('system_error', (msg) => {
    // Show a temporary red floating alert in chat
    const el = document.createElement('div');
    el.className = 'system-msg';
    el.style.background = 'rgba(239, 68, 68, 0.1)';
    el.style.color = '#fca5a5';
    el.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    el.textContent = `⚠ ${msg}`;
    messagesArea.appendChild(el);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    
    // Auto remove error after 5s
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, 5000);
});

socket.on('online_count', (count) => {
    onlineCount.textContent = `${count} online`;
});

// ===========================
//   Mobile Sidebar Toggle
// ===========================
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebar = document.querySelector('.sidebar');

if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                sidebar.classList.remove('show');
            }
        }
    });
}

// ===========================
//   Copy Code Button
// ===========================
const copyCodeBtn = document.getElementById('copy-code-btn');
if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', () => {
        // Build sharable link
        const currentUrl = window.location.origin + window.location.pathname;
        const shareLink = currentUrl + '#' + unhashedRoomCode;

        navigator.clipboard.writeText(shareLink).then(() => {
            copyCodeBtn.classList.add('copied');
            setTimeout(() => copyCodeBtn.classList.remove('copied'), 2000);
        }).catch(err => console.error('Copy failed', err));
    });
}
