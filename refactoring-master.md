# Refactoring Master — Will diventa una vera IA conversazionale

## Contesto

Will è funzionante: PWA glass-neon, voce/testo, bot Telegram, tabelle `events` e `notes` su Supabase, brain con Groq (Llama 3.3 70B). Ma è strutturalmente un parser di comandi → CRUD su tabelle rigide. **Non impara, non ricorda chi sono, non ragiona su di me.**

Questo refactoring trasforma Will in un vero assistente AI con:
- **Memoria semantica unificata** (una sola tabella `memories` per tutto: eventi, promemoria, fatti, preferenze, idee, conoscenze)
- **Ricerca ibrida** (embedding + full-text)
- **Profilo dedotto** di chi sono io
- **Heartbeat notturno** che riflette, sintetizza e aggiorna
- **Home conversazionale stile chat** con persistenza completa

Il design glassmorphism-neon esistente NON si tocca. Si refactora il cervello e si trasforma la home.

---

## ⚠️ Regola d'oro del refactoring

**Tutto questo lavoro avviene su un branch Git separato: `refactor/semantic-memory`.**

Non si droppano le tabelle vecchie finché tutto il nuovo non funziona. Le tabelle `events`, `notes`, `conversations`, `sent_notifications` esistenti restano lì come backup. Le nuove tabelle convivono in parallelo. Solo alla fine, dopo aver migrato i dati e verificato che tutto funzioni, si esegue il drop delle vecchie.

```bash
git checkout -b refactor/semantic-memory
```

---

## 🛠️ Skill Antigravity da usare

Il repository delle skill è già installato: https://github.com/sickn33/antigravity-awesome-skills

Per questo refactoring, attiva queste skill:
- `@architecture` — decisioni architetturali
- `@database-design` — schema design e indexing pgvector
- `@backend-dev-guidelines` — Edge Functions production-grade
- `@error-handling-patterns` — gestione errori robusta
- `@llm-structured-output` — JSON affidabile dal brain
- `@prompt-engineering` — system prompt efficaci
- `@frontend-design` — qualità UI nella nuova home
- `@frontend-ui-dark-ts` — pattern glass + Motion già usati
- `@lint-and-validate` — quality check finale

---

## PARTE 1 — Database: nuovo schema semantico

### Estensioni Supabase da attivare

Dashboard Supabase → Database → Extensions → abilitare:
- **`vector`** (pgvector) — per embedding e similarity search
- **`pg_cron`** (già attivo per le notifiche)
- **`pg_net`** (già attivo per le notifiche)

### Nuove tabelle

