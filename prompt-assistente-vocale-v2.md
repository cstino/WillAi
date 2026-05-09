# Prompt per Antigravity — "Jarvis" Assistente Personale Vocale + Telegram

## Contesto progetto

Sto costruendo un assistente personale con IA, accessibile in tre modi:
1. **PWA mobile** (voce o testo)
2. **Bot Telegram** (testo o audio)
3. *(In futuro: widget iOS / scorciatoia Siri)*

App e bot condividono lo stesso "cervello" e lo stesso database Supabase. Se aggiungo un evento da Telegram, lo vedo nell'app e viceversa.

L'utente parla/scrive comandi in italiano naturale ("segna che il 2 giugno vado a Napoli fino al 4", "ho impegni per il 3 giugno?", "aggiungi nota: comprare il latte"). L'IA capisce l'intento, esegue l'azione su Supabase, e risponde a voce (in app) o via messaggio (su Telegram).

**Stack tecnologico:**
- Frontend: React + Vite (PWA installabile)
- Database: Supabase (PostgreSQL)
- Edge Function Supabase (Deno) per il webhook Telegram
- IA: Google Gemini 2.0 Flash API (gratuita) per interpretare i comandi
- Riconoscimento vocale (app): Web Speech API
- Sintesi vocale (app): Web Speech Synthesis API
- Trascrizione audio (Telegram): Gemini stesso (supporta input audio)
- Hosting: Vercel
- Lingua: Italiano

---

## 🛠️ Skill Antigravity da utilizzare

Prima di iniziare lo sviluppo, installa la collezione **Antigravity Awesome Skills**:

**Repository:** https://github.com/sickn33/antigravity-awesome-skills

**Comando di installazione:**
```bash
npx antigravity-awesome-skills --antigravity
```

Questo installa le skill in `~/.gemini/antigravity/skills/` (directory globale Antigravity), e l'agent le invocherà on-demand quando rilevanti.

### Skill da invocare in base allo step

Per ogni fase di sviluppo, considera l'uso di queste skill specifiche (richiamabili con la sintassi `@nome-skill`):

**Step 1 — Setup + design system base:**
- `@frontend-design` — qualità UI generale, evita "look AI generico"
- `@frontend-ui-dark-ts` — pattern UI dark con Tailwind + Framer Motion + glassmorphism (perfetto per questo progetto)
- `@tailwind-patterns` — Tailwind v4, container queries, design token architecture
- `@core-components` — pattern per design system riutilizzabili
- `@brainstorming` — pianificazione iniziale prima di scrivere codice

**Step 2 — Database Supabase:**
- `@database-design` — schema design, indexing strategy
- `@architecture` — decisioni architetturali

**Step 3 — Brain condiviso (Gemini):**
- `@gemini-api-dev` — uso corretto delle API Gemini
- `@llm-structured-output` — JSON affidabile dalle LLM (cruciale per il flusso intent → JSON)
- `@prompt-engineering` — system prompt efficaci
- `@error-handling-patterns` — gestione errori robusta nelle chiamate API

**Step 4-5 — Speech + UI Assistente:**
- `@frontend-design`
- `@frontend-dev-guidelines` — standard frontend production-grade

**Step 6-7 — Calendario + Note:**
- `@frontend-dev-guidelines`
- `@core-components`

**Step 9 — Edge Function Telegram:**
- `@backend-dev-guidelines` — standard backend production-grade
- `@error-handling-patterns`

**Step 10 — Polish e validazione finale:**
- `@lint-and-validate` — quality check leggero su tutto il codebase

**Importante:** non installare/attivare tutte le 1.441 skill della collezione — sono troppe e rallentano la decisione dell'agent. Le skill sopra sono sufficienti per questo progetto.

---

## 🎨 DIREZIONE DESIGN — Glassmorphism scuro neon

Questa sezione è **prioritaria** ed è il vero differenziatore del progetto. L'app deve sembrare uscita da visionOS, Arc Browser, Linear, o Raycast — non da un template generico.

### Concept estetico

**"Vetro liquido sospeso nel buio, attraversato da bagliori neon."**

L'app trasmette tre sensazioni:
- **Profondità** → strati di vetro semitrasparente che si sovrappongono, come finestre fluttuanti
- **Vita** → ogni interazione ha una risposta visiva fluida, niente è statico o "secco"
- **Eleganza tecnologica** → tipografia raffinata, colori controllati, mai chiassosi

### Palette colori (CSS variables)

