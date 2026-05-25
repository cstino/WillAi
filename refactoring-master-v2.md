# Refactoring Master v2 — Will diventa un vero assistente AI con memoria semantica

## Contesto

Will è funzionante: PWA glass-neon, voce/testo, bot Telegram, tabelle `events` e `notes` su Supabase, brain con Groq (Llama 3.3 70B). Ma è strutturalmente un parser di comandi → CRUD su tabelle rigide. **Non impara, non ricorda chi sono, non ragiona su di me.**

Questo refactoring trasforma Will in un assistente AI con **memoria persistente ispirata all'architettura Mem0 (aprile 2026)** e al framework cognitivo CoALA (Princeton, 2023). Dopo questo refactoring, Will:
- Ricorda qualsiasi cosa gli dica (non solo eventi/note)
- Cerca per significato, non per keyword
- Costruisce un profilo di chi sono nel tempo
- Migliora ad ogni conversazione (ogni interazione arricchisce la memoria)
- Conversa naturalmente in una UI chat

Il design glassmorphism-neon esistente **NON si tocca**. Si refactora il cervello, il database, e si trasforma la home in una chat.

---

## ⚠️ Regola d'oro del refactoring

Tutto avviene su un branch Git separato: **`refactor/semantic-memory`**

Le tabelle vecchie (`events`, `notes`, `conversations`, `sent_notifications`) restano come backup. Le nuove tabelle convivono in parallelo. Solo alla fine, dopo migrazione e verifica, si droppano le vecchie.

```bash
git checkout -b refactor/semantic-memory
```

---

## 🛠️ Skill Antigravity

Repository: https://github.com/sickn33/antigravity-awesome-skills

```bash
npx antigravity-awesome-skills --antigravity
```

Skill da invocare per fase:
- **Fase A (Database):** `@database-design`, `@architecture`
- **Fase B (Brain):** `@llm-structured-output`, `@prompt-engineering`, `@gemini-api-dev`, `@error-handling-patterns`
- **Fase C (Heartbeat):** `@backend-dev-guidelines`, `@error-handling-patterns`
- **Fase D (UI Chat):** `@frontend-design`, `@frontend-ui-dark-ts`, `@tailwind-patterns`, `@core-components`
- **Fase F (Telegram):** `@backend-dev-guidelines`

---

## Architettura della memoria — Il modello mentale

Ispirata al framework CoALA e all'architettura Mem0 2026, la memoria di Will ha **quattro livelli**:

### 1. Memoria di lavoro (Working Memory)
- **Dove:** in-memory nell'app (React state) e nel contesto LLM
- **Cosa:** la conversazione corrente, le memorie recuperate per questa query, il profilo utente
- **Durata:** sessione corrente, poi viene salvata come chat persistente
- **Analogia:** la RAM del computer

### 2. Memoria episodica (Episodic Memory)
- **Dove:** tabella `chat_messages` su Supabase
- **Cosa:** ogni messaggio scambiato con Will, in ordine cronologico
- **Durata:** permanente
- **Uso:** ricostruire il contesto di una conversazione, fornire storico recente all'LLM
- **Analogia:** il diario — "cosa è successo quando"

### 3. Memoria semantica (Semantic Memory)
- **Dove:** tabella `memories` su Supabase con embedding vettoriali
- **Cosa:** fatti, preferenze, eventi, promemoria, idee, conoscenze — tutto ciò che Will sa di me
- **Durata:** permanente, ma con relevance decay nel tempo
- **Uso:** recuperata per similarità semantica + keyword + recency ad ogni conversazione
- **Analogia:** la conoscenza — "cosa è generalmente vero su Cristiano"

### 4. Memoria procedurale (Procedural Memory)
- **Dove:** campo `procedural_rules` nella tabella `user_profile`
- **Cosa:** regole comportamentali che Will impara su come interagire con me
- **Durata:** permanente, aggiornata dal heartbeat
- **Uso:** iniettata nel system prompt per adattare il tono e il comportamento
- **Analogia:** le abitudini — "come devo comportarmi con Cristiano"
- **Esempi:** "Cristiano preferisce risposte brevi", "quando dice 'segna' intende un evento", "non chiedergli conferma su cose ovvie"

---

## Pipeline a due fasi (pattern Mem0 2026)

Questo è il cambiamento architetturale più importante. La pipeline è **asincrona**: prima si risponde, poi si memorizza.

