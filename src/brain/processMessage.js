// Orchestratore principale — Fase 1 (sincrona)

import { generateEmbedding } from './embeddings.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { callLLM } from './llm.js';
import { executeActions } from './actions.js';
import { extractAndStoreMemories } from './extraction.js';
import { supabase } from '../services/supabase.js';

export async function processMessage({ text, source, engine = 'gemini' }) {
  // 1. Salva messaggio utente nella chat (se non è __GREETING__)
  let userMsg = null;
  if (text !== '__GREETING__') {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ role: 'user', content: text, source })
      .select()
      .single();
    userMsg = data;
  }
  
  // 2. Costruisci contesto — tutto in parallelo per velocità
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
  
  // 3. Ricerca ibrida memorie rilevanti
  const { data: memories, error: memoriesError } = await supabase.rpc('search_memories', {
    query_embedding: embedding,
    query_text: text,
    match_count: 15,
    min_relevance: 20
  });
  
  if (memoriesError) {
    console.error('Error in search_memories RPC:', memoriesError);
  }
  
  // 4. Costruisci prompt e chiama LLM
  const systemPrompt = buildSystemPrompt({
    profile,
    proceduralRules: profile.procedural_rules || [],
    relevantMemories: memories || [],
    chatHistory: chatHistory.slice(0, text === '__GREETING__' ? chatHistory.length : -1),  // escludi il messaggio appena salvato se non è greeting
    currentDateTime: new Date().toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      dateStyle: 'full',
      timeStyle: 'short'
    })
  });
  
  const llmResponse = await callLLM({ systemPrompt, userMessage: text, engine });
  
  // 5. Esegui azioni esplicite (create_memory da comando diretto)
  const createdMemoryIds = await executeActions(llmResponse.actions, source);
  
  // 6. Recall delle memorie usate
  if (llmResponse.recall_ids?.length > 0) {
    await supabase.rpc('recall_memories', { memory_ids: llmResponse.recall_ids });
  }
  
  // 7. Salva risposta Will nella chat
  const { data: assistantMsg } = await supabase
    .from('chat_messages')
    .insert({
      role: 'assistant',
      content: llmResponse.response,
      message_type: llmResponse.message_type || 'text',
      related_memory_ids: [...createdMemoryIds, ...(llmResponse.recall_ids || [])]
    })
    .select()
    .single();
  
  // 8. FASE 2 ASINCRONA — estrai fatti in background (non blocca la UI)
  // Solo se il messaggio non è un greeting o un errore
  if (text !== '__GREETING__') {
    extractAndStoreMemories({
      userMessage: text,
      assistantResponse: llmResponse.response,
      source: source.replace('app_', 'extraction').replace('telegram_', 'extraction')
    }).catch(err => console.error('Background extraction failed:', err));
  }
  
  // 9. Incrementa contatore per auto-update profilo
  await supabase.rpc('increment_memories_counter').catch(err => console.error('Failed to increment memories counter:', err));
  
  return {
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    createdMemories: createdMemoryIds
  };
}
