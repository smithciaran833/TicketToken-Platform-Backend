-- Security Helper Functions

-- Check password strength
CREATE OR REPLACE FUNCTION check_password_strength(password TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Minimum 12 characters
    IF length(password) < 12 THEN
        RAISE EXCEPTION 'Password must be at least 12 characters';
    END IF;
    
    -- Must contain uppercase
    IF NOT (password ~ '[A-Z]') THEN
        RAISE EXCEPTION 'Password must contain at least one uppercase letter';
    END IF;
    
    -- Must contain lowercase
    IF NOT (password ~ '[a-z]') THEN
        RAISE EXCEPTION 'Password must contain at least one lowercase letter';
    END IF;
    
    -- Must contain number
    IF NOT (password ~ '[0-9]') THEN
        RAISE EXCEPTION 'Password must contain at least one number';
    END IF;
    
    -- Must contain special character
    IF NOT (password ~ '[!@#$%^&*(),.?":{}|<>]') THEN
        RAISE EXCEPTION 'Password must contain at least one special character';
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Generate secure random token
CREATE OR REPLACE FUNCTION generate_secure_token(length INTEGER DEFAULT 32)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(length), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Check for suspicious activity patterns
CREATE OR REPLACE FUNCTION check_suspicious_activity(
    user_id UUID,
    action_type TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    recent_actions INTEGER;
    velocity_threshold INTEGER;
BEGIN
    -- Define thresholds based on action type
    velocity_threshold := CASE action_type
        WHEN 'login_attempt' THEN 5
        WHEN 'password_reset' THEN 3
        WHEN 'ticket_purchase' THEN 10
        WHEN 'payment_method_add' THEN 5
        ELSE 20
    END;
    
    -- Count recent actions (last 5 minutes)
    SELECT COUNT(*) INTO recent_actions
    FROM audit_logs
    WHERE audit_logs.user_id = check_suspicious_activity.user_id
    AND action = action_type
    AND created_at > NOW() - INTERVAL '5 minutes';
    
    -- Return true if suspicious
    RETURN recent_actions >= velocity_threshold;
END;
$$ LANGUAGE plpgsql;
