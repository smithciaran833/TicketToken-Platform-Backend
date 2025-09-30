// User Sessions Collection with TTL Index
// Automatically expires sessions after 24 hours of inactivity

db.createCollection("user_sessions");

// Add TTL index for session expiry
db.user_sessions.createIndex(
    { "lastAccessTime": 1 }, 
    { 
        expireAfterSeconds: 86400,  // 24 hours
        name: "session_ttl_idx"
    }
);

// Additional indexes for performance
db.user_sessions.createIndex({ "userId": 1 }, { name: "user_id_idx" });
db.user_sessions.createIndex({ "sessionToken": 1 }, { name: "session_token_idx" });
db.user_sessions.createIndex({ "ipAddress": 1 }, { name: "ip_address_idx" });
db.user_sessions.createIndex({ "userAgent": 1 }, { name: "user_agent_idx" });

// Compound index for user session queries
db.user_sessions.createIndex(
    { "userId": 1, "lastAccessTime": -1 }, 
    { name: "user_recent_sessions_idx" }
);
