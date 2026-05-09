# Step 12 — Evoluzione da bot a vera IA: Context-Aware Assistant

## Contesto

Jarvis funziona: riconosce comandi vocali/testuali, estrae intent, esegue CRUD su Supabase, risponde. Ma il comportamento attuale è quello di un **parser di comandi**, non di un assistente intelligente. Risponde in modo meccanico, non ragiona, non fa collegamenti, non conosce il contesto dell'utente.

Questo step trasforma Jarvis in un **assistente che ragiona**, capace di:
- Rispondere a domande aperte ("che settimana mi aspetta?", "ho tempo libero questo weekend?")
- Fare collegamenti tra informazioni ("l'ultima volta che sei andato a Napoli...")
- Suggerire, avvisare, contestualizzare ("mercoledì hai già un impegno nel pomeriggio, ma la mattina sei libera")
- Conversare naturalmente, non solo eseguire comandi
- Ricordare il contesto della conversazione corrente (multi-turn)

---

## Architettura attuale (da cambiare)

```
Utente parla/scrive
      ↓
Gemini riceve SOLO il comando isolato
      ↓
Estrae intent + data (JSON rigido)
      ↓
CRUD meccanico su Supabase
      ↓
Risposta template ("Ho segnato X")
```

## Nuova architettura (context-aware)

```
Utente parla/scrive
      ↓
L'app raccoglie CONTESTO FRESCO da Supabase:
  • Eventi di oggi
  • Eventi dei prossimi 7 giorni
  • Eventi dei 7 giorni passati
  • Ultime 10 note
  • Ultime 5 conversazioni della sessione
      ↓
Gemini riceve: system prompt + contesto completo + storico conversazione + messaggio utente
      ↓
Gemini RAGIONA e decide autonomamente:
  → È un comando? → restituisce JSON con intent + action
  → È una domanda? → risponde in linguaggio naturale usando il contesto
  → È una conversazione? → risponde naturalmente
      ↓
Se c'è un'azione → esegui CRUD
Sempre → rispondi all'utente con la voce/testo di Gemini
```

---

## Cosa cambia nel codice

### 1. Nuovo context builder: `src/brain/buildContext.js`

Questa funzione viene chiamata **prima di ogni invio a Gemini**. Interroga Supabase e costruisce una stringa di contesto da iniettare nel prompt.

```javascript
// src/brain/buildContext.js

export async function buildContext() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  // 1. Eventi di oggi
  const todayEvents = await getEventsByDateRange(startOfDay(now), endOfDay(now));
  
  // 2. Eventi prossimi 7 giorni
  const upcomingEvents = await getEventsByDateRange(now, addDays(now, 7));
  
  // 3. Eventi ultimi 7 giorni (per memoria recente)
  const recentEvents = await getEventsByDateRange(addDays(now, -7), now);
  
  // 4. Ultime 10 note
  const recentNotes = await getRecentNotes(10);
  
  // 5. Statistiche veloci
  const totalEvents = await countEvents();
  const totalNotes = await countNotes();
  
  // Componi il contesto come stringa leggibile
  return `
## STATO ATTUALE
Data e ora: ${now.toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'full', timeStyle: 'short' })}
Giorno della settimana: ${now.toLocaleDateString('it-IT', { weekday: 'long' })}

## EVENTI DI OGGI (${todayEvents.length})
${formatEvents(todayEvents) || 'Nessun evento oggi.'}

## EVENTI PROSSIMI 7 GIORNI (${upcomingEvents.length})
${formatEvents(upcomingEvents) || 'Nessun evento in programma.'}

## EVENTI ULTIMI 7 GIORNI (${recentEvents.length})
${formatEvents(recentEvents) || 'Nessun evento recente.'}

## NOTE RECENTI (ultime 10 di ${totalNotes} totali)
${formatNotes(recentNotes) || 'Nessuna nota.'}

## STATISTICHE
- Eventi totali nel calendario: ${totalEvents}
- Note totali: ${totalNotes}
  `.trim();
}
```

**Funzioni helper necessarie** (da aggiungere a `database.js`):
- `getEventsByDateRange(start, end)` → SELECT eventi tra due date, ORDER BY start_date
- `getRecentNotes(limit)` → SELECT ultime N note, ORDER BY created_at DESC
- `countEvents()` → SELECT COUNT(*) da events
- `countNotes()` → SELECT COUNT(*) da notes

