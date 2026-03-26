# FunChat Backend 2026

Express + Socket.IO backend for random chat/video matching.

## Structure
- `src/server.js` server entry
- `src/routes` REST endpoints
- `src/sockets` socket handlers
- `src/services` matching logic
- `src/store` in-memory state
- `src/utils` helpers

## Features
- Separate chat/video queues
- Random matching
- Real-time messaging
- WebRTC signaling relay (offer/answer/ice-candidate)
- Reports + basic admin moderation endpoints

## Run
```
cd funchat_backend_2026
npm install
npm run dev
```

## Env
Copy `.env.example` to `.env` and adjust if needed.