```sql
-- ============================================
-- TABELLA PRINCIPALE: memories
-- ============================================
-- Unica casa di tutto quello che Will sa.
-- Eventi, promemoria, fatti, preferenze, idee, conoscenze.
-- ============================================

CREATE TABLE memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Contenuto principale
  content TEXT NOT NULL,                    -- "Vacanza a Napoli dal 2 al 4 giugno", "Mi piace il viola", "Ricetta pasta alla norma"
  embedding VECTOR(768),                    -- embedding gemini-embedding-001 (dim 768)
  content_fts TSVECTOR,                     -- per full-text search PostgreSQL
  
  -- Tipo di memoria (semi-strutturato)
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'event',         -- evento del calendario con data fissa
    'reminder',      -- promemoria con notifica
    'fact',          -- fatto su Cristiano ("ha un Audi Q5")
    'preference',    -- preferenza ("preferisce il viola")
    'idea',          -- idea, brainstorm, da-fare vago
    'knowledge'      -- conoscenza atemporale (ricetta, link, info)
  )),
  
  -- Componente temporale (opzionale)
  trigger_at TIMESTAMPTZ,                   -- quando la memoria "scatta" (notifica/evento)
  trigger_end TIMESTAMPTZ,                  -- fine per eventi con durata (vacanza 2-4 giugno)
  recurrence TEXT,                          -- ricorrenza ("weekly:monday:09:00", null se one-shot)
  notified BOOLEAN DEFAULT false,           -- è già stata notificata?
  
  -- Metadati semantici
  tags TEXT[] DEFAULT '{}',                 -- tag dedotti dall'AI ['ricetta', 'pasta']
  importance SMALLINT DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),  -- importanza dichiarata o dedotta
  relevance_score SMALLINT DEFAULT 100 CHECK (relevance_score BETWEEN 0 AND 100),  -- decade nel tempo
  
  -- Origine
  source TEXT DEFAULT 'app' CHECK (source IN ('app_voice', 'app_text', 'telegram_text', 'telegram_voice', 'heartbeat')),
  
  -- Tempi
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_recalled_at TIMESTAMPTZ              -- ultima volta che è stata richiamata in una conversazione
);

-- Indici per performance
CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_memories_fts ON memories USING GIN (content_fts);
CREATE INDEX idx_memories_type ON memories(memory_type);
CREATE INDEX idx_memories_trigger ON memories(trigger_at) WHERE trigger_at IS NOT NULL;
CREATE INDEX idx_memories_relevance ON memories(relevance_score DESC);
CREATE INDEX idx_memories_created ON memories(created_at DESC);

-- Trigger per aggiornare automaticamente content_fts
CREATE FUNCTION update_memories_fts() RETURNS TRIGGER AS $$
BEGIN
  NEW.content_fts := to_tsvector('italian', NEW.content || ' ' || coalesce(array_to_string(NEW.tags, ' '), ''));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memories_fts
BEFORE INSERT OR UPDATE ON memories
FOR EACH ROW EXECUTE FUNCTION update_memories_fts();

-- RLS aperta (uso personale)
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON memories FOR ALL USING (true) WITH CHECK (true);


-- ============================================
-- TABELLA: user_profile
-- ============================================
-- Singola riga, costruita dall'AI nel tempo.
-- Riassunto + fatti + preferenze dedotti dalle memorie.
-- ============================================

CREATE TABLE user_profile (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  summary TEXT,                             -- testo libero: "Cristiano lavora in logistica, ama Beyblade, ..."
  facts JSONB DEFAULT '[]'::jsonb,          -- [{fact: "ha un Audi Q5", confidence: 0.9, source_memory_ids: [...]}, ...]
  preferences JSONB DEFAULT '[]'::jsonb,    -- [{preference: "predilige il viola", confidence: 0.8, ...}, ...]
  last_heartbeat_at TIMESTAMPTZ,            -- ultima volta che il heartbeat ha aggiornato il profilo
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON user_profile FOR ALL USING (true) WITH CHECK (true);

-- Inserisce una riga vuota di default (singleton)
INSERT INTO user_profile (summary) VALUES (NULL);


-- ============================================
-- TABELLA: chat_messages (sostituisce conversations)
-- ============================================
-- Storico conversazione persistente, mostrato nella home chat.
-- ============================================

CREATE TABLE chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  
  -- Metadati per UI ricca
  message_type TEXT DEFAULT 'text' CHECK (message_type IN (
    'text',              -- bolla normale
    'action_confirm',    -- "✓ Salvato!" → bolla piccola con icona
    'memory_card',       -- bolla ricca con card di un evento/nota creato
    'memory_list',       -- bolla con lista di memorie (es. "le mie ricette")
    'error'              -- bolla rossa per errori
  )),
  
  -- Riferimento alle memorie create/coinvolte in questo messaggio
  related_memory_ids UUID[] DEFAULT '{}',
  
  -- Origine
  source TEXT DEFAULT 'app_text' CHECK (source IN ('app_voice', 'app_text', 'telegram_text', 'telegram_voice')),
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_messages_created ON chat_messages(created_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);


-- ============================================
-- TABELLA: sent_notifications (resta com'è ma con FK a memories)
-- ============================================

DROP TABLE IF EXISTS sent_notifications_old;
ALTER TABLE sent_notifications RENAME TO sent_notifications_old;  -- backup

CREATE TABLE sent_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_sent_notifications_unique 
  ON sent_notifications(memory_id, notification_type) 
  WHERE notification_type = 'pre_event';

ALTER TABLE sent_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON sent_notifications FOR ALL USING (true) WITH CHECK (true);
```

### Funzioni SQL per ricerca ibrida

```sql
-- Funzione di ricerca ibrida: semantic + full-text combinati
CREATE FUNCTION search_memories(
  query_text TEXT,
  query_embedding VECTOR(768),
  match_count INT DEFAULT 10,
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
  similarity FLOAT,
  fts_rank FLOAT,
  combined_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id, m.content, m.memory_type, m.trigger_at, m.trigger_end,
    m.tags, m.importance, m.relevance_score, m.created_at,
    (1 - (m.embedding <=> query_embedding))::FLOAT AS similarity,
    ts_rank(m.content_fts, plainto_tsquery('italian', query_text))::FLOAT AS fts_rank,
    -- Score combinato: 70% semantic + 30% full-text, pesato per relevance
    (
      0.7 * (1 - (m.embedding <=> query_embedding)) + 
      0.3 * ts_rank(m.content_fts, plainto_tsquery('italian', query_text))
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

-- Funzione per "richiamare" una memoria (refresh relevance_score quando viene usata)
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
```

---

## PARTE 2 — Brain refactoring: il nuovo cervello

### Architettura del nuovo flusso

```
Utente scrive/parla
       ↓
[1] Salva messaggio in chat_messages (role='user')
       ↓
[2] CONTEXT BUILDER:
    - Genera embedding del messaggio utente (Gemini Embedding)
    - Cerca top 10 memorie rilevanti via search_memories()
    - Recupera ultimi 10 chat_messages (storico conversazione)
    - Carica user_profile (chi è Cristiano)
    - Costruisce il contesto completo
       ↓
[3] LLM CALL (Groq Llama 3.3 70B):
    - System prompt + profilo + memorie rilevanti + storico chat
    - Output JSON strutturato: { type, response, actions, recall_ids }
       ↓
[4] AZIONE (se presente):
    - create_memory / update_memory / delete_memory
    - Se create_memory → genera embedding, salva
       ↓
[5] RECALL:
    - Chiama recall_memories() sugli ID delle memorie richiamate
       ↓
[6] Salva risposta in chat_messages (role='assistant')
       ↓
[7] Restituisci risposta alla UI (e leggi a voce se voice input)
```

