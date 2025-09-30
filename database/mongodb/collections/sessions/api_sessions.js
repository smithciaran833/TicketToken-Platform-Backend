// API Sessions Collection with TTL Index
// Manages API key sessions with automatic cleanup

db.createCollection("api_sessions");

// Add TTL index for session expiry
db.api_sessions.createIndex(
    { "lastAccessTime": 1 }, 
    { 
        expireAfterSeconds: 86400,  // 24 hours
        name: "api_session_ttl_idx"
    }
);

// API session indexes
db.api_sessions.createIndex({ "apiKey": 1 }, { name: "api_key_idx" });
db.api_sessions.createIndex({ "venueId": 1 }, { name: "venue_id_idx" });
