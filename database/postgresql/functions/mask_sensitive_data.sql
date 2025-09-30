-- Data Masking Functions for PII Protection

-- Mask email addresses
CREATE OR REPLACE FUNCTION mask_email(email TEXT)
RETURNS TEXT AS $$
BEGIN
    IF email IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN 
        CASE 
            WHEN position('@' IN email) > 3 THEN
                left(email, 2) || repeat('*', position('@' IN email) - 3) || 
                substring(email from position('@' IN email))
            ELSE
                repeat('*', position('@' IN email) - 1) || 
                substring(email from position('@' IN email))
        END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Mask phone numbers
CREATE OR REPLACE FUNCTION mask_phone(phone TEXT)
RETURNS TEXT AS $$
BEGIN
    IF phone IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN regexp_replace(phone, '(\d{3})(\d+)(\d{4})', '\1-***-\3');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Mask SSN/Tax ID
CREATE OR REPLACE FUNCTION mask_tax_id(tax_id TEXT)
RETURNS TEXT AS $$
BEGIN
    IF tax_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN '***-**-' || right(tax_id, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Mask credit card (for logs only - we don't store cards)
CREATE OR REPLACE FUNCTION mask_card_number(card TEXT)
RETURNS TEXT AS $$
BEGIN
    IF card IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN repeat('*', length(card) - 4) || right(card, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create secure views using masking
CREATE OR REPLACE VIEW users_masked AS
SELECT 
    id,
    mask_email(email) as email,
    username,
    first_name,
    last_name,
    mask_phone(phone) as phone,
    account_status,
    created_at
FROM users;

COMMENT ON VIEW users_masked IS 'Masked view of users table for support/reporting use';
