-- Create application user for proper RLS testing

-- Create a role for the application if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tickettoken_app') THEN
        CREATE ROLE tickettoken_app WITH LOGIN PASSWORD 'AppPass123!';
    END IF;
END
$$;

-- Grant necessary permissions
GRANT CONNECT ON DATABASE tickettoken_db TO tickettoken_app;
GRANT USAGE ON SCHEMA public TO tickettoken_app;

-- Grant permissions on all existing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tickettoken_app;

-- Grant permissions on sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tickettoken_app;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO tickettoken_app;

-- Ensure future tables also get permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tickettoken_app;
    
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT USAGE, SELECT ON SEQUENCES TO tickettoken_app;

