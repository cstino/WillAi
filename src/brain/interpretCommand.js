const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function interpretCommand(text, engine = 'gemini', currentDate = new Date().toISOString()) {
  const systemPrompt = `
 Sei l'assistente personale "Will". Il tuo compito è interpretare i comandi dell'utente in italiano e restituire SEMPRE un JSON strutturato.
 
 Data odierna: ${currentDate}
 
 Regole:
 1. Capisci l'intento tra: add_event, add_note, query_events, query_notes, delete_event, delete_note, general_answer.
 2. Estrai date e orari in formato ISO 8601. Risolvi riferimenti relativi come "domani", "lunedì prossimo", ecc.
 3. Se l'utente vuole aggiungere un evento, usa "add_event".
 4. Se l'utente vuole aggiungere una nota, usa "add_note".
 5. Rispondi in modo naturale e umano nel campo "response".
 
 Schema JSON atteso:
 {
   "intent": "string",
   "data": {
     "title": "string",
     "start_date": "ISO 8601 string",
     "end_date": "ISO 8601 string",
     "location": "string",
     "description": "string",
     "query_text": "string"
   },
   "response": "string"
 }
 `;

  try {
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
      // Engine GROQ (Llama)
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
  } catch (error) {
    console.error(`Errore durante l'interpretazione con ${engine}:`, error);
    return {
      intent: 'error',
      response: `Scusa, ho avuto un problema con ${engine}. Riprova più tardi.`,
    };
  }
}
