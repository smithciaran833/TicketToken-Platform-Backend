#!/bin/bash
# Add TTL indexes to MongoDB session collections

set -euo pipefail

echo "Creating MongoDB session collection files with TTL indexes..."

# Ensure MongoDB collections directory exists
mkdir -p database/mongodb/collections/sessions

# Create user_sessions collection with TTL
cat > database/mongodb/collections/sessions/user_sessions.js << 'JS'
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
JS

# Create device_sessions collection with TTL
cat > database/mongodb/collections/sessions/device_sessions.js << 'JS'
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
JS

# Create api_sessions collection with TTL
cat > database/mongodb/collections/sessions/api_sessions.js << 'JS'
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
JS

# Create websocket_sessions collection with TTL
cat > database/mongodb/collections/sessions/websocket_sessions.js << 'JS'
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
JS

echo "MongoDB session collections with TTL indexes created!"
