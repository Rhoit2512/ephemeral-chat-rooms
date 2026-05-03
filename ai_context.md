# Project Context: Ephemeral Real-time Chat Application

## High-Level Overview
This project is a highly secure, privacy-focused, ephemeral real-time chat application. It allows users to create or join private chat rooms using shareable secret codes. It operates on a **stateless, server-side memory-only architecture**, meaning no chat history or user data is persistently stored in a database. All messages and files are End-to-End Encrypted (E2EE) and self-destruct locally after a user-defined duration.

## Technology Stack
*   **Backend:** Node.js, Express.js
*   **Real-time Communication:** Socket.io
*   **Frontend:** Vanilla HTML5, CSS3, Vanilla JavaScript (`app.js`, `style.css`, `index.html`).
*   **Cryptography:** Web Crypto API (`crypto.subtle`) natively built into the browser.

## Core Features & Technical Implementation

### 1. End-to-End Encryption (E2EE)
*   **Key Derivation:** The "Room Code" acts as a master password. `app.js` uses PBKDF2 to derive a 256-bit AES-GCM symmetric key from this Room Code.
*   **Blind Server:** The client hashes the Room Code using SHA-256 and sends *only the hash* to the server to act as the `socket.io` room ID. The server never knows the plaintext Room Code.
*   **Payloads:** Every message text and base64 file string is encrypted with AES-GCM before emitting to the server. The server simply relays the ciphertext.

### 2. Ephemeral Timers & Burn-on-Read
*   **Lifespans:** Senders select a lifespan (5s, 10s, 30s, 60s). The client DOM renders a live SVG circular countdown. Upon reaching zero, the message is permanently removed from the DOM.
*   **Burn-on-Read:** Senders can toggle a 🔥 checkbox. Receivers will see a blurred message. The lifespan countdown *does not start* until the receiver clicks to reveal the message.

### 3. Server State & Security (server.js)
*   **Rate Limiting:** A custom token-bucket tracks message timestamps per `socket.id`. If a user exceeds 5 messages/files per second, the server drops the requests and warns them.
*   **File Validation:** Because payloads are E2EE ciphertext, the server cannot check magic bytes. Instead, it enforces a strict length validation on the payload (max ~7MB base64 string, representing a ~5MB file limit).
*   **Nickname Locking:** The server maintains a `roomsState` Map (`roomId -> Map(nickname -> sessionId)`). No two users can have the same nickname in a room.
*   **Room Expiry:** Rooms have an absolute lifespan (1h, 12h, 24h). The server sets a `setTimeout` upon creation and kicks everyone out, deleting the memory state when time is up.

### 4. Session Grace Period (Anti-Spam)
*   When a user connects, the server issues a UUID `sessionId` stored in the browser's `sessionStorage`.
*   If a user disconnects (e.g., refreshes the page), the server waits **15 seconds** before broadcasting "User left".
*   If the user reconnects within those 15 seconds passing their `sessionId`, the server recognizes them, cancels the timer, and silently re-adds them to the room, bypassing the Nickname Lock and preventing notification spam.

### 5. UI/UX Features
*   **URL Hash Sharing:** The app parses `window.location.hash` on load. Links like `http://localhost:3000/#ABC123` will automatically switch the UI to the Join tab and pre-fill the room code.
*   **Typing Indicators:** `app.js` listens to input/blur events with a 2-second debounce, emitting `typing` events that render a subtle "Alice is typing..." indicator.

## File Structure
*   `server.js`: Node.js/Express entry point. Manages all Socket.io routing, rate limiting, room state maps, and grace period timeouts.
*   `public/index.html`: The monolithic UI containing the Join Screen and Chat Screen.
*   `public/style.css`: Contains all styling, Midnight Emerald theme variables, Burn-on-Read blur effects, and animations.
*   `public/app.js`: The frontend controller. Handles Web Crypto logic, DOM manipulation, countdown SVG logic, and Socket.io emission.
