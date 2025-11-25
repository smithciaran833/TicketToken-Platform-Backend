-- Create customer tables for GDPR compliance
CREATE TABLE IF NOT EXISTS customer_profiles (
    customer_id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255),
    name VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_preferences (
    customer_id VARCHAR(255) PRIMARY KEY,
    marketing_emails BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT FALSE,
    push_notifications BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_analytics (
    customer_id VARCHAR(255) PRIMARY KEY,
    total_purchases INTEGER DEFAULT 0,
    total_spent DECIMAL(10,2) DEFAULT 0,
    last_purchase_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fix the unique constraint for tax_reporting_requirements
-- First, drop the existing constraint if it exists
ALTER TABLE tax_reporting_requirements 
DROP CONSTRAINT IF EXISTS unique_reporting;

-- Now add it properly with coalesce for nullable columns
CREATE UNIQUE INDEX unique_reporting_idx ON tax_reporting_requirements 
(COALESCE(customer_id, ''), COALESCE(venue_id, ''), year, form_type);

-- Add some test customer data
INSERT INTO customer_profiles (customer_id, email, name, phone) VALUES
('cust_123', 'test@example.com', 'Test Customer', '555-0123'),
('cust_456', 'jane@example.com', 'Jane Doe', '555-0456')
ON CONFLICT (customer_id) DO NOTHING;
