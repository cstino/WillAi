import { supabase } from '../services/supabase.js';
import { generateEmbedding } from './embeddings.js';
import { searchMemories } from './searchMemories.js';

export async function buildContextForMessage(text) {
  // Fetch profile, recent chat messages and generate embedding in parallel
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

  // Search memories with the generated embedding
  let memories = [];
  try {
    memories = await searchMemories({
      embedding,
      text,
      matchCount: 15,
      minRelevance: 20
    });
  } catch (error) {
    console.error('Failed to search memories, fallback to empty list:', error);
  }

  return {
    embedding,
    profile,
    chatHistory,
    memories
  };
}
