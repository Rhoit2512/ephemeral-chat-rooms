const socket = io();

// ---- Screen references ----
const joinScreen = document.getElementById('join-screen');
const chatScreen = document.getElementById('chat-screen');

// ---- Join form ----
const joinForm     = document.getElementById('join-form');
const joinNickname = document.getElementById('join-nickname');
const joinRoomCode = document.getElementById('join-roomcode');
const joinAlert    = document.getElementById('join-alert');

// ---- Chat ----
const sidebarUsername = document.getElementById('sidebar-username');
const sidebarAvatar   = document.getElementById('sidebar-avatar');
const sidebarRoomName = document.getElementById('sidebar-room-name');
const topbarRoomName  = document.getElementById('topbar-room-name');
const btnLogout       = document.getElementById('btn-logout');
const messagesArea    = document.getElementById('messages-area');
const chatForm        = document.getElementById('chat-form');
const messageInput    = document.getElementById('message-input');
const onlineCount     = document.getElementById('online-count');

let currentUser = null;
let currentRoom = null;

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
    target.offsetWidth; // trigger reflow for animation
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
//   Join Room
// ===========================
joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideAlert(joinAlert);

    const nickname = joinNickname.value.trim();
    const roomCode = joinRoomCode.value.trim();

    if (!nickname || !roomCode) return showAlert(joinAlert, 'Please enter a nickname and room code.');

    const btn = document.getElementById('join-btn');
    btn.disabled = true;
    btn.textContent = 'Joining...';

    socket.emit('join_room', { nickname, roomCode }, (res) => {
        btn.disabled = false;
        btn.textContent = 'Join Chat';
        if (res.success) {
            currentUser = res.username;
            currentRoom = res.room;

            sidebarUsername.textContent = res.username;
            sidebarAvatar.textContent = res.username.charAt(0).toUpperCase();
            
            sidebarRoomName.textContent = res.room;
            topbarRoomName.textContent = `# ${res.room}`;

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
    resetToJoin();
});

socket.on('disconnect', () => {
    if (currentUser) {
        resetToJoin();
        showAlert(joinAlert, '⏱ Disconnected from server.', 'error');
    }
});

function resetToJoin() {
    currentUser = null;
    currentRoom = null;
    // Clear messages except welcome
    messagesArea.innerHTML = `
        <div class="welcome-msg">
            <div class="welcome-icon">🔒</div>
            <p>This is a live session. Messages are not stored. Once you disconnect, your session ends.</p>
        </div>`;
    showScreen('join');
}

// ===========================
//   Chat Messages
// ===========================
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    if (!msg) return;
    socket.emit('chat_message', msg);
    messageInput.value = '';
    messageInput.focus();
});

socket.on('chat_message', (data) => {
    const isOwn = data.username === currentUser;
    const row = document.createElement('div');
    row.className = `msg-row ${isOwn ? 'own' : 'other'}`;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = data.text;

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.innerHTML = isOwn
        ? `<span>${data.time}</span>`
        : `<span><strong>${data.username}</strong></span><span>${data.time}</span>`;

    // --- Countdown Timer ---
    const DURATION = 10;
    const circumference = 38;

    const timerEl = document.createElement('div');
    timerEl.className = 'msg-timer';
    timerEl.innerHTML = `
        <div class="timer-ring" id="ring-${Date.now()}">
            <svg viewBox="0 0 14 14">
                <circle class="ring-bg" cx="7" cy="7" r="6"/>
                <circle class="ring-progress" cx="7" cy="7" r="6"/>
            </svg>
        </div>
        <span class="timer-seconds">${DURATION}s</span>
    `;

    const ring = timerEl.querySelector('.timer-ring');
    const ringProgress = timerEl.querySelector('.ring-progress');
    const secondsDisplay = timerEl.querySelector('.timer-seconds');

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

    let remaining = DURATION;
    const interval = setInterval(() => {
        remaining--;
        secondsDisplay.textContent = `${remaining}s`;

        const offset = circumference * (1 - remaining / DURATION);
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
});

socket.on('system_message', (msg) => {
    const el = document.createElement('div');
    el.className = 'system-msg';
    el.textContent = msg;
    messagesArea.appendChild(el);
    messagesArea.scrollTop = messagesArea.scrollHeight;
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