```
FASE 1 — SINCRONA (utente aspetta)
┌─────────────────────────────────────────────┐
│ Utente scrive/parla                         │
│         ↓                                    │
│ Genera embedding del messaggio               │
│         ↓                                    │
│ Recupera memorie rilevanti (top 10-15)       │
│ via ricerca ibrida:                          │
│   • Semantic search (embedding similarity)   │
│   • Full-text search (BM25 / tsvector)       │
│   • Recency boost (più recenti pesano di più)│
│         ↓                                    │
│ Carica: profilo + regole procedurali         │
│       + ultimi 10 messaggi chat              │
│         ↓                                    │
│ Chiama LLM con tutto il contesto             │
│         ↓                                    │
│ LLM risponde + dichiara eventuali azioni     │
│         ↓                                    │
│ Esegui azioni (crea memoria, ecc.)           │
│         ↓                                    │
│ Mostra risposta all'utente                   │
│ (+ leggi a voce se input vocale)             │
└─────────────────────────────────────────────┘

FASE 2 — ASINCRONA (utente NON aspetta)
┌─────────────────────────────────────────────┐
│ Dopo che la risposta è stata mostrata,       │
│ in background:                               │
│         ↓                                    │
│ Manda la coppia (messaggio utente +          │
│ risposta Will) a un secondo LLM call         │
│ con prompt di estrazione fatti               │
│         ↓                                    │
│ LLM estrae fatti atomici dalla conversazione │
│ Es: "Cristiano va a Napoli il 2-4 giugno"   │
│     "Cristiano vuole provare pasta alla norma"│
│         ↓                                    │
│ Per ogni fatto:                              │
│   • Genera embedding                         │
│   • Salva come nuova memoria (ADD-only)      │
│   • NON aggiornare/cancellare mai memorie    │
│     esistenti                                │
│         ↓                                    │
│ Aggiorna last_recalled_at sulle memorie      │
│ che sono state usate nella risposta           │
└─────────────────────────────────────────────┘
```

### Perché ADD-only (e non UPDATE/DELETE)?

Il pattern Mem0 2026 ha dimostrato che ADD-only è superiore:
- Preserva il contesto temporale ("prima preferiva il viola, poi è passato al rosso")
- Elimina la perdita di informazione da consolidazione prematura
- Per risolvere contraddizioni: ordina le memorie per `created_at DESC` e tratta la più recente come canonica
- La pulizia (dedup, archiviazione) avviene offline nel heartbeat, non in tempo reale

---

## PARTE 1 — Database

### Estensioni Supabase da attivare

Dashboard → Database → Extensions → abilitare:
- **`vector`** (pgvector)
- **`pg_cron`** (se non già attivo)
- **`pg_net`** (se non già attivo)

### Tabelle

```sql
-- ============================================
-- TABELLA: memories
-- Unica casa di tutto ciò che Will sa.
-- ADD-only: non si aggiornano mai, non si cancellano mai
-- (tranne cancellazione esplicita dall'utente).
-- ============================================

CREATE TABLE memories (
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
    'extraction'    -- estratto dalla pipeline asincrona post-risposta
  )),
  
  -- Tempi
  created_at TIMESTAMPTZ DEFAULT now(),
  last_recalled_at TIMESTAMPTZ
);

-- Indici
CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_memories_fts ON memories USING GIN (content_fts);
CREATE INDEX idx_memories_type ON memories(memory_type);
CREATE INDEX idx_memories_trigger ON memories(trigger_at) WHERE trigger_at IS NOT NULL;
CREATE INDEX idx_memories_relevance ON memories(relevance_score DESC);
CREATE INDEX idx_memories_created ON memories(created_at DESC);

-- Trigger auto-update per tsvector (full-text search in italiano)
CREATE FUNCTION update_memories_fts() RETURNS TRIGGER AS $$
BEGIN
  NEW.content_fts := to_tsvector('italian', NEW.content || ' ' || coalesce(array_to_string(NEW.tags, ' '), ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memories_fts
BEFORE INSERT OR UPDATE ON memories
FOR EACH ROW EXECUTE FUNCTION update_memories_fts();

-- RLS aperta (uso personale, no auth)
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON memories FOR ALL USING (true) WITH CHECK (true);


-- ============================================
-- TABELLA: user_profile (singleton — una sola riga)
-- Profilo dedotto + regole procedurali.
-- Aggiornato dal heartbeat e su richiesta.
-- ============================================

CREATE TABLE user_profile (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Profilo semantico (chi è Cristiano)
  summary TEXT,
  
  -- Fatti e preferenze stabili (dedotti dal heartbeat)
  facts JSONB DEFAULT '[]'::jsonb,
  preferences JSONB DEFAULT '[]'::jsonb,
  
  -- Memoria procedurale (come Will deve comportarsi)
  procedural_rules JSONB DEFAULT '[]'::jsonb,
  -- Esempio: [
  --   {"rule": "Cristiano preferisce risposte brevi e dirette", "confidence": 0.9},
  --   {"rule": "Quando dice 'segna' intende sempre un evento", "confidence": 0.85},
  --   {"rule": "Non chiedere conferma su cose ovvie", "confidence": 0.7}
  -- ]
  
  last_heartbeat_at TIMESTAMPTZ,
  memories_since_last_profile_update INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON user_profile FOR ALL USING (true) WITH CHECK (true);

INSERT INTO user_profile (summary) VALUES (NULL);


-- ============================================
-- TABELLA: chat_messages (memoria episodica)
-- Storico completo della conversazione.
-- Mostrato nella UI chat, persistente tra sessioni.
-- ============================================

CREATE TABLE chat_messages (
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

CREATE INDEX idx_chat_messages_created ON chat_messages(created_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);


-- ============================================
-- TABELLA: sent_notifications
-- ============================================

CREATE TABLE sent_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_sent_notif_unique 
  ON sent_notifications(memory_id, notification_type) 
  WHERE notification_type = 'pre_event';

ALTER TABLE sent_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON sent_notifications FOR ALL USING (true) WITH CHECK (true);
```

