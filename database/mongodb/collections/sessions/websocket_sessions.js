// WebSocket Sessions Collection with TTL Index
// Real-time connection tracking with automatic cleanup

db.createCollection("websocket_sessions");

// Add TTL index for session expiry (shorter for websockets)
db.websocket_sessions.createIndex(
    { "lastAccessTime": 1 }, 
    { 
        expireAfterSeconds: 3600,  // 1 hour for websockets
        name: "websocket_session_ttl_idx"
    }
);

// WebSocket specific indexes
db.websocket_sessions.createIndex({ "connectionId": 1 }, { name: "connection_id_idx" });
db.websocket_sessions.createIndex({ "userId": 1 }, { name: "user_id_idx" });
db.websocket_sessions.createIndex({ "roomId": 1 }, { name: "room_id_idx" });