### 2. Nuovo system prompt: `src/brain/systemPrompt.js`

Il vecchio system prompt istruiva Gemini a fare solo parsing di comandi e restituire JSON. Il nuovo deve istruirlo a **essere un assistente intelligente** che può sia eseguire azioni sia conversare.

```javascript
// src/brain/systemPrompt.js

export function buildSystemPrompt(context) {
  return `
Sei Jarvis, l'assistente personale di Cristiano. Sei intelligente, amichevole, conciso e utile.

## CHI SEI
- Un assistente personale che conosce il calendario e le note di Cristiano
- Parli italiano naturale, mai robotico o formale
- Sei proattivo: se noti qualcosa di utile nel contesto (conflitti, giorni liberi, pattern), lo segnali
- Sei conciso: risposte brevi e dirette, niente fuffa. Massimo 2-3 frasi per le risposte semplici.
- Hai personalità: puoi fare battute leggere, essere empatico, usare un tono umano

## COME FUNZIONI

Ricevi un messaggio dall'utente. Puoi fare DUE cose:

### A) ESEGUIRE UN'AZIONE (aggiungere/cancellare evento o nota)
Se l'utente ti chiede di fare qualcosa (aggiungere, segnare, cancellare, modificare), rispondi con un JSON così:

\`\`\`json
{
  "type": "action",
  "intent": "add_event | add_note | delete_event | delete_note | update_event",
  "data": {
    "title": "...",
    "start_date": "ISO 8601",
    "end_date": "ISO 8601",
    "location": "...",
    "description": "...",
    "content": "... (per le note)",
    "search_query": "... (per delete/update, il termine da cercare)"
  },
  "response": "Frase di conferma naturale e umana"
}
\`\`\`

### B) RISPONDERE / CONVERSARE
Per qualsiasi altra cosa (domande, conversazione, richieste di info), rispondi con:

\`\`\`json
{
  "type": "conversation",
  "response": "La tua risposta naturale qui"
}
\`\`\`

## REGOLE PER LE RISPOSTE INTELLIGENTI

1. **Usa SEMPRE il contesto** per rispondere. Se l'utente chiede "sono libero mercoledì?" GUARDA gli eventi dei prossimi 7 giorni e rispondi con dati reali.
2. **Fai collegamenti**. Se l'utente dice "voglio andare a Napoli", e vedi che c'è già stata una vacanza a Napoli, menzionalo brevemente.
3. **Segnala conflitti**. Se l'utente vuole aggiungere un evento in un giorno già occupato, avvisalo: "Attenzione, quel giorno hai già X. Segno lo stesso?"
4. **Contestualizza**. "Che settimana mi aspetta?" → non elencare e basta. Di' qualcosa tipo "Settimana tranquilla, hai solo 2 impegni" oppure "Settimana piena, 5 impegni in 4 giorni diversi."
5. **Suggerisci quando ha senso**. Se l'utente ha molti giorni liberi, puoi dirlo. Se ha troppi impegni in un giorno, puoi suggerire di spostare qualcosa.
6. **Date relative**: "domani", "dopodomani", "lunedì prossimo", "fra 3 giorni", "la prossima settimana" → risolvile usando la data/ora corrente fornita nel contesto.

## FORMATO OUTPUT

Rispondi SEMPRE e SOLO con un oggetto JSON valido. Niente testo prima o dopo il JSON.
Il campo "response" deve essere in italiano naturale, come se parlassi a un amico.

## CONTESTO ATTUALE DI CRISTIANO

${context}
  `.trim();
}
```

### 3. Conversazione multi-turn: `src/brain/conversationHistory.js`

Jarvis deve ricordare cosa è stato detto **nella sessione corrente** (non tra sessioni diverse — per quello c'è il database). Questo permette scambi tipo:

- **Tu:** "Segna riunione giovedì alle 15"
- **Jarvis:** "Fatto! Riunione segnata per giovedì 12 alle 15."
- **Tu:** "Anzi spostala alle 16"
- **Jarvis:** (capisce che "la" si riferisce alla riunione appena creata)

```javascript
// src/brain/conversationHistory.js

