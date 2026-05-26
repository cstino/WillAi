-- =========================================================================
-- WILL AI v2 — SEMANTIC MEMORY SCHEMA SETUP
-- Run this script in the Supabase SQL Editor.
-- =========================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Rename old sent_notifications table to keep a backup
ALTER TABLE IF EXISTS sent_notifications RENAME TO sent_notifications_old;

-- ============================================
-- TABELLA: memories
-- Unica casa di tutto ciò che Will sa.
-- ADD-only: non si aggiornano mai, non si cancellano mai
-- (tranne cancellazione esplicita dall'utente).
-- ============================================

CREATE TABLE IF NOT EXISTS memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Contenuto
  content TEXT NOT NULL,
  embedding VECTOR(768),
  content_fts TSVECTOR,
  
  -- Tipo (semi-strutturato)
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'event',       -- data fissa ("Vacanza a Napoli 2-4 giugno")
    'reminder',    -- notifica a un orario ("Ricordami di chiamare Franco domani alle 10")
    'fact',        -- fatto su di me ("Ho un Audi Q5")
    'preference',  -- preferenza ("Mi piace il viola")
    'idea',        -- idea vaga ("Magari un viaggio in Giappone")
    'knowledge'    -- conoscenza atemporale (ricetta, link, info)
  )),
  
  -- Componente temporale (solo per event/reminder)
  trigger_at TIMESTAMPTZ,
  trigger_end TIMESTAMPTZ,
  recurrence TEXT,               -- "weekly:monday:09:00" o null
  notified BOOLEAN DEFAULT false,
  
  -- Metadati
  tags TEXT[] DEFAULT '{}',
  importance SMALLINT DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  relevance_score SMALLINT DEFAULT 100 CHECK (relevance_score BETWEEN 0 AND 100),
  
  -- Origine
  source TEXT DEFAULT 'app_text' CHECK (source IN (
    'app_voice', 'app_text', 'telegram_text', 'telegram_voice',
    'heartbeat',    -- estratto dal heartbeat notturno
    'extraction',   -- estratto dalla pipeline asincrona post-risposta
    'telegram',
    'app'
  )),
  
  -- Tempi
  created_at TIMESTAMPTZ DEFAULT now(),
  last_recalled_at TIMESTAMPTZ
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_memories_fts ON memories USING GIN (content_fts);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_trigger ON memories(trigger_at) WHERE trigger_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_relevance ON memories(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);

