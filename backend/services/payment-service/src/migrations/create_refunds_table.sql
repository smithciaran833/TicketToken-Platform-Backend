CREATE TABLE IF NOT EXISTS refunds (
    id VARCHAR(255) PRIMARY KEY,
    payment_intent_id VARCHAR(255),
    amount DECIMAL(10,2),
    status VARCHAR(50),
    reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
