import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function interpretCommand(text: string, engine = 'gemini', currentDate = new Date().toISOString()) {
  const systemPrompt = `
  Sei l'assistente personale "Will". Il tuo compito è interpretare i comandi dell'utente in italiano e restituire SEMPRE un JSON strutturato.
  
  Data odierna: ${currentDate}
  
  Regole:
  1. Capisci l'intento tra: add_event, add_note, query_events, query_notes, delete_event, delete_note, update_event, update_note, general_answer.
  2. Fuso Orario: Usa SEMPRE 'Europe/Rome'. Se l'utente dice "alle 9:00", scrivi "T09:00:00". Non aggiungere o togliere ore.
  3. Range di date: Se l'utente dice "dal 30 maggio al 2 giugno", la start_date è il 30 e la end_date è il 2 (NON il 3). "Fino al" è sempre INCLUSIVO.
  4. Per eventi multi-giorno con orario (es. vacanza con partenza/ritorno), metti l'orario di partenza in start_date e quello di ritorno in end_date. all_day deve essere FALSE.
  5. Rispondi in modo naturale e umano nel campo "response".
  
  Schema JSON atteso:
  {
    "intent": "string",
    "data": {
      "title": "string",
      "old_title": "string",
      "start_date": "ISO 8601 string",
      "end_date": "ISO 8601 string",
      "all_day": boolean, // true se è un evento generico senza ora, false se ha un orario specifico
      "location": "string",
      "description": "string"
    },
    "response": "string"
  }
  `;

  if (engine === 'gemini') {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nComando utente: "${text}"` }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    const result = await response.json();
    return JSON.parse(result.candidates[0].content.parts[0].text);
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
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const result = await response.json();
    return JSON.parse(result.choices[0].message.content);
  }
}

export async function executeIntent(supabase: any, interpreted: any, source: string) {
  const { intent, data, response } = interpreted;

  try {
    if (intent === 'add_event') {
      await supabase.from('events').insert([{
        title: data.title || 'Nuovo Evento',
        start_date: data.start_date,
        end_date: data.end_date,
        location: data.location,
        description: data.description,
        source: source
      }]);
    } else if (intent === 'delete_event') {
      await supabase.from('events').delete().ilike('title', `%${data.title}%`);
    } else if (intent === 'add_note') {
      await supabase.from('notes').insert([{
        title: data.title || 'Nuova Nota',
        content: data.description || data.title,
        source: source
      }]);
    } else if (intent === 'delete_note') {
      await supabase.from('notes').delete().ilike('title', `%${data.title}%`);
    } else if (intent === 'update_event') {
      const searchTitle = data.old_title || data.title;
      await supabase.from('events').update({
        title: data.title,
        start_date: data.start_date,
        end_date: data.end_date,
        all_day: data.all_day ?? false,
        location: data.location,
        description: data.description
      }).ilike('title', `%${searchTitle}%`);
    } else if (intent === 'update_note') {
      const searchTitle = data.old_title || data.title;
      await supabase.from('notes').update({
        title: data.title,
        content: data.description || data.title
      }).ilike('title', `%${searchTitle}%`);
    } else if (intent === 'query_events') {
      const { data: events } = await supabase.from('events').select('*').order('start_date', { ascending: true });
      if (events && events.length > 0) {
        const eventsList = events.map((e: any) => {
          const start = new Date(e.start_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
          const end = e.end_date ? new Date(e.end_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : null;
          
          if (end && end !== start) {
            return `📅 *${e.title}* - dal ${start} al ${end}`;
          }
          return `📅 *${e.title}* - il ${start}`;
        }).join('\n');
        return `Certamente! Ecco i tuoi prossimi impegni:\n\n${eventsList}`;
      } else {
        return "Non ho trovato eventi nel tuo calendario. 📭";
      }
    } else if (intent === 'query_notes') {
      const { data: notes } = await supabase.from('notes').select('*').order('created_at', { ascending: false });
      if (notes && notes.length > 0) {
        const notesList = notes.map((n: any) => `📝 *${n.title}*\n_${n.content}_`).join('\n\n');
        return `Ecco le tue note salvate:\n\n${notesList}`;
      } else {
        return "Non ho trovato note. 📭";
      }
    }

    await supabase.from('conversations').insert([{
      input_text: interpreted.input_text || '',
      input_source: source,
      intent: intent,
      response_text: response
    }]);

    return response;
  } catch (err) {
    console.error('Error executing intent:', err);
    return 'Problema con il database.';
  }
}
