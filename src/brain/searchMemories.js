import { supabase } from '../services/supabase.js';

export async function searchMemories({ embedding, text, matchCount = 15, minRelevance = 20, filterType = null }) {
  const { data, error } = await supabase.rpc('search_memories', {
    query_embedding: embedding,
    query_text: text,
    match_count: matchCount,
    min_relevance: minRelevance,
    filter_type: filterType
  });

  if (error) {
    console.error('Error in searchMemories:', error);
    throw error;
  }
  return data || [];
}