// Tiene lo storico della sessione corrente in memoria (non su DB)
let sessionHistory = [];

export function addToHistory(role, content) {
  sessionHistory.push({ role, content });
  // Tieni massimo le ultime 10 coppie (20 messaggi) per non esplodere il contesto
  if (sessionHistory.length > 20) {
    sessionHistory = sessionHistory.slice(-20);
  }
}

export function getHistory() {
  return [...sessionHistory];
}

export function clearHistory() {
  sessionHistory = [];
}
```

### 4. Aggiornamento di `interpretCommand.js`

Il file principale del brain cambia significativamente. Non manda più solo il comando isolato a Gemini, ma:

1. Chiama `buildContext()` per ottenere il contesto fresco
2. Chiama `buildSystemPrompt(context)` per costruire il prompt con il contesto
3. Aggiunge lo storico della conversazione
4. Manda tutto a Groq/Gemini
5. Parsa la risposta
6. Se `type === "action"` → esegue il CRUD e poi risponde
7. Se `type === "conversation"` → risponde direttamente
8. Aggiunge sia il messaggio utente che la risposta allo storico sessione

```javascript
// src/brain/interpretCommand.js (RISCRITTO)

import { buildContext } from './buildContext.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { addToHistory, getHistory } from './conversationHistory.js';
import { executeIntent } from './executeIntent.js';

export async function processMessage(userMessage) {
  // 1. Costruisci contesto fresco dal database
  const context = await buildContext();
  
  // 2. Costruisci system prompt con contesto
  const systemPrompt = buildSystemPrompt(context);
  
  // 3. Prepara i messaggi con lo storico della sessione
  const history = getHistory();
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage }
  ];
  
  // 4. Chiama l'API (Groq o Gemini — adatta in base a quale usi)
  const response = await callLLM(messages);
  
  // 5. Parsa la risposta JSON
  const parsed = JSON.parse(response);
  
  // 6. Se è un'azione, eseguila
  if (parsed.type === 'action') {
    await executeIntent(parsed);
  }
  
  // 7. Aggiorna lo storico della sessione
  addToHistory('user', userMessage);
  addToHistory('assistant', parsed.response);
  
  // 8. Ritorna la risposta per la UI/voce
  return {
    type: parsed.type,
    intent: parsed.intent || null,
    response: parsed.response
  };
}
```

### 5. Aggiornamento della UI (Home/Assistente)

La schermata Home deve riflettere che ora Jarvis è conversazionale:

- **Cronologia conversazione** visibile: non solo l'ultimo comando, ma tutta la sessione corrente come una chat (messaggi utente a destra, risposte Jarvis a sinistra, in card di vetro)
- **Il campo input testuale** cambia placeholder in base al contesto:
  - Default: "Chiedi qualcosa a Jarvis..."
  - Dopo un'azione: "Vuoi modificare qualcosa?"
  - Mattina: "Buongiorno! Cosa facciamo oggi?"
- **Indicatore di "pensiero"**: quando Jarvis sta elaborando (fetching context + calling LLM), mostrare un'animazione di "thinking" più elaborata dei semplici 3 puntini — ad esempio le barre audio che pulsano lentamente in viola, o un glow che respira sul pulsante microfono

### 6. Aggiornamento della Edge Function Telegram

La Edge Function del webhook Telegram deve fare lo stesso: prima di rispondere, chiama `buildContext()` e usa il system prompt arricchito.

**Nota su multi-turn via Telegram:** Lo storico sessione in-memory non funziona per la Edge Function (che è stateless). Due opzioni:
- **Opzione semplice (consigliata):** Telegram non ha multi-turn. Ogni messaggio è indipendente, ma ha comunque il contesto completo del database. Per il 90% dei casi basta.
- **Opzione avanzata (futura):** Salvare le ultime 5 conversazioni Telegram nella tabella `conversations` e rileggerle nel contesto. Implementala solo se senti il bisogno.

---

## Gestione dei conflitti e conferme

Ora che Jarvis ragiona, può individuare problemi. In questi casi deve chiedere conferma:

**Caso conflitto:**
- Utente: "Segna riunione mercoledì alle 15"
- Jarvis vede che mercoledì alle 15 c'è già "Dentista"
- Risposta:
```json
{
  "type": "conversation",
  "response": "Mercoledì alle 15 hai già il dentista. Vuoi che segno la riunione lo stesso o preferisci un altro orario?"
}
```
- NON esegue l'azione. Aspetta che l'utente confermi.
- Se l'utente dice "sì segna lo stesso" → a quel punto Jarvis restituisce il JSON con `type: "action"` ed esegue.

**Caso cancellazione ambigua:**
- Utente: "Cancella la riunione"
- Ci sono 3 riunioni in calendario
- Risposta:
```json
{
  "type": "conversation", 
  "response": "Ho trovato 3 riunioni: Riunione con Giuseppe (mercoledì 15:00), Riunione team (venerdì 10:00), Riunione budget (lunedì 9:00). Quale vuoi cancellare?"
}
```

Questo comportamento è gestito interamente dal system prompt — Gemini/Groq capisce dal contesto che deve chiedere conferma invece di agire.

---

## Ottimizzazione performance

Il `buildContext()` fa diverse query a Supabase ad ogni messaggio. Per evitare latenza eccessiva:

1. **Esegui le query in parallelo** con `Promise.all()`:
```javascript
const [todayEvents, upcomingEvents, recentEvents, recentNotes, totalEvents, totalNotes] = 
  await Promise.all([
    getEventsByDateRange(startOfDay, endOfDay),
    getEventsByDateRange(now, addDays(now, 7)),
    getEventsByDateRange(addDays(now, -7), now),
    getRecentNotes(10),
    countEvents(),
    countNotes()
  ]);