### Struttura file

```
src/brain/
├── embeddings.js          # Chiamata a Gemini Embedding API
├── searchMemories.js      # Wrapper della funzione SQL search_memories
├── buildContext.js        # Costruisce il contesto completo
├── systemPrompt.js        # Il system prompt master
├── llm.js                 # Chiamata Groq + parsing JSON
├── actions.js             # Esecuzione delle azioni (create/update/delete memory)
├── processMessage.js      # Orchestratore principale (1→7)
└── _shared/               # Codice condiviso con Edge Function Telegram
    ├── brain.js           # Versione re-esportabile per Deno
    └── types.js           # Definizioni dei tipi JSON
```

### Embeddings — `src/brain/embeddings.js`

```javascript
const GEMINI_EMBEDDING_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

export async function generateEmbedding(text) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  const response = await fetch(`${GEMINI_EMBEDDING_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: 'SEMANTIC_SIMILARITY',  // per ricerca semantica
      outputDimensionality: 768
    })
  });
  
  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.status}`);
  }
  
  const data = await response.json();
  return data.embedding.values;  // Array di 768 float
}

// Per Edge Function Telegram (Deno), versione equivalente con Deno.env.get('GEMINI_API_KEY')
```

### System Prompt — `src/brain/systemPrompt.js`

Il system prompt è la cosa più importante del refactoring. Definisce **chi è Will** e come deve ragionare. Deve istruire l'LLM a:

1. Essere un assistente personale conversazionale, NON un parser di comandi
2. Usare il contesto fornito (profilo + memorie + storico chat) per ragionare
3. Distinguere tra **chiedere conferma** e **agire** sui dettagli ambigui
4. Decidere il tipo di memoria da creare (`event`, `reminder`, `fact`, `preference`, `idea`, `knowledge`)
5. Restituire SEMPRE un JSON strutturato

```javascript
export function buildSystemPrompt({ profile, memories, chatHistory, currentDateTime }) {
  return `
Sei Will, l'assistente personale di Cristiano. Sei intelligente, amichevole, conciso e ti comporti come un vero compagno digitale che lo conosce.

# CHI SEI
- Un assistente che CONOSCE Cristiano nel tempo, non un bot che esegue comandi
- Parli italiano naturale, mai robotico
- Sei conciso: 1-3 frasi per risposte semplici, di più solo quando serve davvero
- Sei proattivo: noti pattern, segnali conflitti, suggerisci quando ha senso
- Hai personalità: leggermente caloroso, mai servile, puoi fare battute leggere
- NON usi mai frasi tipo "Come posso aiutarti?" o "Sono qui per te" — parli come un amico che ti conosce

# CHI È CRISTIANO (profilo dedotto nel tempo)
${profile.summary || '(profilo ancora vuoto, lo costruirai con le conversazioni)'}

${profile.facts.length > 0 ? `## Fatti su di lui:
${profile.facts.map(f => `- ${f.fact}`).join('\n')}` : ''}

${profile.preferences.length > 0 ? `## Sue preferenze:
${profile.preferences.map(p => `- ${p.preference}`).join('\n')}` : ''}

# DATA E ORA ATTUALE
${currentDateTime} (Europe/Rome)

# MEMORIE RILEVANTI PER QUESTO MESSAGGIO
${memories.length === 0 ? '(nessuna memoria rilevante trovata)' : memories.map(m => 
  `[${m.id}] ${m.memory_type.toUpperCase()}${m.trigger_at ? ` (${new Date(m.trigger_at).toLocaleString('it-IT')})` : ''}: ${m.content}`
).join('\n')}

# STORICO CHAT RECENTE
${chatHistory.length === 0 ? '(prima conversazione)' : chatHistory.map(m => 
  `${m.role === 'user' ? 'Cristiano' : 'Will'}: ${m.content}`
).join('\n')}

# COSA FARE

Ad ogni messaggio decidi:

## A. RISPONDERE (sempre)
Genera una risposta naturale, breve, contestualizzata. Usa le memorie e il profilo per essere preciso.
Esempio: domanda "che ricette ho salvato?" → cerca tra le memorie rilevanti quelle di tipo knowledge con tag ricetta → cita per nome.

## B. AGIRE (quando serve)
Se l'utente chiede di salvare/aggiungere/ricordare/cancellare/modificare qualcosa, genera una o più azioni:

