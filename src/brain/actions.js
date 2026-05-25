import { generateEmbedding } from './embeddings.js';
import { supabase } from '../services/supabase.js';

export async function executeActions(actions = [], source = 'app_text') {
  const createdIds = [];
  
  for (const action of actions) {
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
      // Cancellazione solo su richiesta esplicita dell'utente
      await supabase.from('memories').delete().eq('id', action.id);
    }
  }
  
  return createdIds;
}