### Funzioni SQL

```sql
-- ============================================
-- Ricerca ibrida: semantic + full-text + recency
-- Tre segnali combinati, come Mem0 2026.
-- ============================================

CREATE FUNCTION search_memories(
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
CREATE FUNCTION recall_memories(memory_ids UUID[])
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
CREATE FUNCTION decay_relevance_scores()
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
```

---

## PARTE 2 — Brain: il nuovo cervello

### Struttura file

```
src/brain/
├── embeddings.js           # Gemini Embedding API
├── searchMemories.js       # Wrapper di search_memories SQL
├── contextBuilder.js       # Costruisce contesto per LLM
├── systemPrompt.js         # System prompt master
├── llm.js                  # Chiamata Groq
├── actions.js              # Esecuzione azioni (create memory, ecc.)
├── extraction.js           # Pipeline ASINCRONA post-risposta (Fase 2)
├── processMessage.js       # Orchestratore principale
└── constants.js            # Pesi, limiti, config
```

### Embeddings — `src/brain/embeddings.js`

```javascript
const GEMINI_EMBEDDING_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

export async function generateEmbedding(text) {
  const response = await fetch(
    `${GEMINI_EMBEDDING_URL}?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: 'SEMANTIC_SIMILARITY',
        outputDimensionality: 768
      })
    }
  );
  
  if (!response.ok) throw new Error(`Embedding failed: ${response.status}`);
  const data = await response.json();
  return data.embedding.values;
}
```

### System Prompt — `src/brain/systemPrompt.js`

```javascript
export function buildSystemPrompt({ profile, proceduralRules, relevantMemories, chatHistory, currentDateTime }) {
  return `
Sei Will, l'assistente personale di Cristiano. Non sei un bot che esegue comandi — sei un compagno digitale che lo conosce e impara nel tempo.

# LA TUA PERSONALITÀ
- Parli italiano naturale, mai robotico o formale
- Sei conciso: 1-3 frasi per risposte semplici
- Sei proattivo: noti pattern, segnali conflitti, suggerisci
- Hai personalità: caloroso ma non servile, puoi fare battute leggere
- NON dire mai "Come posso aiutarti?" o "Sono qui per te"

# REGOLE COMPORTAMENTALI (imparate nel tempo)
${proceduralRules.length > 0 
  ? proceduralRules.map(r => `- ${r.rule}`).join('\n')
  : '(nessuna regola ancora — le imparerai con le conversazioni)'}

# CHI È CRISTIANO
${profile.summary || '(profilo ancora vuoto — lo costruirai conversazione dopo conversazione)'}

${profile.facts?.length > 0 ? `Fatti:\n${profile.facts.map(f => `- ${f.fact}`).join('\n')}` : ''}
${profile.preferences?.length > 0 ? `Preferenze:\n${profile.preferences.map(p => `- ${p.preference}`).join('\n')}` : ''}

# ORA E DATA
${currentDateTime}

# MEMORIE RILEVANTI PER QUESTO MESSAGGIO
Queste memorie sono state recuperate dalla tua memoria a lungo termine perché semanticamente rilevanti a ciò che Cristiano sta dicendo. Usale per rispondere con cognizione di causa. Se ci sono memorie contrastanti sullo stesso argomento, considera la più recente come canonica.

${relevantMemories.length === 0 
  ? '(nessuna memoria rilevante)' 
  : relevantMemories.map(m => 
    `[${m.id}] (${m.memory_type}, ${new Date(m.created_at).toLocaleDateString('it-IT')}) ${m.content}${m.trigger_at ? ' — data: ' + new Date(m.trigger_at).toLocaleString('it-IT') : ''}`
  ).join('\n')}

# CONVERSAZIONE RECENTE
${chatHistory.length === 0 
  ? '(prima conversazione)' 
  : chatHistory.map(m => `${m.role === 'user' ? 'Cristiano' : 'Will'}: ${m.content}`).join('\n')}

# COSA FARE

## RISPONDERE (sempre)
Genera una risposta naturale e contestualizzata. Usa le memorie per essere preciso. Se ci sono contraddizioni tra memorie, usa la più recente.

## AGIRE (quando l'utente chiede esplicitamente)
Se Cristiano chiede di salvare/segnare/ricordare/cancellare qualcosa, genera un'azione nel campo "actions".

Azioni disponibili:
- **create_memory**: crea una nuova memoria. Decidi il tipo:
  - \`event\` → data fissa nel calendario
  - \`reminder\` → notifica a un orario
  - \`fact\` → fatto su Cristiano
  - \`preference\` → preferenza
  - \`idea\` → idea/da-fare vago
  - \`knowledge\` → conoscenza atemporale (ricetta, link, info)
- **delete_memory**: cancella una memoria (solo su richiesta esplicita, serve l'id dalla lista memorie rilevanti)

NON fare mai UPDATE — le memorie sono ADD-only. Se un'informazione cambia, crea una nuova memoria e lascia la vecchia. Il sistema ordina per recency.

## CHIEDERE CONFERMA (su ambiguità)
Se l'utente è vago su un dettaglio che cambia il tipo o il timing della memoria, chiedi. Esempi:
- "Salva la ricetta della pasta alla norma" → "La salvo come ricetta da consultare, o vuoi che ti ricordi di farla in un momento specifico?"
- "Segna riunione mercoledì alle 15" ma mercoledì alle 15 c'è già qualcosa → "Mercoledì alle 15 hai già [X]. Segno lo stesso?"
- "Cancella la riunione" ma ce ne sono 3 → "Ho trovato 3 riunioni: [elenco]. Quale?"
In questi casi, NON eseguire azioni. Rispondi e aspetta.

# FORMATO OUTPUT

JSON valido. Niente altro prima o dopo.

\`\`\`json
{
  "response": "La tua risposta in italiano",
  "actions": [
    {
      "type": "create_memory",
      "content": "Testo della memoria",
      "memory_type": "event|reminder|fact|preference|idea|knowledge",
      "trigger_at": "ISO 8601 o null",
      "trigger_end": "ISO 8601 o null",
      "tags": ["tag1", "tag2"],
      "importance": 3
    }
  ],
  "recall_ids": ["uuid-1", "uuid-2"],
  "message_type": "text|action_confirm|memory_card|memory_list|greeting"
}
\`\`\`

- \`actions\`: array vuoto se non serve agire
- \`recall_ids\`: ID delle memorie dalla lista "MEMORIE RILEVANTI" che hai effettivamente usato per rispondere
- \`message_type\`: "action_confirm" per conferme brevi, "memory_list" per elenchi di memorie, "memory_card" per singola creazione notevole, "greeting" per il saluto iniziale, "text" altrimenti

# CASO SPECIALE: __GREETING__
Se il messaggio è "__GREETING__", genera un saluto personalizzato:
- Saluta per nome
- Cita 1-2 cose rilevanti dal contesto (eventi di oggi, note recenti)
- Termina con una frase aperta ("Cosa facciamo?" / "Di cosa parliamo?")
- Max 3 frasi, tono caloroso ma non zuccheroso
- actions deve essere un array vuoto
- message_type deve essere "greeting"
  `.trim();
}
```

### Process Message — `src/brain/processMessage.js`

```javascript
// Orchestratore principale — Fase 1 (sincrona)