### Azioni disponibili:
- **create_memory**: salva una nuova memoria
- **update_memory**: aggiorna una memoria esistente (serve l'id)
- **delete_memory**: cancella una memoria (serve l'id)

### Quando crei una memoria, decidi:
- **memory_type**: 
  - \`event\` → ha una data fissa nel futuro o presente ("Vacanza a Napoli 2-4 giugno")
  - \`reminder\` → ha una data E richiede notifica ("ricordami di chiamare Franco domani alle 10")
  - \`fact\` → fatto su Cristiano ("Ho un Audi Q5", "Il mio meccanico si chiama Franco")
  - \`preference\` → preferenza ("Mi piace il viola", "Preferisco il sushi alla pizza")
  - \`idea\` → idea/da-fare vago ("Magari un giorno facciamo un viaggio in Giappone")
  - \`knowledge\` → conoscenza atemporale (ricetta, link, info)
- **trigger_at / trigger_end**: solo se event/reminder con data esplicita
- **tags**: 2-4 tag in italiano (sostantivi/temi)
- **importance**: 1-5 (3 di default, 5 se esplicitamente importante, 1 se molto vago)

## C. CHIEDERE CONFERMA (sui dettagli ambigui)
Se l'utente è vago, NON inventare dettagli. Chiedi.

Esempi:
- "salva la ricetta della pasta alla norma" → ambiguo: vuole farla un giorno specifico o salvarla in generale?
  → Risposta: "La salvo come ricetta da provare un giorno, o vuoi che ti ricordi di farla in un momento specifico?"
- "cancella la riunione" + ci sono 3 riunioni → quale?
  → Risposta: "Ho trovato 3 riunioni: [elenco]. Quale vuoi cancellare?"
- "segna riunione mercoledì alle 15" + mercoledì alle 15 c'è già qualcosa →
  → Risposta: "Mercoledì alle 15 hai già [X]. Vuoi che segno la riunione lo stesso o preferisci un altro orario?"

In questi casi NON eseguire l'azione: rispondi e basta.

## D. RICHIAMARE MEMORIE
Nel campo \`recall_ids\` metti gli ID delle memorie che hai effettivamente usato nella risposta. Questo le mantiene "vive" nel relevance score.

# FORMATO OUTPUT

Rispondi SEMPRE e SOLO con questo JSON (niente prima, niente dopo):

\`\`\`json
{
  "response": "La tua risposta in italiano naturale per Cristiano",
  "actions": [
    {
      "type": "create_memory",
      "content": "Testo della memoria da salvare",
      "memory_type": "event" | "reminder" | "fact" | "preference" | "idea" | "knowledge",
      "trigger_at": "ISO 8601 o null",
      "trigger_end": "ISO 8601 o null",
      "tags": ["tag1", "tag2"],
      "importance": 3
    }
  ],
  "recall_ids": ["uuid-memoria-1", "uuid-memoria-2"],
  "message_type": "text" | "action_confirm" | "memory_card" | "memory_list"
}
\`\`\`

- \`actions\` può essere array vuoto se non serve agire
- \`recall_ids\` può essere vuoto se non hai usato memorie
- \`message_type\`: scegli "action_confirm" per conferme brevi ("✓ Salvato!"), "memory_list" per liste di memorie, "memory_card" per la creazione di un singolo evento/nota notevole, "text" altrimenti
  `.trim();
}
```

### Process Message — `src/brain/processMessage.js`

L'orchestratore principale. Gira sia in app che (con piccoli adattamenti per Deno) in Edge Function Telegram.

```javascript
import { generateEmbedding } from './embeddings.js';
import { searchMemories } from './searchMemories.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { callLLM } from './llm.js';
import { executeActions } from './actions.js';
import { supabase } from '../services/supabase.js';

export async function processMessage({ text, source }) {
  // 1. Salva messaggio utente
  const { data: userMsg } = await supabase
    .from('chat_messages')
    .insert({ role: 'user', content: text, source })
    .select()
    .single();
  
  // 2. Costruisci contesto in parallelo (performance)
  const [embedding, profile, chatHistory] = await Promise.all([
    generateEmbedding(text),
    supabase.from('user_profile').select('*').limit(1).single().then(r => r.data),
    supabase.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(10).then(r => r.data.reverse())
  ]);
  
  const memories = await searchMemories(text, embedding, 10);
  
  // 3. Costruisci system prompt e chiama LLM
  const systemPrompt = buildSystemPrompt({
    profile,
    memories,
    chatHistory: chatHistory.slice(0, -1),  // escludi il messaggio corrente
    currentDateTime: new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'full', timeStyle: 'short' })
  });
  
  const llmResponse = await callLLM({
    systemPrompt,
    userMessage: text
  });
  
  // 4. Esegui azioni
  const createdMemoryIds = await executeActions(llmResponse.actions);
  
  // 5. Recall delle memorie usate
  if (llmResponse.recall_ids?.length > 0) {
    await supabase.rpc('recall_memories', { memory_ids: llmResponse.recall_ids });
  }
  
  // 6. Salva risposta assistant
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
  
  return {
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    createdMemories: createdMemoryIds
  };
}
```

### Actions — `src/brain/actions.js`

```javascript
import { generateEmbedding } from './embeddings.js';
import { supabase } from '../services/supabase.js';

