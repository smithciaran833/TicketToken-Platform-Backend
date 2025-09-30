-- Function to automatically create monthly partitions
-- Run this monthly via cron or pg_cron

CREATE OR REPLACE FUNCTION create_monthly_partitions(
    p_schema_name TEXT,
    p_table_name TEXT,
    p_months_ahead INT DEFAULT 3
)
RETURNS void AS $$
DECLARE
    v_start_date DATE;
    v_end_date DATE;
    v_partition_name TEXT;
    v_sql TEXT;
BEGIN
    -- Create partitions for next N months
    FOR i IN 1..p_months_ahead LOOP
        v_start_date := DATE_TRUNC('month', CURRENT_DATE + (i || ' months')::INTERVAL);
        v_end_date := v_start_date + INTERVAL '1 month';
        v_partition_name := p_table_name || '_' || TO_CHAR(v_start_date, 'YYYY_MM');
        
        -- Check if partition exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE schemaname = p_schema_name 
            AND tablename = v_partition_name
        ) THEN
            -- Create partition
            v_sql := format(
                'CREATE TABLE %I.%I PARTITION OF %I.%I FOR VALUES FROM (%L) TO (%L)',
                p_schema_name, v_partition_name,
                p_schema_name, p_table_name,
                v_start_date, v_end_date
            );
            EXECUTE v_sql;
            RAISE NOTICE 'Created partition: %.%', p_schema_name, v_partition_name;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule monthly partition creation
-- Example calls:
-- SELECT create_monthly_partitions('core', 'audit_logs', 3);
-- SELECT create_monthly_partitions('tickets', 'tickets', 3);
