-- Automatic Audit Logging Function
-- Tracks all changes to sensitive tables

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    audit_user_id UUID;
    old_data JSONB;
    new_data JSONB;
    changed_fields TEXT[];
BEGIN
    -- Get the user ID from context (set by application)
    BEGIN
        audit_user_id := current_setting('app.current_user_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        audit_user_id := NULL;
    END;

    -- Prepare old and new data
    IF TG_OP = 'DELETE' THEN
        old_data := to_jsonb(OLD);
        new_data := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
        
        -- Calculate changed fields
        SELECT array_agg(key) INTO changed_fields
        FROM jsonb_each(old_data)
        WHERE old_data->key IS DISTINCT FROM new_data->key;
    ELSE -- INSERT
        old_data := NULL;
        new_data := to_jsonb(NEW);
    END IF;

    -- Remove sensitive fields from audit log
    IF old_data IS NOT NULL THEN
        old_data := old_data - 'password_hash' - 'totp_secret';
    END IF;
    IF new_data IS NOT NULL THEN
        new_data := new_data - 'password_hash' - 'totp_secret';
    END IF;

    -- Insert audit record
    INSERT INTO audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        before_data,
        after_data,
        changed_fields,
        ip_address,
        user_agent
    ) VALUES (
        audit_user_id,
        TG_OP::audit_action,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id)::TEXT,
        old_data,
        new_data,
        changed_fields,
        current_setting('app.client_ip', true),
        current_setting('app.user_agent', true)
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
