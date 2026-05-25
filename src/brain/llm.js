const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

const GEMINI_MODEL = 'gemini-1.5-flash';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function callLLM({ systemPrompt, userMessage, engine = 'gemini' }) {
  let responseText = '';
  
  if (engine === 'gemini') {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `SYSTEM_PROMPT: ${systemPrompt}\n\nUSER_MESSAGE: ${userMessage}` }]
          }
        ],
        generationConfig: { 
          responseMimeType: 'application/json',
          temperature: 0.2
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini LLM call failed: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    if (!result.candidates || result.candidates.length === 0) {
      throw new Error(`Gemini returned no candidates: ${JSON.stringify(result)}`);
    }
    responseText = result.candidates[0].content.parts[0].text;
  } else {
    // Groq engine
    if (!GROQ_API_KEY) {
      throw new Error('VITE_GROQ_API_KEY is not defined in env');
    }

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
          { role: 'user', content: userMessage }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq LLM call failed: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    if (!result.choices || result.choices.length === 0) {
      throw new Error(`Groq returned no choices: ${JSON.stringify(result)}`);
    }
    responseText = result.choices[0].message.content;
  }

  // Clean JSON response if it has backticks
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('Error parsing LLM response as JSON. Raw text was:', responseText);
    throw new Error(`LLM did not return valid JSON: ${err.message}`);
  }
}