import { generateEmbedding } from './embeddings.js';
import { searchMemories } from './searchMemories.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { callLLM } from './llm.js';
import { executeActions } from './actions.js';
import { extractAndStoreMemories } from './extraction.js';
import { supabase } from '../services/supabase.js';

export async function processMessage({ text, source }) {
  // 1. Salva messaggio utente nella chat
  const { data: userMsg } = await supabase
    .from('chat_messages')
    .insert({ role: 'user', content: text, source })
    .select()
    .single();
  
  // 2. Costruisci contesto — tutto in parallelo per velocità
  const [embedding, profileResult, chatResult] = await Promise.all([
    generateEmbedding(text),
    supabase.from('user_profile').select('*').limit(1).single(),
    supabase.from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
  ]);
  
  const profile = profileResult.data;
  const chatHistory = (chatResult.data || []).reverse();
  
  // 3. Ricerca ibrida memorie rilevanti
  const { data: memories } = await supabase.rpc('search_memories', {
    query_embedding: embedding,
    query_text: text,
    match_count: 15,
    min_relevance: 20
  });
  
  // 4. Costruisci prompt e chiama LLM
  const systemPrompt = buildSystemPrompt({
    profile,
    proceduralRules: profile.procedural_rules || [],
    relevantMemories: memories || [],
    chatHistory: chatHistory.slice(0, -1),  // escludi il messaggio appena salvato
    currentDateTime: new Date().toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      dateStyle: 'full',
      timeStyle: 'short'
    })
  });
  
  const llmResponse = await callLLM({ systemPrompt, userMessage: text });
  
  // 5. Esegui azioni esplicite (create_memory da comando diretto)
  const createdMemoryIds = await executeActions(llmResponse.actions, source);
  
  // 6. Recall delle memorie usate
  if (llmResponse.recall_ids?.length > 0) {
    await supabase.rpc('recall_memories', { memory_ids: llmResponse.recall_ids });
  }
  
  // 7. Salva risposta Will nella chat
  const { data: assistantMsg } = await supabase
    .from('chat_messages')
    .insert({
      role: 'assistant',
      content: llmResponse.response,
      message_type: llmResponse.message_type || 'text',
      related_memory_ids: [...createdMemoryIds, ...(llmResponse.recall_ids || [])]
    })
    .select()
    .single();
  
  // 8. FASE 2 ASINCRONA — estrai fatti in background (non blocca la UI)
  // Solo se il messaggio non è un greeting o un errore
  if (text !== '__GREETING__') {
    extractAndStoreMemories({
      userMessage: text,
      assistantResponse: llmResponse.response,
      source: source.replace('app_', 'extraction').replace('telegram_', 'extraction')
    }).catch(err => console.error('Background extraction failed:', err));
    // .catch() perché è fire-and-forget: se fallisce, non è critico
  }
  
  // 9. Incrementa contatore per auto-update profilo
  await supabase.rpc('increment_memories_counter');
  // Se raggiunge 10, il prossimo heartbeat lo resetta e aggiorna il profilo
  
  return {
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    createdMemories: createdMemoryIds
  };
}
```

### Extraction asincrona — `src/brain/extraction.js`

Questa è la Fase 2: dopo che Will ha risposto, un secondo LLM call analizza lo scambio ed estrae i fatti atomici da salvare come memorie.

```javascript
import { generateEmbedding } from './embeddings.js';
import { callLLM } from './llm.js';
import { supabase } from '../services/supabase.js';

