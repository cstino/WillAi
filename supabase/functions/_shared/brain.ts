const GEMINI_MODEL = 'gemini-2.5-flash';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('GEMINI_API_KEY') || '';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: 'SEMANTIC_SIMILARITY',
      outputDimensionality: 768
    })
  });
  if (!response.ok) throw new Error(`Embedding failed: ${response.status}`);
  const data = await response.json();
  return data.embedding.values;
}

export async function callLLM({ systemPrompt, userMessage, engine = 'gemini' }: { systemPrompt: string; userMessage: string; engine?: string }) {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';
  const groqApiKey = Deno.env.get('GROQ_API_KEY') || '';
  
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;
  const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';

  let responseText = '';
  
  if (engine === 'gemini') {
    const response = await fetch(geminiUrl, {
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
    responseText = result.candidates[0].content.parts[0].text;
  } else {
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY is not defined in env');
    }

    const response = await fetch(groqUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`,
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
    responseText = result.choices[0].message.content;
  }

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

export function buildSystemPrompt({ profile, proceduralRules, relevantMemories, chatHistory, currentDateTime }: any) {
  return `
Sei Will, l'assistente personale di Cristiano. Non sei un bot che esegue comandi — sei un compagno digitale che lo conosce e impara nel tempo.

# LA TUA PERSONALITÀ
- Parli italiano naturale, mai robotico o formale
- Sei conciso: 1-3 frasi per risposte semplici
- Sei proattivo: noti pattern, segnali conflitti, suggerisci
- Hai personalità: caloroso ma non servile, puoi fare battute leggere
- NON dire mai "Come posso aiutarti?" o "Sono qui per te"

# REGOLE COMPORTAMENTALI (imparate nel tempo)
${proceduralRules && proceduralRules.length > 0 
  ? proceduralRules.map((r: any) => `- ${r.rule || r}`).join('\n')
  : '(nessuna regola ancora — le imparerai con le conversazioni)'}

# CHI È CRISTIANO
${profile.summary || '(profilo ancora vuoto — lo costruirai conversazione dopo conversazione)'}

${profile.facts && profile.facts.length > 0 ? `Fatti:\n${profile.facts.map((f: any) => `- ${f.fact || f}`).join('\n')}` : ''}
${profile.preferences && profile.preferences.length > 0 ? `Preferenze:\n${profile.preferences.map((p: any) => `- ${p.preference || p}`).join('\n')}` : ''}

# ORA E DATA
${currentDateTime}

# MEMORIE RILEVANTI PER QUESTO MESSAGGIO
Queste memorie sono state recuperate dalla tua memoria a lungo termine perché semanticamente rilevanti a ciò che Cristiano sta dicendo. Usale per rispondere con cognizione di causa. Se ci sono memorie contrastanti sullo stesso argomento, considera la più recente come canonica.

${relevantMemories.length === 0 
  ? '(nessuna memoria rilevante)' 
  : relevantMemories.map((m: any) => 
    `[${m.id}] (${m.memory_type}, ${new Date(m.created_at).toLocaleDateString('it-IT')}) ${m.content}${m.trigger_at ? ' — data: ' + new Date(m.trigger_at).toLocaleString('it-IT') : ''}`
  ).join('\n')}

# CONVERSAZIONE RECENTE
${chatHistory.length === 0 
  ? '(prima conversazione)' 
  : chatHistory.map((m: any) => `${m.role === 'user' ? 'Cristiano' : 'Will'}: ${m.content}`).join('\n')}

# COSA FARE

## RISPONDERE (sempre)
Genera una risposta naturale e contestualizzata. Usa le memorie per essere preciso. Se ci sono contraddizioni tra memorie, usa la più recente.

## AGIRE (quando l'utente chiede esplicitamente)
Se Cristiano chiede di salvare/segnare/ricordare/cancellare qualcosa, genera un'azione nel campo "actions".

Azioni disponibili:
- **create_memory**: crea una nuova memoria. Decidi il tipo:
  - \`event\` → data fissa nel calendario
  - \`reminder\` → notifica a un orario
  - \`fact\` → fatto su Cristiano
  - \`preference\` → preferenza
  - \`idea\` → idea/da-fare vago
  - \`knowledge\` → conoscenza atemporale (ricetta, link, info)
- **delete_memory**: cancella una memoria (solo su richiesta esplicita, serve l'id dalla lista memorie rilevanti)

NON fare mai UPDATE — le memorie sono ADD-only. Se un'informazione cambia, crea una nuova memoria e lascia la vecchia. Il sistema ordina per recency.

## CHIEDERE CONFERMA (su ambiguità)
Se l'utente è vago su un dettaglio che cambia il tipo o il timing della memoria, chiedi. Esempi:
- "Salva la ricetta della pasta alla norma" → "La salvo come ricetta da consultare, o vuoi che ti ricordi di farla in un momento specifico?"
- "Segna riunione mercoledì alle 15" ma mercoledì alle 15 c'è già qualcosa → "Mercoledì alle 15 hai già [X]. Segno lo stesso?"
- "Cancella la riunione" ma ce ne sono 3 → "Ho trovato 3 riunioni: [elenco]. Quale?"
In questi casi, NON eseguire azioni. Rispondi e aspetta.

# FORMATO OUTPUT

JSON valido. Niente altro prima o dopo.

\`\`\`json
{
  "response": "La tua risposta in italiano",
  "actions": [
    {
      "type": "create_memory",
      "content": "Testo della memoria",
      "memory_type": "event|reminder|fact|preference|idea|knowledge",
      "trigger_at": "ISO 8601 o null",
      "trigger_end": "ISO 8601 o null",
      "tags": ["tag1", "tag2"],
      "importance": 3
    }
  ],
  "recall_ids": ["uuid-1", "uuid-2"],
  "message_type": "text|action_confirm|memory_card|memory_list|greeting"
}
\`\`\`

- \`actions\`: array vuoto se non serve agire
- \`recall_ids\`: ID delle memorie dalla lista "MEMORIE RILEVANTI" che hai effettivamente usato per rispondere
- \`message_type\`: "action_confirm" per conferme brevi, "memory_list" per elenchi di memorie, "memory_card" per singola creazione notevole, "greeting" per il saluto iniziale, "text" altrimenti

# CASO SPECIALE: __GREETING__
Se il messaggio è "__GREETING__", genera un saluto personalizzato:
- Saluta per nome
- Cita 1-2 cose rilevanti dal contesto (eventi di oggi, note recenti)
- Termina con una frase aperta ("Cosa facciamo?" / "Di cosa parliamo?")
- Max 3 frasi, tono caloroso ma non zuccheroso
- actions deve essere un array vuoto
- message_type deve essere "greeting"
  `.trim();
}

export async function executeActions(supabase: any, actions = [], source = 'telegram_text') {
  const createdIds = [];
  
  for (const action of actions as any[]) {
    if (action.type === 'create_memory') {
      const embedding = await generateEmbedding(action.content);
      
      const { data } = await supabase
        .from('memories')
        .insert({
          content: action.content,
          embedding,
          memory_type: action.memory_type,
          trigger_at: action.trigger_at || null,
          trigger_end: action.trigger_end || null,
          tags: action.tags || [],
          importance: action.importance || 3,
          source
        })
        .select()
        .single();
      
      if (data) createdIds.push(data.id);
    }
    
    else if (action.type === 'delete_memory') {
      await supabase.from('memories').delete().eq('id', action.id);
    }
  }
  
  return createdIds;
}

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

export async function extractAndStoreMemories(supabase: any, { userMessage, assistantResponse, source }: any) {
  try {
    const llmResponse = await callLLM({
      systemPrompt: EXTRACTION_PROMPT,
      userMessage: `CRISTIANO: ${userMessage}\nWILL: ${assistantResponse}`,
      engine: 'gemini'
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
          source
        });
      } catch (err) {
        console.error('Failed to store extracted fact:', err);
      }
    }
  } catch (err) {
    console.error('Background extraction error:', err);
  }
}

export async function processMessage(supabase: any, { text, source, engine = 'gemini' }: any) {
  let userMsg = null;
  if (text !== '__GREETING__') {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ role: 'user', content: text, source })
      .select()
      .single();
    if (error) console.error('Error saving user chat message:', error);
    userMsg = data;
  }
  
  const [embedding, profileResult, chatResult] = await Promise.all([
    generateEmbedding(text),
    supabase.from('user_profile').select('*').limit(1).single(),
    supabase.from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
  ]);
  
  const profile = profileResult.data || { summary: '', facts: [], preferences: [], procedural_rules: [] };
  const chatHistory = (chatResult.data || []).reverse();
  
  const { data: memories, error: memoriesError } = await supabase.rpc('search_memories', {
    query_embedding: embedding,
    query_text: text,
    match_count: 15,
    min_relevance: 20
  });
  
  if (memoriesError) {
    console.error('Error in search_memories RPC:', memoriesError);
  }
  
  const systemPrompt = buildSystemPrompt({
    profile,
    proceduralRules: profile.procedural_rules || [],
    relevantMemories: memories || [],
    chatHistory: chatHistory.slice(0, text === '__GREETING__' ? chatHistory.length : -1),
    currentDateTime: new Date().toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      dateStyle: 'full',
      timeStyle: 'short'
    })
  });
  
  const llmResponse = await callLLM({ systemPrompt, userMessage: text, engine });
  
  const createdMemoryIds = await executeActions(supabase, llmResponse.actions, source);
  
  if (llmResponse.recall_ids?.length > 0) {
    await supabase.rpc('recall_memories', { memory_ids: llmResponse.recall_ids });
  }
  
  const { data: assistantMsg, error: assistantError } = await supabase
    .from('chat_messages')
    .insert({
      role: 'assistant',
      content: llmResponse.response,
      message_type: llmResponse.message_type || 'text',
      related_memory_ids: [...createdMemoryIds, ...(llmResponse.recall_ids || [])]
    })
    .select()
    .single();
    
  if (assistantError) console.error('Error saving assistant chat message:', assistantError);
  
  if (text !== '__GREETING__') {
    const extSource = source.replace('app_', 'extraction').replace('telegram_', 'extraction');
    extractAndStoreMemories(supabase, {
      userMessage: text,
      assistantResponse: llmResponse.response,
      source: extSource
    }).catch(err => console.error('Background extraction failed:', err));
  }
  
  await supabase.rpc('increment_memories_counter').catch(err => console.error('Failed to increment memories counter:', err));
  
  return {
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    createdMemories: createdMemoryIds
  };
}
