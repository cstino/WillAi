import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_EMBEDDING_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(GEMINI_EMBEDDING_URL, {
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

async function callGeminiJSON(prompt: string, userContent: string): Promise<any> {
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${prompt}\n\nINPUT DATA:\n${userContent}` }]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini call failed: ${response.status} - ${text}`);
  }
  const data = await response.json();
  let text = data.candidates[0].content.parts[0].text.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  }
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // 1. Decay del relevance_score (Chiama la funzione SQL)
    console.log('Starting decay relevance scores...');
    const { error: decayError } = await supabase.rpc('decay_relevance_scores');
    if (decayError) console.error('Decay error:', decayError);

    // 2. Estrazione fatti dalle conversazioni del giorno
    console.log('Extracting facts from today\'s chats...');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentChat, error: chatError } = await supabase
      .from('chat_messages')
      .select('*')
      .gte('created_at', yesterday)
      .order('created_at', { ascending: true });

    if (chatError) console.error('Chat fetch error:', chatError);

    if (recentChat && recentChat.length > 0) {
      const chatFormatted = recentChat
        .map((m: any) => `${m.role === 'user' ? 'Cristiano' : 'Will'}: ${m.content}`)
        .join('\n');

      const extractionPrompt = `
        Analizza le conversazioni di oggi di Cristiano con il suo assistente Will. Estrai:
        1. Nuovi fatti stabili su di lui (non già noti nel profilo attuale)
        2. Nuove preferenze emerse
        3. Pattern comportamentali (es: 'tende a pianificare la settimana il lunedì mattina')
        4. Nuove regole procedurali (es: 'preferisce che non gli chieda conferma su X')

        Ritorna JSON con questo formato esatto:
        {
          "facts": [
            { "content": "fatto o preferenza atomica", "type": "fact|preference", "tags": ["tag1", "tag2"], "importance": 3 }
          ],
          "procedural_rules": [
            { "rule": "regola procedurale comportamentale", "confidence": 0.85 }
          ]
        }
      `;

      try {
        const extracted = await callGeminiJSON(extractionPrompt, chatFormatted);
        console.log('Extracted daily data:', extracted);

        // Save extracted facts
        if (extracted.facts && extracted.facts.length > 0) {
          for (const fact of extracted.facts) {
            try {
              const embedding = await generateEmbedding(fact.content);
              await supabase.from('memories').insert({
                content: fact.content,
                embedding,
                memory_type: fact.type,
                tags: fact.tags || [],
                importance: fact.importance || 2,
                source: 'heartbeat'
              });
            } catch (e) {
              console.error('Failed to save extracted heartbeat fact:', e);
            }
          }
        }

        // Merge procedural rules into user profile
        if (extracted.procedural_rules && extracted.procedural_rules.length > 0) {
          const { data: profileData } = await supabase
            .from('user_profile')
            .select('procedural_rules')
            .limit(1)
            .single();

          let currentRules = profileData?.procedural_rules || [];
          // Simple duplicate check and push
          for (const newRule of extracted.procedural_rules) {
            if (!currentRules.some((r: any) => r.rule.toLowerCase() === newRule.rule.toLowerCase())) {
              currentRules.push(newRule);
            }
          }

          await supabase
            .from('user_profile')
            .update({ procedural_rules: currentRules })
            .eq('id', '00000000-0000-0000-0000-000000000000');
        }
      } catch (err) {
        console.error('Failed daily extraction from chat:', err);
      }
    }

    // 3. Aggiornamento profilo (se memories_since_last_profile_update >= 10 o forzato manualmente)
    const { data: profile } = await supabase
      .from('user_profile')
      .select('*')
      .limit(1)
      .single();

    const shouldUpdateProfile = 
      (profile?.memories_since_last_profile_update || 0) >= 10 || 
      req.headers.get('x-force-profile-update') === 'true';

    if (shouldUpdateProfile) {
      console.log('Updating user profile summary...');
      // Prendi tutte le memorie 'fact' e 'preference' con relevance_score > 40
      const { data: stableMemories } = await supabase
        .from('memories')
        .select('*')
        .in('memory_type', ['fact', 'preference'])
        .gt('relevance_score', 40);

      if (stableMemories && stableMemories.length > 0) {
        const memoriesText = stableMemories
          .map((m: any) => `[${m.memory_type}] ${m.content}`)
          .join('\n');

        const profilePrompt = `
          Sei un sintetizzatore di profili personali. Riceverai un elenco di fatti e preferenze di Cristiano.
          Scrivi un riassunto coerente, breve ed empatico in terza persona di chi è Cristiano (es. lavoro, interessi, passioni).
          Consolida anche i singoli fatti e preferenze più importanti in due array puliti.

          Ritorna JSON con questo formato esatto:
          {
            "summary": "riassunto testuale di chi è Cristiano",
            "facts": [
              { "fact": "fatto riassunto", "confidence": 0.95 }
            ],
            "preferences": [
              { "preference": "preferenza riassunta", "confidence": 0.95 }
            ]
          }
        `;

        try {
          const synthesized = await callGeminiJSON(profilePrompt, memoriesText);
          console.log('Synthesized profile:', synthesized);

          await supabase
            .from('user_profile')
            .update({
              summary: synthesized.summary,
              facts: synthesized.facts,
              preferences: synthesized.preferences,
              memories_since_last_profile_update: 0,
              last_heartbeat_at: new Date().toISOString()
            })
            .eq('id', '00000000-0000-0000-0000-000000000000');
        } catch (err) {
          console.error('Failed to synthesize profile:', err);
        }
      }
    }

    // 4. Deduplicazione soft (consolidazione)
    console.log('Soft deduplicating memories...');
    const { data: allMemories } = await supabase
      .from('memories')
      .select('id, content, memory_type, embedding, relevance_score')
      .gt('relevance_score', 20);

    if (allMemories && allMemories.length > 0) {
      // Find matches with similarity > 0.95 and same type, decay the older one
      // Since ivfflat lists is small or we want precision, we do a pairwise check for simplicity
      const parseVector = (v: any) => {
        if (typeof v === 'string') {
          return JSON.parse(v);
        }
        return v;
      };

      const dotProduct = (a: number[], b: number[]) => a.reduce((sum, val, i) => sum + val * b[i], 0);
      const magnitude = (a: number[]) => Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
      const cosineSimilarity = (a: number[], b: number[]) => {
        const magA = magnitude(a);
        const magB = magnitude(b);
        if (magA === 0 || magB === 0) return 0;
        return dotProduct(a, b) / (magA * magB);
      };

      for (let i = 0; i < allMemories.length; i++) {
        const memA = allMemories[i];
        if (!memA.embedding) continue;
        const vecA = parseVector(memA.embedding);

        for (let j = i + 1; j < allMemories.length; j++) {
          const memB = allMemories[j];
          if (!memB.embedding || memA.memory_type !== memB.memory_type) continue;
          const vecB = parseVector(memB.embedding);

          const sim = cosineSimilarity(vecA, vecB);
          if (sim > 0.95) {
            // Decay the older one (which we assume has lower ID or created_at, but we can just decay one of them)
            // Let's decay memA by 30 points of relevance_score
            console.log(`Found near duplicate memories: "${memA.content}" vs "${memB.content}" (similarity: ${sim.toFixed(4)})`);
            await supabase
              .from('memories')
              .update({ relevance_score: Math.max(0, memA.relevance_score - 30) })
              .eq('id', memA.id);
            break; // Move to next memory since memA is decayed
          }
        }
      }
    }

    return new Response(JSON.stringify({ status: 'heartbeat_completed' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Heartbeat error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
