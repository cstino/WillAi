# Step 11 — Notifiche proattive via Telegram Bot

## Contesto

L'app Jarvis è funzionante: PWA con voce/testo, bot Telegram per comandi, database Supabase con tabelle `events`, `notes`, `conversations`. Il bot Telegram è già deployato come Edge Function su Supabase con webhook attivo.

Ora aggiungiamo le **notifiche proattive**: il bot Telegram mi scrive automaticamente per ricordarmi eventi e impegni, senza che io debba chiedere.

---

## Cosa deve fare

### 1. Riepilogo mattutino (ogni giorno alle 08:00)

Ogni mattina alle 8:00 (ora italiana, Europe/Rome) il bot mi manda un messaggio su Telegram con:

- Saluto contestuale ("Buongiorno Cristiano!")
- Lista degli eventi di **oggi**, ognuno con orario (se presente), titolo, e luogo
- Se non ci sono eventi: "Oggi nessun impegno in programma 🎉"
- Anteprima di **domani**: se ci sono eventi domani, una riga tipo "Domani: Riunione con Giuseppe alle 15:00"
- Numero di note create ieri (se > 0): "Ieri hai aggiunto 2 note"

Esempio di messaggio:
```
☀️ Buongiorno Cristiano!

📅 Oggi, lunedì 9 giugno:
• Vacanza a Napoli (tutto il giorno)

📅 Domani:
• Riunione con Giuseppe — 15:00

📝 Ieri hai aggiunto 1 nota.
```

Se non c'è nulla da comunicare (zero eventi oggi, zero domani, zero note ieri), **non mandare nessun messaggio** — niente spam inutile.

### 2. Promemoria pre-evento (1 ora prima)

Per ogni evento che ha un **orario specifico** (non all-day), il bot manda un promemoria 1 ora prima:

```
⏰ Tra 1 ora: Riunione con Giuseppe
📍 Ufficio LCB
```

- Solo per eventi con `all_day = false` e `start_date` con orario definito
- Il promemoria viene inviato **una sola volta** — servono un flag o una tabella per tracciare le notifiche già inviate

### 3. Riepilogo settimanale (lunedì mattina alle 08:30)

Ogni lunedì alle 08:30, subito dopo il riepilogo giornaliero, un secondo messaggio con:

```
📊 La tua settimana (9-15 giugno):
• Lunedì: Vacanza a Napoli
• Mercoledì: Riunione con Giuseppe — 15:00
• Venerdì: Dentista — 10:30

📝 Hai 24 note totali.
```

---

## Implementazione tecnica

### Nuova tabella per tracciare notifiche inviate

```sql
CREATE TABLE sent_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,  -- 'daily_summary' | 'pre_event' | 'weekly_summary'
  sent_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sent_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON sent_notifications FOR ALL USING (true) WITH CHECK (true);

-- Indice per evitare duplicati
CREATE UNIQUE INDEX idx_sent_notifications_unique 
  ON sent_notifications(event_id, notification_type) 
  WHERE notification_type = 'pre_event';
```

### Nuova Edge Function: `supabase/functions/telegram-notifications/index.ts`

Questa Edge Function viene invocata da un cron job e gestisce tutti e 3 i tipi di notifica.

**Logica:**

```
1. Determina ora corrente in fuso Europe/Rome
2. Determina quale tipo di notifica inviare:
   a. Se è tra le 07:55 e 08:05 → riepilogo mattutino
   b. Se è lunedì tra le 08:25 e 08:35 → riepilogo settimanale
   c. Per ogni ora → controlla eventi nelle prossime 55-65 minuti per promemoria pre-evento
3. Query Supabase per gli eventi rilevanti
4. Controlla `sent_notifications` per evitare duplicati
5. Componi il messaggio (testo formattato con emoji, Markdown Telegram)
6. Invia via Telegram Bot API: POST https://api.telegram.org/bot<TOKEN>/sendMessage
   - chat_id: il tuo ALLOWED_TELEGRAM_USER_ID
   - parse_mode: "Markdown"
   - text: il messaggio composto
7. Registra in `sent_notifications` che la notifica è stata inviata
```

**Variabili d'ambiente** (già presenti dalle Edge Function precedenti):
- `TELEGRAM_BOT_TOKEN`
- `ALLOWED_TELEGRAM_USER_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (serve la service role key, non la anon key, perché il cron non ha un utente autenticato)

### Cron job con pg_cron

Attiva l'estensione `pg_cron` su Supabase (Dashboard → Database → Extensions → cerca "pg_cron" → Enable).

Poi crea il cron job nell'SQL Editor di Supabase:

```sql
-- Esegui ogni 15 minuti (copre tutti i casi: daily, weekly, pre-event)
SELECT cron.schedule(
  'jarvis-notifications',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/telegram-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

**Nota:** Sostituisci `<PROJECT_REF>` con il tuo project ref Supabase e `<SUPABASE_SERVICE_ROLE_KEY>` con la service role key. Usa `net.http_post` che richiede l'estensione `pg_net` (abilitala insieme a `pg_cron`).

Il cron gira ogni 15 minuti. La Edge Function internamente decide cosa fare in base all'ora corrente:
- Alle 08:00 → manda il daily summary
- Alle 08:30 di lunedì → manda il weekly summary
- Ogni 15 min → controlla se ci sono eventi con orario nelle prossime 55-65 min che non hanno ancora ricevuto il promemoria

### Struttura della Edge Function

```
supabase/functions/telegram-notifications/index.ts

import { createClient } from '@supabase/supabase-js'

// 1. Init Supabase con service role key
// 2. Funzione sendTelegramMessage(text) → POST a Telegram API
// 3. Funzione buildDailySummary(today, tomorrow) → stringa formattata
// 4. Funzione buildWeeklySummary(weekStart, weekEnd) → stringa formattata
// 5. Funzione checkPreEventReminders(now) → array di messaggi
// 6. Handler principale:
//    - Calcola ora in Europe/Rome
//    - Se ora ~08:00 → daily summary (se non già inviato oggi)
//    - Se lunedì ~08:30 → weekly summary (se non già inviato questa settimana)
//    - Sempre → check pre-event reminders
```

---

## Vincoli

- **Non mandare messaggi vuoti** — se non c'è nulla da notificare, la funzione esce silenziosamente
- **Mai duplicare una notifica** — controlla sempre `sent_notifications` prima di inviare
- **Fuso orario Europe/Rome** — tutte le logiche temporali devono usare il fuso italiano, non UTC
- **Formato messaggi**: usa emoji + Markdown Telegram (bold con `*testo*`, non `**testo**`)
- **Riusa** il client Supabase e le utility già presenti in `_shared/` se disponibili
- **La Edge Function deve gestire errori gracefully** — se Telegram non risponde o Supabase ha problemi, logga l'errore ma non crasha

---

## Acceptance Criteria

1. ✅ Ogni mattina alle ~08:00 ricevo su Telegram il riepilogo degli eventi di oggi e domani
2. ✅ Se non ho eventi né note, non ricevo nessun messaggio (no spam)
3. ✅ 1 ora prima di un evento con orario ricevo il promemoria
4. ✅ Il promemoria pre-evento arriva una sola volta, mai duplicato
5. ✅ Ogni lunedì mattina ricevo il riepilogo della settimana
6. ✅ I messaggi sono formattati con emoji e Markdown Telegram, leggibili e puliti
7. ✅ Il cron job gira ogni 15 minuti senza errori
8. ✅ Le estensioni `pg_cron` e `pg_net` sono attive su Supabase