const EXTRACTION_PROMPT = `
Sei un sistema di estrazione fatti. Analizza questo scambio tra Cristiano e il suo assistente Will e restituisci i NUOVI fatti che vale la pena ricordare.

Regole:
- Estrai solo fatti NUOVI e SALIENTI, non banalità
- Ogni fatto deve essere una frase atomica autocontenuta
- Non estrarre fatti che sono già azioni esplicite (es. "Cristiano ha chiesto di salvare X" — l'azione stessa è già stata gestita)
- Estrai fatti IMPLICITI che emergono dalla conversazione (es. se chiede una ricetta siciliana, potrebbe significare che è interessato alla cucina siciliana)
- Classifica ogni fatto con il memory_type appropriato
- Se non ci sono fatti nuovi da estrarre, ritorna un array vuoto
- NON inventare fatti — estrai solo ciò che è esplicitamente o ragionevolmente implicito dallo scambio

Rispondi SOLO con JSON:
{
  "facts": [
    {
      "content": "frase atomica",
      "memory_type": "fact|preference|idea|knowledge",
      "tags": ["tag1", "tag2"],
      "importance": 1-5
    }
  ]
}

Se non ci sono fatti nuovi: { "facts": [] }
`;

export async function extractAndStoreMemories({ userMessage, assistantResponse, source }) {
  const llmResponse = await callLLM({
    systemPrompt: EXTRACTION_PROMPT,
    userMessage: `CRISTIANO: ${userMessage}\nWILL: ${assistantResponse}`
  });
  
  if (!llmResponse.facts || llmResponse.facts.length === 0) return;
  
  for (const fact of llmResponse.facts) {
    try {
      const embedding = await generateEmbedding(fact.content);
      await supabase.from('memories').insert({
        content: fact.content,
        embedding,
        memory_type: fact.memory_type,
        tags: fact.tags || [],
        importance: fact.importance || 2,
        source: 'extraction'
      });
    } catch (err) {
      console.error('Failed to store extracted fact:', err);
    }
  }
}
```

### Actions — `src/brain/actions.js`

```javascript
import { generateEmbedding } from './embeddings.js';
import { supabase } from '../services/supabase.js';

