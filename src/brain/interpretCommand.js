import { buildContext } from './buildContext';
import { buildSystemPrompt } from './systemPrompt';
import { addToHistory, getHistory } from './conversationHistory';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

const GEMINI_MODEL = 'gemini-2.5-flash';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function interpretCommand(text, engine = 'gemini') {
  try {
    // 1. Costruisci il contesto fresco dal database
    const context = await buildContext();
    
    // 2. Costruisci il system prompt con il contesto
    const systemPrompt = buildSystemPrompt(context);
    
    // 3. Recupera la storia della conversazione
    const history = getHistory();
    
    // Preparazione messaggi per Groq (OpenAI format)
    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: text }
    ];

    // Preparazione messaggi per Gemini
    const geminiMessages = [
      {
        role: 'user',
        parts: [{ text: `SYSTEM_PROMPT: ${systemPrompt}\n\nCONVERSATION_HISTORY: ${JSON.stringify(history)}\n\nUSER_MESSAGE: ${text}` }]
      }
    ];

    let responseText = '';

    if (engine === 'gemini') {
      const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: { 
            responseMimeType: 'application/json',
            temperature: 0.2
          },
        }),
      });
      const result = await response.json();
      if (!result.candidates) throw new Error(JSON.stringify(result));
      responseText = result.candidates[0].content.parts[0].text;
    } else {
      // Engine GROQ
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: groqMessages,
          response_format: { type: 'json_object' },
          temperature: 0.2
        }),
      });
      const result = await response.json();
      responseText = result.choices[0].message.content;
    }

    const parsed = JSON.parse(responseText);
    
    // Salva nella storia
    addToHistory('user', text);
    addToHistory('assistant', parsed.response);
    
    return parsed;
  } catch (error) {
    console.error(`Errore durante l'interpretazione con ${engine}:`, error);
    return {
      type: 'conversation',
      intent: 'error',
      response: `Scusa, ho avuto un problema tecnico. Mi sono perso un attimo.`,
    };
  }
}

