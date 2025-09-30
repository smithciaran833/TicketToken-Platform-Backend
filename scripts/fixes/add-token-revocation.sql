-- Create revoked tokens table
CREATE TABLE IF NOT EXISTS revoked_tokens (
    token_jti VARCHAR(255) PRIMARY KEY,
    user_id UUID,
    revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(255),
    expires_at TIMESTAMP -- When the token would have naturally expired
);

CREATE INDEX idx_revoked_tokens_expires ON revoked_tokens(expires_at);