```

2. **Cache leggera in sessione**: se l'utente manda 3 messaggi in 30 secondi, non rifare tutte le query ogni volta. Cachea il contesto per 60 secondi e invalidalo solo dopo un'azione di scrittura (add/delete/update).

3. **Non esagerare con il contesto**: 10 note + 7 giorni di eventi + 7 giorni passati è un buon bilanciamento. Se il contesto diventa troppo grande (>2000 token), taglia le note più vecchie e gli eventi passati.

---

## Vincoli

- **Non rompere le funzionalità esistenti** — il flusso add_event, add_note, delete deve continuare a funzionare esattamente come prima. Questa è un'evoluzione, non una riscrittura.
- **Il JSON di risposta ha SEMPRE il campo `type`** ("action" o "conversation") — la UI/Edge Function lo usa per decidere se eseguire un'azione o solo mostrare la risposta.
- **Contesto fresco, non stantio** — `buildContext()` viene chiamato ad ogni messaggio, non una volta sola all'avvio dell'app.
- **Non mandare contesto sensibile a Groq/Gemini** che non sia nel database — no dati personali hardcodati nel prompt (indirizzo di casa, telefono, ecc.), solo quello che c'è in events/notes.
- **Risposte concise** — il system prompt deve enfatizzare brevità. Un assistente vocale che risponde con un muro di testo è inutile. Max 2-3 frasi per risposte semplici, max 5-6 per riepiloghi.

---

## Acceptance Criteria

1. ✅ "Sono libero mercoledì?" → Jarvis guarda gli eventi e risponde con dati reali (non "non ho questa informazione")
2. ✅ "Che settimana mi aspetta?" → Jarvis contestualizza ("settimana leggera" / "settimana piena") e elenca gli impegni
3. ✅ "Segna riunione giovedì alle 15" quando giovedì è occupato → Jarvis segnala il conflitto e chiede conferma
4. ✅ "Anzi spostala alle 16" (dopo aver appena creato un evento) → Jarvis capisce il riferimento e agisce
5. ✅ "Cancella la riunione" con più riunioni → Jarvis chiede quale
6. ✅ Le azioni (add/delete) continuano a funzionare come prima
7. ✅ La conversazione in-app mantiene lo storico della sessione (multi-turn)
8. ✅ Il bot Telegram risponde con la stessa intelligenza (ma senza multi-turn per ora)
9. ✅ La latenza totale (context build + LLM call) resta sotto i 3 secondi su connessione normale
10. ✅ La UI mostra la conversazione come chat (bolle utente/assistente) e non solo l'ultimo messaggio