-- Trigger auto-update per tsvector (full-text search in italiano)
CREATE OR REPLACE FUNCTION update_memories_fts() RETURNS TRIGGER AS $$
BEGIN
  NEW.content_fts := to_tsvector('italian', NEW.content || ' ' || coalesce(array_to_string(NEW.tags, ' '), ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_memories_fts
BEFORE INSERT OR UPDATE ON memories
FOR EACH ROW EXECUTE FUNCTION update_memories_fts();

-- RLS aperta (uso personale, no auth)
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON memories;
CREATE POLICY "allow_all" ON memories FOR ALL USING (true) WITH CHECK (true);


-- ============================================
-- TABELLA: user_profile (singleton — una sola riga)
-- Profilo dedotto + regole procedurali.
-- Aggiornato dal heartbeat e su richiesta.
-- ============================================

CREATE TABLE IF NOT EXISTS user_profile (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Profilo semantico (chi è Cristiano)
  summary TEXT,
  
  -- Fatti e preferenze stabili (dedotti dal heartbeat)
  facts JSONB DEFAULT '[]'::jsonb,
  preferences JSONB DEFAULT '[]'::jsonb,
  
  -- Memoria procedurale (come Will deve comportarsi)
  procedural_rules JSONB DEFAULT '[]'::jsonb,
  
  -- Gestione notizie pianificate
  news_topics TEXT[] DEFAULT '{}',
  news_delivery_time TIME DEFAULT '07:30:00',
  
  last_heartbeat_at TIMESTAMPTZ,
  memories_since_last_profile_update INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON user_profile;
CREATE POLICY "allow_all" ON user_profile FOR ALL USING (true) WITH CHECK (true);

-- Insert singleton row if not exists
INSERT INTO user_profile (id, summary) 
VALUES ('00000000-0000-0000-0000-000000000000', NULL)
ON CONFLICT (id) DO NOTHING;


-- ============================================
-- TABELLA: chat_messages (memoria episodica)
-- Storico completo della conversazione.
-- Mostrato nella UI chat, persistente tra sessioni.
-- ============================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  
  -- Per UI ricca
  message_type TEXT DEFAULT 'text' CHECK (message_type IN (
    'text',             -- bolla normale
    'action_confirm',   -- "✓ Salvato!"
    'memory_card',      -- card evento/nota creato
    'memory_list',      -- lista di memorie trovate
    'greeting',         -- saluto dinamico all'apertura
    'error'             -- errore
  )),
  
  -- Riferimenti a memorie coinvolte
  related_memory_ids UUID[] DEFAULT '{}',
  
  source TEXT DEFAULT 'app_text' CHECK (source IN (
    'app_voice', 'app_text', 'telegram_text', 'telegram_voice'
  )),
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON chat_messages;
CREATE POLICY "allow_all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);


-- ============================================
-- TABELLA: sent_notifications
-- ============================================

CREATE TABLE IF NOT EXISTS sent_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sent_notif_unique 
  ON sent_notifications(memory_id, notification_type) 
  WHERE notification_type = 'pre_event';

ALTER TABLE sent_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON sent_notifications;
CREATE POLICY "allow_all" ON sent_notifications FOR ALL USING (true) WITH CHECK (true);


-- ============================================
-- FUNZIONI SQL
-- ============================================

-- Ricerca ibrida: semantic + full-text + recency
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding VECTOR(768),
  query_text TEXT,
  match_count INT DEFAULT 15,
  min_relevance INT DEFAULT 20,
  filter_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  trigger_at TIMESTAMPTZ,
  trigger_end TIMESTAMPTZ,
  tags TEXT[],
  importance SMALLINT,
  relevance_score SMALLINT,
  created_at TIMESTAMPTZ,
  last_recalled_at TIMESTAMPTZ,
  semantic_score FLOAT,
  keyword_score FLOAT,
  recency_score FLOAT,
  combined_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id, m.content, m.memory_type, m.trigger_at, m.trigger_end,
    m.tags, m.importance, m.relevance_score, m.created_at, m.last_recalled_at,
    
    -- Segnale 1: similarità semantica (0-1)
    (1 - (m.embedding <=> query_embedding))::FLOAT AS semantic_score,
    
    -- Segnale 2: keyword match BM25-style (0-1 normalizzato)
    COALESCE(ts_rank_cd(m.content_fts, plainto_tsquery('italian', query_text)), 0)::FLOAT AS keyword_score,
    
    -- Segnale 3: recency boost (1.0 per oggi, decade esponenzialmente)
    EXP(-0.05 * EXTRACT(EPOCH FROM (now() - m.created_at)) / 86400)::FLOAT AS recency_score,
    
    -- Score combinato pesato
    (
      0.55 * (1 - (m.embedding <=> query_embedding)) +
      0.25 * COALESCE(ts_rank_cd(m.content_fts, plainto_tsquery('italian', query_text)), 0) +
      0.20 * EXP(-0.05 * EXTRACT(EPOCH FROM (now() - m.created_at)) / 86400)
    ) * (m.relevance_score::FLOAT / 100.0) AS combined_score
    
  FROM memories m
  WHERE 
    m.relevance_score >= min_relevance
    AND (filter_type IS NULL OR m.memory_type = filter_type)
    AND m.embedding IS NOT NULL
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;


-- Recall: rinfresca le memorie usate
CREATE OR REPLACE FUNCTION recall_memories(memory_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE memories
  SET 
    relevance_score = LEAST(100, relevance_score + 20),
    last_recalled_at = now()
  WHERE id = ANY(memory_ids);
END;
$$;


-- Decay: chiamato dal heartbeat notturno
CREATE OR REPLACE FUNCTION decay_relevance_scores()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Fact e preference: stabili, decadono lentissimamente
  UPDATE memories
  SET relevance_score = GREATEST(0, relevance_score - 1)
  WHERE memory_type IN ('fact', 'preference')
    AND (last_recalled_at IS NULL OR last_recalled_at < now() - INTERVAL '7 days');
  
  -- Event passati: decadono più velocemente
  UPDATE memories
  SET relevance_score = GREATEST(0, relevance_score - 2)
  WHERE memory_type = 'event' 
    AND trigger_at IS NOT NULL
    AND COALESCE(trigger_end, trigger_at) < now();
  
  -- Reminder notificati: decadono rapidamente
  UPDATE memories
  SET relevance_score = GREATEST(0, relevance_score - 3)
  WHERE memory_type = 'reminder' AND notified = true;
  
  -- Knowledge e idea: decadono moderatamente
  UPDATE memories
  SET relevance_score = GREATEST(0, relevance_score - 1)
  WHERE memory_type IN ('knowledge', 'idea')
    AND (last_recalled_at IS NULL OR last_recalled_at < now() - INTERVAL '3 days');
END;
$$;


-- Increment memories counter
CREATE OR REPLACE FUNCTION increment_memories_counter()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE user_profile
  SET memories_since_last_profile_update = memories_since_last_profile_update + 1;
END;
$$;


-- =========================================================================
-- CONFIGURAZIONE CRON JOB PER L'HEARTBEAT NOTTURNO
-- Sostituisci <IL_TUO_SERVICE_ROLE_KEY> con la chiave "service_role" del tuo progetto
-- (la trovi su Supabase in Settings -> API -> Project API keys).
-- =========================================================================

SELECT cron.schedule(
  'will-heartbeat',
  '0 3 * * *',  -- Esegue ogni notte alle 03:00
  $$
  SELECT net.http_post(
    url := 'https://gscpwsgxymbeawbcmrmy.supabase.co/functions/v1/heartbeat',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <IL_TUO_SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

