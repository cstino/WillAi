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
`.trim();

export async function extractAndStoreMemories({ userMessage, assistantResponse, source }) {
  const llmResponse = await callLLM({
    systemPrompt: EXTRACTION_PROMPT,
    userMessage: `CRISTIANO: ${userMessage}\nWILL: ${assistantResponse}`,
    engine: 'gemini' // default to gemini for background extraction
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
