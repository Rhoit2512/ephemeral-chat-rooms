# Project Context: Ephemeral Real-time Chat Application

## High-Level Overview
This project is a privacy-focused, ephemeral real-time chat application. It allows users to create or join private chat rooms using auto-generated secret codes. It operates on a **stateless, server-side memory-only architecture**, meaning no chat history or user data is persistently stored in a database. All messages and files self-destruct locally after a user-defined duration.

## Technology Stack
*   **Backend:** Node.js, Express.js
*   **Real-time Communication:** Socket.io
*   **Frontend:** Vanilla HTML5, CSS3, Vanilla JavaScript (No frameworks like React or Vue).
*   **Styling:** Custom CSS with a "Midnight Emerald" dark mode theme featuring glassmorphism and CSS animations (floating background orbs).

## Core Features & Logic
1.  **Room Management:**
    *   Users can "Create a Room" (auto-generates a 6-character uppercase alphanumeric code) or "Join a Room" using an existing code and a nickname.
    *   Rooms are handled entirely by `socket.io`'s built-in room capabilities (`socket.join(currentRoom)`).
2.  **Ephemeral Messaging:**
    *   Messages are broadcasted via WebSockets. 
    *   A custom feature allows the sender to dictate the "lifespan" of a message (5s, 10s, 30s, or 60s) via a dropdown in the UI. 
    *   The duration is sent to the server and broadcasted to clients. The client-side DOM handles rendering a circular SVG countdown timer and permanently removing the DOM element when the timer hits zero.
3.  **File Sharing:**
    *   Users can upload files up to 5MB. 
    *   Files are converted to `Base64` strings via `FileReader` on the client and sent directly over the Socket.io connection.
4.  **Zero Database Dependency:**
    *   While there may be a legacy `chat_users.db` file in the repository, the current architecture explicitly avoids it to ensure absolute privacy. Messages exist only in the DOM of active clients.
5.  **User Interface:**
    *   Features a responsive layout with a toggleable sidebar for mobile.
    *   Live online user count per room.
    *   System messages broadcasted when users join or leave.

## File Structure
*   `server.js`: The backend entry point. Configures Express static serving and handles all Socket.io event listeners (`join_room`, `chat_message`, `chat_file`, `logout`, `disconnect`).
*   `public/index.html`: The sole HTML file containing the Join Screen and Chat Screen.
*   `public/style.css`: Contains all styling, CSS variables for the theme, and keyframe animations for UI components.
*   `public/app.js`: The frontend controller. Handles DOM interactions, Socket.io emissions, file reading, and the custom countdown timer logic for message destruction.
*   `package.json`: Contains project metadata and dependencies (`express` and `socket.io`).
