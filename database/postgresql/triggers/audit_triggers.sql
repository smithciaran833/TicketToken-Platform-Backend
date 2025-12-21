-- Apply audit triggers to critical tables

-- Users table
DROP TRIGGER IF EXISTS audit_users_trigger ON users;
CREATE TRIGGER audit_users_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Venues table  
DROP TRIGGER IF EXISTS audit_venues_trigger ON venues;
CREATE TRIGGER audit_venues_trigger
    AFTER INSERT OR UPDATE OR DELETE ON venues
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Financial transactions
DROP TRIGGER IF EXISTS audit_transactions_trigger ON payment_transactions;
CREATE TRIGGER audit_transactions_trigger
    AFTER INSERT OR UPDATE OR DELETE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Tickets (for fraud prevention)
DROP TRIGGER IF EXISTS audit_tickets_trigger ON tickets;
CREATE TRIGGER audit_tickets_trigger
    AFTER INSERT OR UPDATE OR DELETE ON tickets
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- KYC records
CREATE TRIGGER audit_kyc_trigger
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Payment methods (PCI compliance)
DROP TRIGGER IF EXISTS audit_payment_methods_trigger ON payment_methods;
CREATE TRIGGER audit_payment_methods_trigger
    AFTER INSERT OR UPDATE OR DELETE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
