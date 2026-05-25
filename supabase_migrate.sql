-- =========================================================================
-- WILL AI v2 — DATA MIGRATION SCRIPT
-- Run this in the Supabase SQL Editor AFTER running supabase_setup.sql.
-- =========================================================================

-- 1. Migra events → memories
INSERT INTO memories (content, memory_type, trigger_at, trigger_end, source, created_at, importance)
SELECT 
  title || COALESCE(' — ' || description, '') || COALESCE(' a ' || location, ''),
  'event',
  start_date,
  end_date,
  CASE 
    WHEN source = 'telegram' THEN 'telegram_text' 
    WHEN source = 'app' THEN 'app_text' 
    ELSE COALESCE(source, 'app_text') 
  END,
  created_at,
  3
FROM events;

-- 2. Migra notes → memories
INSERT INTO memories (content, memory_type, tags, source, created_at, importance)
SELECT
  COALESCE(title || ': ', '') || content,
  'knowledge',
  tags,
  CASE 
    WHEN source = 'telegram' THEN 'telegram_text' 
    WHEN source = 'app' THEN 'app_text' 
    ELSE COALESCE(source, 'app_text') 
  END,
  created_at,
  3
FROM notes;

-- 3. Nota: Dopo aver eseguito questo script, avvia lo script Node.js per
-- generare gli embeddings per i dati migrati:
-- npm run migrate-embeddings (oppure: node scripts/generate_embeddings.js)