export async function executeActions(actions = [], source = 'app_text') {
  const createdIds = [];
  
  for (const action of actions) {
    if (action.type === 'create_memory') {
      const embedding = await generateEmbedding(action.content);
      
      const { data } = await supabase
        .from('memories')
        .insert({
          content: action.content,
          embedding,
          memory_type: action.memory_type,
          trigger_at: action.trigger_at || null,
          trigger_end: action.trigger_end || null,
          tags: action.tags || [],
          importance: action.importance || 3,
          source
        })
        .select()
        .single();
      
      if (data) createdIds.push(data.id);
    }
    
    else if (action.type === 'delete_memory') {
      // Cancellazione solo su richiesta esplicita dell'utente
      await supabase.from('memories').delete().eq('id', action.id);
    }
    
    // NON c'è 'update_memory' — il sistema è ADD-only
  }
  
  return createdIds;
}
```

---

## PARTE 3 — Heartbeat: il battito notturno

Edge Function `supabase/functions/heartbeat/index.ts` — cron ogni notte alle 3:00 AM.

Fa 4 cose:

### 1. Decay del relevance_score
Chiama `decay_relevance_scores()` (funzione SQL già definita sopra).

### 2. Estrazione fatti dalle conversazioni del giorno
Prende tutti i `chat_messages` delle ultime 24h, li raggruppa in coppie user/assistant, li manda a un LLM call con un prompt di riflessione:

```
"Analizza le conversazioni di oggi di Cristiano. Estrai:
1. Nuovi fatti stabili su di lui (non già noti nel profilo attuale)
2. Nuove preferenze emerse
3. Pattern comportamentali (es: 'tende a pianificare la settimana il lunedì mattina')
4. Nuove regole procedurali (es: 'preferisce che non gli chieda conferma su X')
Ritorna JSON con facts[], preferences[], procedural_rules[]"
```

I fatti e preferenze vengono salvati come nuove memorie (`source: 'heartbeat'`).
Le regole procedurali aggiornano `user_profile.procedural_rules`.

### 3. Aggiornamento profilo
Se `memories_since_last_profile_update >= 10` OPPURE se invocato manualmente:
- Prende tutte le memorie `fact` e `preference` con `relevance_score > 40`
- Le manda al LLM con prompt: "Scrivi un riassunto di chi è Cristiano basandoti su questi fatti e preferenze"
- Aggiorna `user_profile.summary`, `.facts`, `.preferences`
- Resetta `memories_since_last_profile_update` a 0

### 4. Deduplicazione soft (consolidazione)
Cerca memorie con embedding molto simile (cosine similarity > 0.95) e stesso `memory_type`. Non le cancella (ADD-only), ma abbassa il `relevance_score` della più vecchia di 30 punti. Così la più recente emerge naturalmente nel retrieval.

### Funzione SQL helper

```sql
CREATE FUNCTION increment_memories_counter()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE user_profile
  SET memories_since_last_profile_update = memories_since_last_profile_update + 1;
