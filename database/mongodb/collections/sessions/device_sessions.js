// Device Sessions Collection with TTL Index
// Tracks device-specific sessions with automatic expiry

db.createCollection("device_sessions");

// Add TTL index for session expiry
db.device_sessions.createIndex(
    { "lastAccessTime": 1 }, 
    { 
        expireAfterSeconds: 86400,  // 24 hours
        name: "device_session_ttl_idx"
    }
);

// Device tracking indexes
db.device_sessions.createIndex({ "deviceId": 1 }, { name: "device_id_idx" });
db.device_sessions.createIndex({ "userId": 1 }, { name: "user_id_idx" });
db.device_sessions.createIndex({ "platform": 1 }, { name: "platform_idx" });