```css
:root {
  /* Sfondo base — non nero puro, ma blu-nero profondo con sfumature */
  --bg-base: #08070C;
  --bg-elevated: #0F0E14;
  --bg-deep: #050409;

  /* Vetro (glass surfaces) */
  --glass-bg: rgba(255, 255, 255, 0.04);
  --glass-bg-strong: rgba(255, 255, 255, 0.08);
  --glass-border: rgba(255, 255, 255, 0.10);
  --glass-border-strong: rgba(255, 255, 255, 0.18);

  /* Accenti neon — usati con parsimonia, mai più di uno dominante per schermata */
  --neon-cyan: #00E5FF;       /* primario, per stato attivo / microfono */
  --neon-violet: #B16BFF;     /* secondario, per note */
  --neon-pink: #FF4FB8;       /* terziario, per eventi */
  --neon-lime: #B6FF4D;       /* successo / conferma */

  /* Aurora gradient (per glow di sfondo dietro elementi chiave) */
  --aurora-1: #5B2EFF;
  --aurora-2: #00E5FF;
  --aurora-3: #FF4FB8;

  /* Testo */
  --text-primary: rgba(255, 255, 255, 0.96);
  --text-secondary: rgba(255, 255, 255, 0.64);
  --text-tertiary: rgba(255, 255, 255, 0.36);

  /* Ombre profonde per sospensione */
  --shadow-glow-cyan: 0 0 40px rgba(0, 229, 255, 0.35);
  --shadow-glow-violet: 0 0 40px rgba(177, 107, 255, 0.35);
  --shadow-elevation: 0 24px 48px -12px rgba(0, 0, 0, 0.8);
}
```

### Tipografia

**Niente Inter, niente Roboto, niente Arial.** Usa font che danno carattere:

- **Display / Headers**: `"Instrument Serif"` o `"Fraunces"` (serif moderno con personalità) per titoli grandi e momenti emozionali (es. risposta dell'assistente, intestazione "Buongiorno Cristiano")
- **UI / Body**: `"General Sans"` o `"Geist"` (sans-serif geometrico moderno, alternative a Inter ma più caratteriali)
- **Mono / Numeri / Date**: `"JetBrains Mono"` o `"Geist Mono"` (per orari, date, stato del sistema)

Importa via Google Fonts o Fontshare. **Non usare font di sistema.**

Scala tipografica:
- Display XL: 56px / serif / line-height 1.0 / letter-spacing -0.03em
- Display L: 40px / serif
- Heading: 24px / sans / 600
- Body: 15px / sans / 400 / line-height 1.5
- Caption: 12px / mono / uppercase / letter-spacing 0.08em

### Sfondo della pagina (atmosphere layer)

Lo sfondo **non è mai un colore solido**. Costruisci un layered background:

1. Base scura (`--bg-base`)
2. **Aurora blob animata** in alto: due/tre cerchi di gradient (cyan → violet → pink) sfocati con `filter: blur(120px)`, opacity bassa (0.25), che si muovono lentamente con animazione CSS (durata 20-30s, ease-in-out infinita)
3. **Grain texture** sottile sopra tutto (rumore SVG o PNG con `mix-blend-mode: overlay`, opacity 0.04) — dà la sensazione di "pellicola"
4. Eventuale **noise/dot pattern** leggerissimo per profondità

### Glassmorphism (regole tecniche)

Ogni superficie "vetro" deve avere:
```css
background: var(--glass-bg);
backdrop-filter: blur(24px) saturate(180%);
-webkit-backdrop-filter: blur(24px) saturate(180%);
border: 1px solid var(--glass-border);
border-radius: 24px; /* generoso, mai meno di 16px */
box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.08),  /* highlight superiore */
  0 8px 32px rgba(0, 0, 0, 0.4);
```

**Importante**: la trasparenza funziona SOLO se c'è qualcosa sotto da sfocare. Per questo l'aurora animata sullo sfondo è essenziale.

### Pulsante microfono (l'eroe della home)

Questo è l'elemento più importante visivamente. Deve essere **memorabile**:

- Cerchio grande (~140px di diametro)
- Bordo in vetro con backdrop-blur
- All'interno: icona microfono in cyan
- **Idle state**: pulsazione lenta e respirante (scale 1 → 1.04 ogni 3s, ease-in-out)
- **Active (listening)**: 
  - Si espande leggermente (scale 1.1)
  - Glow esterno cyan acceso (`box-shadow: 0 0 80px var(--neon-cyan)`)
  - **Anelli concentrici** che pulsano verso l'esterno (3 cerchi, animazione staggered, opacity 0 → 0.6 → 0, scale 1 → 2.5)
  - **Visualizzazione audio**: barre verticali che reagiscono al volume (stile Siri/iOS, usa `AnalyserNode` di Web Audio API per i livelli reali)
- **Processing state**: rotazione di un anello gradient (cyan → violet) attorno al pulsante, durata 1s

Usa **Motion** (`framer-motion`) per le animazioni complesse, CSS keyframes per quelle semplici.

### Micro-interazioni richieste

- **Tap su qualsiasi elemento**: scale 0.96 con spring (Motion `whileTap`)
- **Hover su card**: lieve lift (translateY -2px) + bordo che si illumina
- **Apparizione di nuove card / messaggi**: fade-in + slide-up + scale 0.95 → 1, durata 400ms, ease-out
- **Cambio tab navbar**: indicatore che si sposta con `layoutId` di Motion (effetto "morph" tra le tab)
- **Risposta dell'assistente che appare**: testo che si scrive in stile typewriter (carattere per carattere, 25ms ciascuno) con cursore lampeggiante alla fine
- **Riconoscimento vocale in tempo reale**: il testo trascritto appare con effetto blur → sharp man mano che le parole vengono confermate
- **Successo azione**: flash di `--neon-lime` glow sotto la card creata, 600ms, dissolvenza
- **Errore**: shake orizzontale (3 oscillazioni, ±4px) + bordo rosso (`#FF5C5C`) momentaneo

### Navbar bottom (3 tab)

- Floating glassmorphism bar a ~16px dal bottom, larga ~90% dello schermo, ben centrata
- Contiene 3 icone: Assistente (forma a stella/spark), Calendario (icon-line), Note (foglio)
- L'**indicatore di tab attiva** è una "pillola" di vetro più chiara dietro l'icona, che si muove con `layoutId` Motion quando cambi tab
- L'icona attiva si colora di neon (cyan/violet/pink a seconda della tab)
- Safe-area inset rispettata per iPhone con notch/home indicator

### Calendario

- Vista mensile: griglia 7×n, celle quadrate
- Giorno corrente: bordo cyan + numero in bianco grassetto
- Giorni con eventi: piccolo "puntino" colorato sotto il numero (un puntino per evento, max 3, poi "+N")
- Tap su giorno: il giorno si "espande" verso il basso (animazione layout) rivelando la lista eventi di quel giorno in card di vetro
- Header con nome mese in serif gigante (40px+)
- Frecce per cambio mese con icone minimal lineari

### Note

- Lista verticale di card in vetro
- Ogni card: titolo in sans 600, preview in body, timestamp in mono caption
- Tap espande la card in modale a tutto schermo (animazione `layoutId` shared)
- Dentro la modale: contenuto completo con tipografia editoriale (line-height 1.7, max-width per leggibilità)
- Swipe orizzontale su card → rivela azione "elimina" in rosa-rosso

### Schermata Home (Assistente)

Composizione (mobile, dall'alto verso il basso):

1. **Header sottile** (top): "Buongiorno Cristiano" in serif 28px + ora corrente in mono caption
2. **Stato corrente** (subtle): "3 eventi questa settimana · 12 note" in caption secondary
3. **Pulsante microfono centrale** (l'eroe)
4. **Sotto il pulsante**: testo "Tieni premuto per parlare" in caption
5. **Trascrizione live** (appare quando parli): card in vetro che mostra il testo in tempo reale
6. **Risposta assistente** (appare dopo): card in vetro più grande, con testo serif, e icona dell'azione eseguita (📅 evento, 📝 nota, 🔍 query)
7. **Input testuale** (sempre presente): campo text in vetro in basso, sopra la navbar, con placeholder "...oppure scrivimi" e pulsante invio. Si espande in textarea multi-riga al focus.
8. **Cronologia comandi recenti** (opzionale, scrollabile): ultime 3-5 interazioni della sessione

### Cosa evitare assolutamente

- ❌ Inter, Roboto, Arial, font di sistema
- ❌ Gradient viola → rosa generici
- ❌ Bottoni rettangolari con border-radius 8px standard
- ❌ Card piatte con ombre soft generiche
- ❌ Shadcn/ui senza personalizzazione (puoi usarlo come base, ma riscrivi tutti gli stili)
- ❌ Emoji come icone principali (usa Lucide React, ma sostituisci icone chiave con SVG custom)
- ❌ Modali centrate vecchio stile — usa always full-screen sheets su mobile
- ❌ Loading spinner classici — usa skeleton glass o pulsazioni neon
- ❌ Toast notification standard — costruiscile in vetro con glow

---

## Funzionalità core

### 1. Triplo input
- **Voce** (in app): Web Speech API trascrive, invio a Gemini
- **Testo** (in app): campo input sempre visibile, invio a Gemini
- **Telegram** (testo o audio): bot riceve messaggi, li passa allo stesso flusso

### 2. Cervello unificato (Gemini 2.0 Flash)

Sia l'app che la Edge Function Telegram chiamano la **stessa funzione di interpretazione**. Il system prompt deve istruire Gemini a:
- Capire italiano naturale
- Estrarre date/orari (riferimenti relativi: "domani", "fra 3 giorni", "lunedì prossimo")
- Restituire **sempre** un JSON strutturato

```json
{
  "intent": "add_event | add_note | query_events | query_notes | delete_event | delete_note | general_answer",
  "data": {
    "title": "string",
    "start_date": "ISO 8601",
    "end_date": "ISO 8601",
    "location": "string",
    "description": "string",
    "query_text": "string (per le query)"
  },
  "response": "frase di conferma in italiano naturale e umano"
}
```

La data odierna viene **sempre passata dinamicamente** nel system prompt così Gemini risolve "domani" correttamente.

Per le query (`query_events`, `query_notes`, `general_answer`):
1. Gemini estrae i parametri della ricerca
2. L'app interroga Supabase
3. I risultati vengono **rimandati a Gemini** con un secondo prompt per generare una risposta in linguaggio naturale che cita gli eventi/note trovati

### 3. Database Supabase

```sql
-- Eventi calendario
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT true,
  source TEXT DEFAULT 'app',  -- 'app' | 'telegram'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Note
CREATE TABLE notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT,
  content TEXT NOT NULL,
  tags TEXT[],
  source TEXT DEFAULT 'app',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Log conversazioni (per cronologia + debug)
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  input_text TEXT NOT NULL,
  input_source TEXT NOT NULL,  -- 'voice' | 'text' | 'telegram'
  intent TEXT,
  response_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Policy aperte (no auth in fase 1)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON conversations FOR ALL USING (true) WITH CHECK (true);
```

### 4. Bot Telegram (Edge Function Supabase)

**Setup:**
1. Creare bot con BotFather → ottenere `BOT_TOKEN`
2. Creare Edge Function in `supabase/functions/telegram-webhook/`
3. Impostare il webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<EDGE_FUNCTION_URL>`
4. Variabili segrete su Supabase: `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `ALLOWED_TELEGRAM_USER_ID` (il tuo, per sicurezza — il bot deve rifiutare messaggi da altri utenti)

**Flusso Edge Function:**
1. Riceve update da Telegram
2. Verifica che `from.id` corrisponda a `ALLOWED_TELEGRAM_USER_ID` (altrimenti ignora)
3. Se messaggio testo → passa a `interpretCommand(text)`
4. Se messaggio audio (`voice`) → scarica file da Telegram, invia a Gemini con `inline_data` audio per ottenere trascrizione, poi `interpretCommand(transcript)`
5. Esegue azione su Supabase (riusa la stessa logica dell'app, condivisa via modulo)
6. Risponde all'utente Telegram via `sendMessage`

**File condiviso `_shared/brain.ts`** (riusato sia da app — via build — sia dalla Edge Function):
- `interpretCommand(text, currentDate)` → chiama Gemini, ritorna JSON
- `executeIntent(json)` → CRUD su Supabase, ritorna stringa di risposta
- `formatResponse(intent, data)` → formatta la risposta in italiano

### 5. Vista Calendario
Già descritta nella sezione Design.

### 6. Vista Note
Già descritta nella sezione Design.

---

## Vincoli tecnici

- **JavaScript**, no TypeScript nel frontend (TypeScript SOLO nella Edge Function Supabase, perché Deno lo richiede)
- **No autenticazione utente** in fase 1 (l'unico filtro è il check `telegram_user_id` per il bot)
- **No localStorage per dati persistenti** — tutto su Supabase
- **No librerie calendario** (FullCalendar, react-big-calendar) — costruisci tu la griglia
- **Tailwind CSS** per utility classes
- **Motion** (`framer-motion`) per animazioni complesse
- **Lucide React** per icone (con possibili sostituzioni custom)
- **Tutte le secret in `.env`**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`
- **Font**: caricati via `<link>` da Google Fonts/Fontshare nell'`index.html`
- **PWA**: `vite-plugin-pwa` con manifest, icone, theme-color `#08070C`, display `standalone`

---

## Acceptance Criteria

### Funzionali
1. ✅ Premo il microfono, parlo italiano, vedo testo trascritto in tempo reale
2. ✅ Scrivo nel campo testo "segna che il 2 giugno vado a Napoli fino al 4" → evento creato su Supabase con date corrette
3. ✅ Scrivo "ho impegni il 3 giugno?" → risposta vocale + testuale che cita la vacanza a Napoli
4. ✅ Scrivo "aggiungi nota: comprare il latte" → nota creata su Supabase
5. ✅ Scrivo al bot Telegram lo stesso comando → stesso risultato
6. ✅ Mando audio al bot Telegram → trascrizione e azione corrette
7. ✅ Solo il mio account Telegram può usare il bot, gli altri sono ignorati
8. ✅ Vista Calendario mostra eventi nei giorni giusti
9. ✅ Vista Note mostra tutte le note in ordine cronologico
10. ✅ App installabile come PWA, apre a tutto schermo

### Estetici (irrinunciabili)
1. ✅ Sfondo con aurora animata visibile e fluida
2. ✅ Tutte le superfici di contenuto usano glassmorphism con backdrop-blur reale
3. ✅ Tipografia mai default — serif per display, sans caratteriale per UI, mono per date
4. ✅ Pulsante microfono con almeno 3 stati animati (idle, listening, processing)
5. ✅ Visualizzazione audio reattiva al microfono (non finta)
6. ✅ Transizioni fluide tra tab con `layoutId` Motion
7. ✅ Effetto typewriter sulla risposta dell'assistente
8. ✅ Tap feedback su ogni elemento interattivo
9. ✅ Funziona a 60fps su iPhone medio (no jank durante animazioni)
10. ✅ Design coerente: chiunque guardi le 3 schermate capisce che fanno parte della stessa app

---

## Step di sviluppo

### Step 1 — Setup + design system base
- React + Vite + Tailwind + Motion + Lucide
- `vite-plugin-pwa` configurato
- Import font da Google Fonts/Fontshare
- File `src/styles/tokens.css` con tutte le CSS variables
- Componente `<AuroraBackground />` con blob gradient animati
- Componente `<GlassCard />` riusabile
- Test visivo: pagina vuota con sfondo aurora + una card di prova

### Step 2 — Database Supabase
- Esegui le query SQL fornite
- Crea `src/services/supabase.js`
- Crea `src/services/database.js` con funzioni CRUD per eventi, note, conversazioni

### Step 3 — Brain condiviso
- Crea `src/brain/interpretCommand.js` (system prompt + chiamata Gemini)
- Crea `src/brain/executeIntent.js` (router intent → CRUD)
- Test con input testuale dummy (senza UI)

### Step 4 — Speech (voce)
- Hook `useSpeechRecognition` (Web Speech API, `it-IT`)
- Service `speechSynthesis.js` con voce italiana
- Hook `useAudioVisualizer` (AnalyserNode per livelli audio reali)

### Step 5 — Schermata Home (Assistente)
- Header con saluto serif
- Pulsante microfono con tutti gli stati animati
- Visualizzatore audio
- Trascrizione live
- Card risposta con typewriter
- Input testuale in basso
- Cronologia comandi sessione

### Step 6 — Schermata Calendario
- Griglia mensile custom
- Indicatori eventi
- Espansione giorno con dettaglio
- Cancellazione evento

### Step 7 — Schermata Note
- Lista card vetro
- Modale full-screen con shared layout animation
- Cancellazione swipe

### Step 8 — Navbar bottom + routing
- React Router (`/`, `/calendar`, `/notes`)
- Navbar floating glassmorphism
- Indicatore attivo con `layoutId`

### Step 9 — Edge Function Telegram
- Setup `supabase/functions/telegram-webhook/index.ts`
- Logica: filtro user_id, gestione testo, gestione audio, riuso brain
- Deploy + setWebhook
- Test reale

### Step 10 — Polish PWA + test
- Manifest, icone (light/dark), splash screen
- Test su iPhone reale (Safari) e Android (Chrome)
- Verifica permessi microfono
- Verifica installazione PWA
- Verifica fluidità animazioni a 60fps

---

## Note finali per l'agente

- Il design è il differenziatore principale di questo progetto. **Non scendere a compromessi sull'estetica** per "fare prima". Se un componente non sembra all'altezza degli standard di visionOS / Arc / Linear, riscrivilo.
- Quando hai dubbi tra "veloce" e "bello", scegli **bello**. Le animazioni sono richieste esplicitamente.
- Riusa il `brain` (interpretCommand + executeIntent) tra app e Edge Function. **Non duplicare la logica.**
- Tutti i testi UI in italiano naturale, mai inglese.
- Commit incrementali a ogni Step completato.
