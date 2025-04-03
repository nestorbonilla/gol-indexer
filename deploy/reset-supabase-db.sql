DO $$
DECLARE
    schema_name text;
    table_name text;
BEGIN
    -- Part 1: Drop custom schemas (excluding Supabase ones)
    RAISE NOTICE 'Starting to drop custom schemas...';
    
    FOR schema_name IN 
        SELECT n.nspname 
        FROM pg_namespace n
        JOIN pg_roles r ON n.nspowner = r.oid
        WHERE n.nspname NOT IN ('public', 'auth', 'storage', 'extensions', 'supabase_migrations', 
                               'graphql', 'supabase_functions', 'realtime', 'vault', 'pgbouncer', 
                               'information_schema', 'graphql_public')
        AND n.nspname NOT LIKE 'pg_%'
        AND r.rolname = current_user
    LOOP
        EXECUTE 'DROP SCHEMA IF EXISTS ' || quote_ident(schema_name) || ' CASCADE';
        RAISE NOTICE 'Dropped schema: %', schema_name;
    END LOOP;
    
    -- Part 2: Drop tables in public schema only
    RAISE NOTICE 'Starting to drop tables in public schema...';
    
    FOR table_name IN 
        SELECT tablename 
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tableowner = current_user
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(table_name) || ' CASCADE';
        RAISE NOTICE 'Dropped table: %', table_name;
    END LOOP;
    
    RAISE NOTICE 'Database reset complete.';
END
$$;