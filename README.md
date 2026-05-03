# Ephemeral Chat Rooms 💬🔒

A sleek, modern, and highly secure real-time chat application built for privacy. Messages and files are End-to-End Encrypted (E2EE) and completely ephemeral—no database, no permanent storage, and zero traces left behind.

## ✨ Features

- **End-to-End Encryption (E2EE)**: Built using Web Crypto API (`AES-GCM`). Your messages and files are encrypted on your device and can only be decrypted by people in your room. The server never sees your plaintext data.
- **Zero-Database Architecture**: The backend uses purely in-memory state. Once a room expires or all users leave, the data is gone forever.
- **Burn-on-Read Messages (🔥)**: Send highly sensitive messages or files that remain masked until the recipient explicitly clicks them. Once clicked, a countdown timer starts, and the message disappears permanently when it hits zero.
- **Customizable Message Lifespan**: Set self-destruct timers on your messages (5s, 10s, 30s, or 60s).
- **Ephemeral Rooms**: Rooms have strict expiry times (1h, 12h, or 24h). Once the timer is up, the room is destroyed.
- **File Sharing**: Share files (up to 5MB) instantly and securely. Images are displayed inline, while other files can be downloaded—all fully E2EE and supporting Burn-on-Read.
- **Typing Indicators & Live Member Counts**: Real-time presence updates using Socket.io.
- **Rate Limiting**: Built-in protections against spamming messages or files.
- **Modern, Responsive UI**: A beautiful glassmorphic design with dynamic orb backgrounds, smooth animations, and a mobile-friendly layout.

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher recommended)
- npm

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Rhoit2512/ephemeral-chat-rooms.git
   cd ephemeral-chat-rooms
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## 🔒 Security Model

- **Room Codes**: A random 6-character room code is generated when creating a room. 
- **Key Derivation**: The room code is passed through `PBKDF2` to derive a strong 256-bit `AES-GCM` encryption key locally in the browser. 
- **Room Hashes**: A `SHA-256` hash of the room code is sent to the server to identify the room. The server never receives the actual room code, meaning the server cannot derive the encryption key.
- **Session Expiry**: Disconnecting from the server immediately ends your session. Re-joining requires a brief grace period or explicit reconnection.

## 🛠️ Technology Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Backend**: Node.js, Express
- **Real-time Communication**: Socket.io
- **Cryptography**: Web Crypto API

## 📝 License

This project is open-source and available under the [MIT License](LICENSE).