export async function executeActions(actions = []) {
  const createdIds = [];
  
  for (const action of actions) {
    if (action.type === 'create_memory') {
      // Genera embedding per la memoria
      const embedding = await generateEmbedding(action.content);
      
      const { data } = await supabase
        .from('memories')
        .insert({
          content: action.content,
          embedding,
          memory_type: action.memory_type,
          trigger_at: action.trigger_at,
          trigger_end: action.trigger_end,
          tags: action.tags || [],
          importance: action.importance || 3,
          source: 'app_text'
        })
        .select()
        .single();
      
      if (data) createdIds.push(data.id);
    }
    
    else if (action.type === 'update_memory') {
      const updates = { ...action.data, updated_at: new Date().toISOString() };
      // Se cambia content, rigenera embedding
      if (action.data.content) {
        updates.embedding = await generateEmbedding(action.data.content);
      }
      await supabase.from('memories').update(updates).eq('id', action.id);
    }
    
    else if (action.type === 'delete_memory') {
      await supabase.from('memories').delete().eq('id', action.id);
    }
  }
  
  return createdIds;
}
```

---

## PARTE 3 — Heartbeat: il battito notturno

### Edge Function `supabase/functions/heartbeat/index.ts`

Un cron job notturno alle 3:00 (Europe/Rome) che fa 4 cose:

1. **Decadimento relevance**: cala il `relevance_score` di tutte le memorie non richiamate da più di 24h
   - `fact` e `preference`: -0.3 al giorno (decadono lentamente, sono stabili)
   - `event` scaduto: -2 al giorno (gli eventi passati sbiadiscono velocemente)
   - `reminder` notificato: -3 al giorno (dopo la notifica perdono valore)
   - `knowledge` e `idea`: -1 al giorno

2. **Estrazione fatti/preferenze**: prende le conversazioni delle ultime 24h, le manda all'LLM con un prompt di "riflessione" che chiede di estrarre fatti stabili o preferenze su Cristiano. Crea memorie nuove di tipo `fact`/`preference` se trovate, con `source='heartbeat'`.

3. **Aggiornamento profilo**: prende tutte le memorie di tipo `fact` e `preference` con `relevance_score > 50`, le manda all'LLM che genera/aggiorna `user_profile.summary`, `user_profile.facts`, `user_profile.preferences`.

4. **Pulizia**: archivia (non cancella) le memorie con `relevance_score < 20` impostando un flag interno, oppure lasciale nel DB ma `search_memories` già le filtra automaticamente con `min_relevance`.

```typescript
// supabase/functions/heartbeat/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (_req) => {
  try {
    // 1. Decadimento relevance
    await supabase.rpc('decay_relevance_scores');
    
    // 2. Estrai fatti/preferenze dalle conversazioni di ieri
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentChat } = await supabase
      .from('chat_messages')
      .select('*')
      .gte('created_at', yesterday)
      .order('created_at', { ascending: true });
    
    if (recentChat && recentChat.length > 5) {  // solo se c'è abbastanza materiale
      const newFacts = await extractFactsFromConversation(recentChat);
      for (const fact of newFacts) {
        const embedding = await generateEmbedding(fact.content);
        await supabase.from('memories').insert({
          content: fact.content,
          memory_type: fact.type, // 'fact' o 'preference'
          embedding,
          tags: fact.tags,
          importance: fact.importance,
          source: 'heartbeat'
        });
      }
    }
    
    // 3. Rigenera user_profile
    const { data: stableMemories } = await supabase
      .from('memories')
      .select('*')
      .in('memory_type', ['fact', 'preference'])
      .gte('relevance_score', 50);
    
    if (stableMemories && stableMemories.length > 0) {
      const newProfile = await generateProfile(stableMemories);
      await supabase
        .from('user_profile')
        .update({
          summary: newProfile.summary,
          facts: newProfile.facts,
          preferences: newProfile.preferences,
          last_heartbeat_at: new Date().toISOString()
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');  // updateall single-row
    }
    
    return new Response(JSON.stringify({ status: 'heartbeat_completed' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Heartbeat error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

async function extractFactsFromConversation(messages) {
  // Chiama Groq con un prompt specifico per estrazione fatti
  // Ritorna array di {content, type: 'fact'|'preference', tags, importance}
}

async function generateProfile(memories) {
  // Chiama Groq con un prompt che sintetizza il profilo
  // Ritorna {summary, facts: [], preferences: []}
}
```

### Funzione SQL per decay

```sql
CREATE FUNCTION decay_relevance_scores()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Fact e preference: decadono lentamente
  UPDATE memories
  SET relevance_score = GREATEST(0, relevance_score - 1)  -- arrotondato 0.3 → 1 ogni 3 giorni di fatto
  WHERE memory_type IN ('fact', 'preference')
    AND (last_recalled_at IS NULL OR last_recalled_at < now() - INTERVAL '3 days');
  
  -- Event passati
  UPDATE memories
  SET relevance_score = GREATEST(0, relevance_score - 2)
  WHERE memory_type = 'event' 
    AND (trigger_end < now() OR trigger_at < now() - INTERVAL '1 day');
  
  -- Reminder notificati
  UPDATE memories
  SET relevance_score = GREATEST(0, relevance_score - 3)
  WHERE memory_type = 'reminder' AND notified = true;
  
  -- Knowledge e idea
  UPDATE memories
  SET relevance_score = GREATEST(0, relevance_score - 1)
  WHERE memory_type IN ('knowledge', 'idea')
    AND (last_recalled_at IS NULL OR last_recalled_at < now() - INTERVAL '1 day');
END;
$$;
```

### Cron job

```sql
SELECT cron.schedule(
  'will-heartbeat',
  '0 3 * * *',  -- 3:00 AM ogni giorno
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

### Forzare il heartbeat manualmente

Aggiungi nel brain una capacità: se l'utente dice "aggiorna quello che sai di me" / "rivedi il tuo profilo", il system prompt deve riconoscerlo come trigger e generare un'azione speciale `trigger_heartbeat`. L'app chiama l'Edge Function heartbeat direttamente.

---

## PARTE 4 — Nuova Home: chat persistente

Questa parte è una **riscrittura completa** della schermata Home (`src/pages/Home.jsx` o equivalente). Le altre schermate (Calendario, Note) restano funzionanti ma diventano proiezioni filtrate di `memories`.

### Layout (mobile, dall'alto in basso)

```
┌──────────────────────────────────────┐
│  HEADER STICKY (glass blur)          │
│  ← back   Will   ⚙️                  │
│  (sotto, in caption mono uppercase)  │
│  "Online · ha 247 ricordi su di te"  │
├──────────────────────────────────────┤
│                                      │
│  CHIPS SCROLLABILI (horizontal)     │
│  [Cosa ho oggi?] [Riepilogo settimana]│
│  [Le mie ricette] [Cosa sai di me]  │
│                                      │
├──────────────────────────────────────┤
│                                      │
│  AREA CONVERSAZIONE (scrollabile)   │
│                                      │
│  All'apertura:                       │
│  Will: "Bentornato Cristiano. Sono   │
│  le 9:15, oggi hai la riunione con   │
│  Giuseppe alle 15 e ieri hai aggiunto│
│  2 ricette. Cosa facciamo?"          │
│                                      │
│  [...altri messaggi storici scrolla- │
│   bili verso l'alto]                 │
│                                      │
├──────────────────────────────────────┤
│  INPUT BAR (sticky bottom)           │
│  [✏️ Scrivi a Will...]  [→ / 🎙️]    │
│                                      │
│  Quando microfono attivo:            │
│  [▮▮▯▯▮▮▯ visualizzatore audio]  [■]│
├──────────────────────────────────────┤
│  NAVBAR (3 tab)                      │
│  [Will] [Calendar] [Notes]           │
└──────────────────────────────────────┘
```

### Componenti

```
src/pages/Home.jsx                    # container principale
src/components/chat/
├── ChatHeader.jsx                    # nome Will + stato + numero ricordi
├── SuggestionChips.jsx               # chips scorciatoia
├── MessageList.jsx                   # lista scrollabile di messaggi
├── Message.jsx                       # bolla singola (gestisce i 5 message_type)
├── MessageMemoryCard.jsx             # bolla ricca con card evento/nota
├── MessageMemoryList.jsx             # bolla con lista di memorie
├── TypingIndicator.jsx               # "Will sta pensando" (3 puntini animati)
├── ChatInputBar.jsx                  # input testo + microfono
└── AudioVisualizerInput.jsx          # versione "in barra" del visualizzatore
```

### Logica di apertura

```javascript
// Home.jsx
useEffect(() => {
  // Al mount:
  // 1. Carica gli ultimi 50 messaggi dalla chat
  // 2. Se l'ultimo messaggio è di oltre 1 ora fa, genera saluto dinamico
  //    chiamando processMessage con un input speciale "GREETING" che il system prompt
  //    sa interpretare come "saluta Cristiano basandoti sul contesto attuale"
  //    Il saluto entra nella chat come messaggio assistant normale.
  // 3. Scrolla in fondo
}, []);
```

### Bolle messaggio (regole UI)

**Bolla utente** (destra, ~80% larghezza max):
```css
background: rgba(177, 107, 255, 0.12);  /* --neon-violet con alpha */
border: 1px solid rgba(177, 107, 255, 0.25);
border-radius: 20px 20px 4px 20px;       /* coda in basso a destra */
backdrop-filter: blur(20px);
padding: 12px 16px;
font-family: General Sans / Geist;
color: var(--text-primary);
```

**Bolla Will** (sinistra, ~80% larghezza max):
```css
background: rgba(0, 229, 255, 0.08);   /* --neon-cyan con alpha */
border: 1px solid rgba(0, 229, 255, 0.18);
border-radius: 20px 20px 20px 4px;       /* coda in basso a sinistra */
backdrop-filter: blur(20px);
padding: 12px 16px;
```

**Bolla `action_confirm`** (sinistra, piccola e centrata):
```
✓ Salvato!     ← con icona check in --neon-lime, glow leggero, max-width: fit-content
```

**Bolla `memory_card`** (sinistra, contenitore più grande):
```
┌─────────────────────────────────┐
│  📅 Vacanza a Napoli            │
│  2-4 giugno · Napoli            │
│  [tap → vai al calendario]      │
└─────────────────────────────────┘
```

**Bolla `memory_list`** (sinistra, contenuto a lista):
```
Ho trovato 3 ricette salvate:
  • Pasta alla norma
  • Carbonara veloce
  • Tiramisù della nonna
[tap su una → espande]
```

### Animazioni richieste

- **Nuovo messaggio**: fade-in + slide-up dal basso + scale 0.96→1, durata 350ms, ease-out (Motion)
- **Typing indicator**: 3 puntini cyan che pulsano staggered (delay 0/150/300ms), in glass bubble
- **Effetto typewriter** sui messaggi di Will: lettera-per-lettera a 18ms (più veloce di prima per non frustrare in chat)
- **Tap su chip**: scale 0.95 spring, manda il messaggio
- **Chip dopo invio**: la chip premuta scompare con fade-out
- **Apparizione del saluto iniziale**: ritardo di 400ms dopo il mount per dare effetto "Will che si sveglia"
- **Scroll automatico** al fondo quando arriva un nuovo messaggio (smooth)
- **Pull-to-refresh** in alto: ricarica gli ultimi messaggi dal DB

### Microfono nella ChatInputBar

```
Stato idle:
[✏️ Scrivi a Will...]                    [🎙️]

Stato listening (tap su mic):
[▮▮▯▯▮▮▮▯▯ visualizzatore live]         [■]
↑ il campo testo si TRASFORMA nel visualizzatore audio
↑ il button microfono diventa stop quadrato in --neon-pink

Stato processing (dopo stop):
[Will sta ascoltando... ◌◌◌]             [⏳]

Stato dopo trascrizione:
[testo trascritto comparso]               [→]
↑ tap → manda il messaggio
↑ se rilevi 1 secondo di silenzio puoi anche inviare automaticamente
```

### Generazione saluto dinamico

Quando l'app si apre e l'ultima conversazione è di > 1 ora fa, viene chiamato `processMessage` con un input speciale:

```javascript
await processMessage({
  text: '__GREETING__',  // input speciale riconosciuto dal system prompt
  source: 'app_text'
});
```

Nel system prompt aggiungi:

```
# CASO SPECIALE: GREETING
Se il messaggio è esattamente "__GREETING__", non interpretarlo come testo dell'utente.
Genera un saluto personalizzato basato sul contesto:
- Saluta per nome
- Cita 1-2 cose rilevanti per oggi (eventi imminenti, note recenti, anniversari)
- Termina con una domanda aperta tipo "Cosa facciamo?" o "Di cosa parliamo?"
- Massimo 3 frasi
- Tono: caloroso ma non zuccheroso
Il saluto NON crea memorie (actions: [])
```

---

## PARTE 5 — Calendario e Note come proiezioni

Le viste Calendario e Note continuano a esistere ma ora sono **filtri sulla tabella `memories`**:

### Calendario
- Query: `SELECT * FROM memories WHERE memory_type IN ('event', 'reminder') AND trigger_at IS NOT NULL`
- Stessa UI calendario di prima, ma legge da `memories`
- Cancellazione → `DELETE FROM memories WHERE id = ?`

### Note
- Query: `SELECT * FROM memories WHERE memory_type IN ('knowledge', 'idea', 'fact', 'preference') AND trigger_at IS NULL ORDER BY created_at DESC`
- Stessa UI lista note di prima
- Mostra il `memory_type` come piccolo badge colorato sulla card (per distinguere "preferenza" da "ricetta" ecc.)

---

## PARTE 6 — Migrazione dati esistenti

Dopo che tutto il nuovo funziona (test parallelo per qualche giorno), esegui lo script di migrazione **una volta sola**:

```sql
-- File: migrations/migrate_old_to_memories.sql

-- Migra events → memories
INSERT INTO memories (id, content, memory_type, trigger_at, trigger_end, source, created_at, importance)
SELECT 
  id,
  title || COALESCE(' — ' || description, ''),
  'event',
  start_date,
  end_date,
  COALESCE(source, 'app_text'),
  created_at,
  3
FROM events;

-- Migra notes → memories  
INSERT INTO memories (id, content, memory_type, tags, source, created_at, importance)
SELECT
  id,
  COALESCE(title || E'\n', '') || content,
  'knowledge',
  tags,
  COALESCE(source, 'app_text'),
  created_at,
  3
FROM notes;

-- Gli embeddings vanno generati dopo la migrazione (script JS separato)
```

**Script JS post-migrazione** (`scripts/generate_embeddings.js`) che cicla tutte le memorie con `embedding IS NULL`, genera l'embedding, e fa UPDATE. Lo lanci una volta dopo la migrazione SQL.

**Drop finale** (solo dopo verifica completa):
```sql
DROP TABLE events;
DROP TABLE notes;
DROP TABLE conversations;  -- se non più usata, altrimenti rinomina
DROP TABLE sent_notifications_old;
```

---

## PARTE 7 — Aggiornamento Edge Function Telegram

La Edge Function Telegram esistente deve usare il nuovo brain. Aggiorna `supabase/functions/telegram-webhook/index.ts`:

```typescript
// Importa il brain condiviso (versione Deno)
import { processMessage } from '../_shared/brain.ts';

Deno.serve(async (req) => {
  const update = await req.json();
  const message = update.message;
  
  // Filtro user_id (come prima)
  if (message.from.id !== Number(Deno.env.get('ALLOWED_TELEGRAM_USER_ID'))) {
    return new Response('Forbidden', { status: 403 });
  }
  
  let text = message.text;
  let source = 'telegram_text';
  
  // Gestione audio
  if (message.voice) {
    text = await transcribeTelegramVoice(message.voice.file_id);
    source = 'telegram_voice';
  }
  
  // USA IL NUOVO BRAIN
  const result = await processMessage({ text, source });
  
  // Manda risposta a Telegram
  await sendTelegramMessage(
    Deno.env.get('ALLOWED_TELEGRAM_USER_ID')!,
    result.assistantMessage.content
  );
  
  return new Response('OK');
});
```

---

## Step di sviluppo (ordine raccomandato)

### Fase A — Database (1-2 giorni)
1. Crea branch `refactor/semantic-memory`
2. Abilita `vector` extension
3. Crea le nuove tabelle (`memories`, `user_profile`, `chat_messages`, nuova `sent_notifications`)
4. Crea le funzioni SQL (`search_memories`, `recall_memories`, `decay_relevance_scores`)
5. Crea trigger per `content_fts`
6. Test SQL manuale: inserisci una memoria con embedding fasullo, verifica search

### Fase B — Brain refactoring (3-4 giorni)
1. `src/brain/embeddings.js`
2. `src/brain/searchMemories.js`
3. `src/brain/systemPrompt.js`
4. `src/brain/llm.js` (aggiornamento del chiamante Groq)
5. `src/brain/actions.js`
6. `src/brain/processMessage.js`
7. Test isolato: chiama `processMessage` da un componente di debug

### Fase C — Heartbeat (1-2 giorni)
1. Edge Function `heartbeat/index.ts`
2. Funzione SQL `decay_relevance_scores`
3. Setup cron job 3:00 AM
4. Test manuale dell'endpoint

### Fase D — Nuova Home Chat (3-4 giorni)
1. Componenti UI in `src/components/chat/`
2. Riscrittura `Home.jsx`
3. Saluto dinamico al mount
4. Integrazione microfono nella InputBar
5. Tutte le animazioni Motion

### Fase E — Migrazione & cleanup (mezza giornata)
1. Test in parallelo per qualche giorno (vecchio + nuovo coesistono)
2. Esegui migrate_old_to_memories.sql
3. Lancia generate_embeddings.js
4. Verifica dati migrati
5. Drop tabelle vecchie
6. Merge branch in main

### Fase F — Aggiornamenti collaterali (mezza giornata)
1. Aggiorna Calendario e Note come proiezioni di memories
2. Aggiorna Edge Function Telegram per usare nuovo brain
3. Aggiorna Edge Function notifiche per usare memorie con trigger_at

---

## Acceptance Criteria

### Funzionali (tecnici)
1. ✅ La tabella `memories` esiste, con tutte le colonne, indici e trigger
2. ✅ `search_memories()` ritorna risultati per ricerca ibrida
3. ✅ Will salva qualsiasi cosa nelle memorie con il tipo corretto dedotto dal contesto
4. ✅ Will chiede conferma quando il messaggio è ambiguo (non inventa)
5. ✅ Will riconosce conflitti su date già occupate e chiede conferma
6. ✅ "Salva ricetta pasta alla norma" → memory_type='knowledge', tags=['ricetta']
7. ✅ "Ricordami di chiamare Franco domani alle 10" → memory_type='reminder', trigger_at corretto
8. ✅ "Mi piace il viola" → memory_type='preference'
9. ✅ "Che ricette ho salvato?" → search_memories trova le memorie ricetta e Will le elenca per nome
10. ✅ Heartbeat notturno gira, aggiorna profilo, fa decay
11. ✅ Edge Function Telegram usa il nuovo brain e ha stessa intelligenza dell'app
12. ✅ Dati vecchi migrati senza perdita

### UI / UX (irrinunciabili)
1. ✅ Home è una chat conversazionale, NON una schermata comandi
2. ✅ All'apertura: saluto dinamico di Will che cita il contesto reale del giorno
3. ✅ Chips scorciatoie funzionano, scompaiono dopo l'uso
4. ✅ Bolle in glass cyan (Will) e glass viola (utente)
5. ✅ Typewriter effect sulle risposte di Will (18ms/char)
6. ✅ Microfono nella input bar trasforma il campo in visualizzatore audio quando attivo
7. ✅ Memory cards in chat sono tappabili e portano al calendario/nota
8. ✅ Scroll è fluido, automatico ai nuovi messaggi
9. ✅ Animazioni Motion mantengono 60fps su mobile reale
10. ✅ Persistenza completa: chiudi e riapri l'app, vedi la conversazione di prima

---

## Note finali

- **Non rompere il design esistente**: aurora, glass, palette, tipografia restano. Cambia solo la composizione della Home.
- **Non saltare le fasi**: il database va per primo, perché tutto il resto dipende da quello.
- **Test ogni fase isolata** prima di passare alla successiva. Non lasciare codice non testato dietro.
- **Commit a ogni fase**: il branch deve avere un commit pulito per ogni Fase A/B/C/D/E/F.
- **Quando hai dubbi sul system prompt**, ricorda: l'obiettivo è che Will sembri un compagno digitale che conosce Cristiano, non un bot che risponde. Se il tono del system prompt sembra "robotico", riscrivilo più caldo.
- **Performance target**: dal tap "invia" alla bolla di Will visibile, max 3 secondi su connessione normale.
