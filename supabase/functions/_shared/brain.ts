import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

const GEMINI_MODEL = 'gemini-1.5-flash';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function buildContext(supabase: any) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [todayEvents, upcomingEvents, recentNotes] = await Promise.all([
    supabase.from('events').select('*').gte('start_date', startOfToday.toISOString()).lte('start_date', endOfToday.toISOString()),
    supabase.from('events').select('*').gte('start_date', now.toISOString()).lte('start_date', next7Days.toISOString()).limit(10),
    supabase.from('notes').select('*').order('created_at', { ascending: false }).limit(5)
  ]);

  const formatEvents = (evts: any[]) => evts.map(e => `- ${e.title} (${new Date(e.start_date).toLocaleString('it-IT')})`).join('\n');
  const formatNotes = (nts: any[]) => nts.map(n => `- ${n.content}`).join('\n');

  return `
## STATO ATTUALE
Data/Ora: ${now.toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
Giorno: ${now.toLocaleDateString('it-IT', { weekday: 'long' })}

## IMPEGNI OGGI
${formatEvents(todayEvents.data || []) || 'Nessuno.'}

## PROSSIMI 7 GIORNI
${formatEvents(upcomingEvents.data || []) || 'Nessuno.'}

## NOTE RECENTI
${formatNotes(recentNotes.data || []) || 'Nessuna.'}
  `.trim();
}

function buildSystemPrompt(context: string) {
  return `
Sei Will, l'assistente di Cristiano. Sei amichevole, conciso e intelligente.
Usa il CONTESTO fornito per rispondere in modo proattivo.

## REGOLE
1. Se chiede di fare qualcosa (aggiungere/modificare), rispondi con JSON { "type": "action", "intent": "...", "data": {...}, "response": "..." }.
2. Se chiede info o chiacchiera, rispondi con JSON { "type": "conversation", "response": "..." }.
3. Fuso orario: Europe/Rome.

## CONTESTO
${context}
  `.trim();
}

export async function interpretCommand(supabase: any, text: string, engine = 'gemini') {
  const context = await buildContext(supabase);
  const systemPrompt = buildSystemPrompt(context);

  let responseText = '';

  if (engine === 'gemini') {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `SYSTEM: ${systemPrompt}\n\nUSER: ${text}` }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    });
    const result = await response.json();
    responseText = result.candidates[0].content.parts[0].text;
  } else {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      }),
    });
    const result = await response.json();
    responseText = result.choices[0].message.content;
  }

  return JSON.parse(responseText);
}

export async function executeIntent(supabase: any, interpreted: any, source: string) {
  const { type, intent, data, response } = interpreted;

  if (type === 'conversation') return response;

  try {
    if (intent === 'add_event') {
      await supabase.from('events').insert([{ ...data, source }]);
    } else if (intent === 'add_note') {
      await supabase.from('notes').insert([{ title: data.title, content: data.content || data.description || data.title, source }]);
    } else if (intent === 'update_event') {
      const search = data.search_query || data.old_title || data.title;
      await supabase.from('events').update(data).ilike('title', `%${search}%`);
    } else if (intent === 'delete_event') {
      await supabase.from('events').delete().ilike('title', `%${data.title}%`);
    }
    
    // Log
    await supabase.from('conversations').insert([{
      input_text: interpreted.input_text || '',
      input_source: source,
      intent: intent || 'conversation',
      response_text: response
    }]);

    return response;
  } catch (err) {
    console.error(err);
    return 'Errore database.';
  }
}