END;
$$;
```

### Cron job

```sql
SELECT cron.schedule(
  'will-heartbeat',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/heartbeat',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### Trigger manuale
Se Cristiano dice "aggiorna quello che sai di me" / "rivedi il tuo profilo", il system prompt lo riconosce come trigger: la risposta conterrà un'azione speciale `{ type: "trigger_heartbeat" }`. L'app chiama direttamente la Edge Function heartbeat.

---

## PARTE 4 — Nuova Home: chat persistente

### Layout mobile

```
┌──────────────────────────────────────┐
│  HEADER (glass blur)                 │
│  Will                          ⚙️    │
│  Online · 247 ricordi su di te       │
├──────────────────────────────────────┤
│  CHIPS (horizontal scroll)           │
│  [Cosa ho oggi?] [Ricette salvate]   │
│  [Riepilogo settimana] [Chi sono?]   │
├──────────────────────────────────────┤
│                                      │
│  AREA CHAT (scrollabile)             │
│                                      │
│  Will: Bentornato Cristiano!         │
│  Sono le 9:15, oggi hai la riunione  │
│  con Giuseppe alle 15. Cosa facciamo?│
│                                      │
│                    Tu: ho impegni     │
│                    domani?            │
│                                      │
│  Will: Domani sei libero. Vuoi che   │
│  segni qualcosa?                     │
│                                      │
├──────────────────────────────────────┤
│  INPUT BAR (sticky bottom)           │
│  [Scrivi a Will...]        [→ / 🎙️] │
│                                      │
│  Quando microfono attivo:            │
│  [▮▮▯▯▮▮▯ visualizzatore]      [■]  │
├──────────────────────────────────────┤
│  NAVBAR                              │
│  [Will] [Calendario] [Note]          │
└──────────────────────────────────────┘
```

### Componenti

```
src/components/chat/
├── ChatHeader.jsx
├── SuggestionChips.jsx
├── MessageList.jsx
├── MessageBubble.jsx           # gestisce tutti i message_type
├── MemoryCardBubble.jsx        # card ricca per evento/nota
├── MemoryListBubble.jsx        # lista di memorie
├── TypingIndicator.jsx         # "Will sta pensando..."
├── ChatInputBar.jsx            # input testo + microfono
└── AudioVisualizerInline.jsx   # visualizzatore quando mic è attivo
```

### Stili bolle

**Bolla utente** (destra):
```css
background: rgba(177, 107, 255, 0.12);
border: 1px solid rgba(177, 107, 255, 0.25);
border-radius: 20px 20px 4px 20px;
backdrop-filter: blur(20px);
```

**Bolla Will** (sinistra):
```css
background: rgba(0, 229, 255, 0.08);
border: 1px solid rgba(0, 229, 255, 0.18);
border-radius: 20px 20px 20px 4px;
backdrop-filter: blur(20px);
```

**Bolla action_confirm** (piccola, centrata):
```
✓ Salvato!  (icona check in --neon-lime, glow leggero, max-width: fit-content)
```

**Bolla memory_card** (card ricca, sinistra):
```
┌─────────────────────────────┐
│ 📅 Vacanza a Napoli         │
│ 2-4 giugno · Napoli         │
│ [tap → vai al calendario]   │
└─────────────────────────────┘
```

### Animazioni (Motion)

- **Nuova bolla**: fade-in + slide-up + scale 0.96→1, 350ms, ease-out
- **Typewriter** su risposte Will: 18ms/carattere, cursore cyan lampeggiante
- **Typing indicator**: 3 puntini cyan pulsanti (staggered 0/150/300ms)
- **Tap chip**: scale 0.95 spring, poi scompare con fade
- **Saluto iniziale**: ritardo 400ms dal mount
- **Scroll automatico** ai nuovi messaggi (smooth)
- **Tap su bolla**: scale 0.96 con spring (`whileTap`)
- **Cambio tab navbar**: pillola che si sposta con `layoutId`

### Microfono nella InputBar

```
Idle:     [Scrivi a Will...]                   [🎙️]
Listening: [▮▮▯▯▮▮▮▯▯ visualizzatore live]    [■]
           (campo testo si trasforma)
           (stop button quadrato in --neon-pink)
Processing: [Sto ascoltando... ◌◌◌]            [⏳]
Transcribed: [testo trascritto]                 [→]
```

Tap singolo per start, tap singolo per stop. Dopo 1.5s di silenzio, invia automaticamente.

### Saluto dinamico

All'apertura, se l'ultimo messaggio è di > 1 ora fa:
```javascript
await processMessage({ text: '__GREETING__', source: 'app_text' });
```
Il system prompt sa che `__GREETING__` non è testo utente ma un trigger per il saluto.

---

## PARTE 5 — Calendario e Note come proiezioni

### Calendario
Query: `SELECT * FROM memories WHERE memory_type IN ('event', 'reminder') AND trigger_at IS NOT NULL AND relevance_score > 0 ORDER BY trigger_at`

Stessa UI calendario attuale, cambia solo la sorgente dati.

### Note
Query: `SELECT * FROM memories WHERE memory_type IN ('knowledge', 'idea', 'fact', 'preference') ORDER BY created_at DESC`

Stessa UI note attuale, con in più un **badge colorato** per `memory_type`:
- `knowledge` → badge cyan
- `idea` → badge viola
- `fact` → badge lime
- `preference` → badge pink

---

## PARTE 6 — Migrazione dati

Dopo che tutto funziona, esegui una volta:

```sql
-- Migra events
INSERT INTO memories (content, memory_type, trigger_at, trigger_end, source, created_at, importance)
SELECT 
  title || COALESCE(' — ' || description, '') || COALESCE(' a ' || location, ''),
  'event',
  start_date,
  end_date,
  COALESCE(source, 'app_text'),
  created_at,
  3
FROM events;

-- Migra notes
INSERT INTO memories (content, memory_type, tags, source, created_at, importance)
SELECT
  COALESCE(title || ': ', '') || content,
  'knowledge',
  tags,
  COALESCE(source, 'app_text'),
  created_at,
  3
FROM notes;
```

Poi lancia uno script JS che cicla tutte le memorie con `embedding IS NULL`, genera l'embedding e fa UPDATE.

Drop finale (solo dopo verifica):
```sql
DROP TABLE events;
DROP TABLE notes;
DROP TABLE conversations;
```

---

## PARTE 7 — Edge Function Telegram aggiornata

La Edge Function usa lo stesso brain. Differenza: non ha multi-turn in sessione (è stateless), ma ha il contesto completo del database.

```typescript
// supabase/functions/telegram-webhook/index.ts
// Usa processMessage() con le stesse funzioni del brain
// L'unico adattamento: source è 'telegram_text' o 'telegram_voice'
```

---

## Step di sviluppo

### Fase A — Database (1-2 giorni)
1. Branch `refactor/semantic-memory`
2. Abilita extension `vector`
3. Crea tutte le tabelle
4. Crea tutte le funzioni SQL
5. Test: INSERT manuale + search_memories con embedding fasullo

### Fase B — Brain (3-4 giorni)
1. `embeddings.js`
2. `searchMemories.js`
3. `systemPrompt.js`
4. `llm.js`
5. `actions.js`
6. `extraction.js` (pipeline asincrona)
7. `processMessage.js`
8. Test: chiama processMessage da un componente debug

### Fase C — Heartbeat (1-2 giorni)
1. Edge Function `heartbeat/index.ts`
2. Cron job
3. Test manuale

### Fase D — Nuova Home Chat (3-4 giorni)
1. Componenti chat
2. Riscrittura Home.jsx
3. Saluto dinamico
4. Microfono inline
5. Animazioni Motion

### Fase E — Migrazione (mezza giornata)
1. Esegui SQL migrazione
2. Lancia script embedding
3. Verifica
4. Drop vecchie tabelle

### Fase F — Collaterali (mezza giornata)
1. Calendario e Note come proiezioni di memories
2. Edge Function Telegram aggiornata
3. Edge Function notifiche aggiornata

---

## Acceptance Criteria

### Funzionali
1. ✅ Qualsiasi cosa dica a Will viene ricordata: evento, ricetta, preferenza, fatto, idea
2. ✅ "Salva ricetta pasta alla norma" → memoria knowledge con tags ['ricetta']
3. ✅ "Che ricette ho salvato?" → Will cerca per similarità e le elenca
4. ✅ "Mi piace il viola" → memoria preference, finisce nel profilo dopo heartbeat
5. ✅ "Ricordami di chiamare Franco domani alle 10" → memoria reminder con trigger_at
6. ✅ "Sono libero mercoledì?" → Will cerca eventi con trigger_at su mercoledì e risponde
7. ✅ Conflitti segnalati ("Mercoledì alle 15 hai già il dentista")
8. ✅ Ambiguità gestite con domanda di conferma
9. ✅ Pipeline asincrona estrae fatti impliciti in background
10. ✅ Heartbeat notturno aggiorna profilo, regole procedurali, decay
11. ✅ Telegram funziona con lo stesso cervello
12. ✅ Dati vecchi migrati senza perdita

### UI / UX
1. ✅ Home è una chat conversazionale persistente
2. ✅ Saluto dinamico all'apertura che cita contesto reale
3. ✅ Chips funzionano
4. ✅ Bolle glass cyan (Will) e viola (utente)
5. ✅ Typewriter sulle risposte (18ms/char)
6. ✅ Microfono trasforma input bar in visualizzatore
7. ✅ Memory cards tappabili
8. ✅ 60fps su mobile reale
9. ✅ Persistenza: chiudi e riapri → vedi la conversazione

### Architetturali
1. ✅ Memorie ADD-only: mai UPDATE, mai DELETE automatico
2. ✅ Ricerca ibrida: semantic + keyword + recency (3 segnali)
3. ✅ Pipeline a 2 fasi: sincrona (risposta) + asincrona (estrazione)
4. ✅ Profilo auto-aggiornato ogni 10 nuove memorie
5. ✅ Regole procedurali apprese dal heartbeat e iniettate nel prompt
6. ✅ Latenza risposta < 3 secondi su connessione normale

---

## Vincoli

- **JavaScript** nel frontend, **TypeScript** solo nelle Edge Function (Deno)
- **Tailwind CSS** + **Motion** (framer-motion) + **Lucide React**
- **No localStorage** per dati persistenti
- **No librerie calendario** pesanti
- **Font**: serif per display, sans per UI, mono per date (come definito nel design system esistente)
- **Tutte le chiavi in `.env`**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`, `VITE_GROQ_API_KEY`
- **Non rompere il design esistente**: aurora, glass, palette, animazioni restano
- **Commit a ogni fase completata**
