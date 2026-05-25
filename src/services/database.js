import { supabase } from './supabase';

function formatMemoryAsEvent(m) {
  return {
    id: m.id,
    title: m.content,
    start_date: m.trigger_at,
    end_date: m.trigger_end,
    location: '', // Location is merged in content for memory schema
    created_at: m.created_at
  };
}

function formatMemoryAsNote(m) {
  const lines = m.content.split('\n');
  const title = lines[0] || 'Nota';
  const content = lines.slice(1).join('\n') || m.content;
  return {
    id: m.id,
    title: title,
    content: content,
    memory_type: m.memory_type,
    created_at: m.created_at,
    source: m.source
  };
}

/**
 * Gestione Eventi Calendario (Proiezioni di memories)
 */
export const eventsService = {
  async getAll() {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .in('memory_type', ['event', 'reminder'])
      .not('trigger_at', 'is', null)
      .gt('relevance_score', 0)
      .order('trigger_at', { ascending: true });
      
    if (error) throw error;
    return (data || []).map(formatMemoryAsEvent);
  },

  async delete(id) {
    const { error } = await supabase
      .from('memories')
      .delete()
      .match({ id });
    if (error) throw error;
  },

  async deleteByTitle(title) {
    const { data, error } = await supabase
      .from('memories')
      .delete()
      .in('memory_type', ['event', 'reminder'])
      .ilike('content', `%${title}%`);
    if (error) throw error;
    return data;
  },

  async getByDateRange(start, end) {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .in('memory_type', ['event', 'reminder'])
      .not('trigger_at', 'is', null)
      .gt('relevance_score', 0)
      .gte('trigger_at', start.toISOString())
      .lte('trigger_at', end.toISOString())
      .order('trigger_at', { ascending: true });
      
    if (error) throw error;
    return (data || []).map(formatMemoryAsEvent);
  },

  async count() {
    const { count, error } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
      .in('memory_type', ['event', 'reminder'])
      .gt('relevance_score', 0);
    if (error) throw error;
    return count;
  }
};

/**
 * Gestione Note (Proiezioni di memories)
 */
export const notesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .in('memory_type', ['knowledge', 'idea', 'fact', 'preference'])
      .gt('relevance_score', 0)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return (data || []).map(formatMemoryAsNote);
  },

  async getRecent(limit = 10) {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .in('memory_type', ['knowledge', 'idea', 'fact', 'preference'])
      .gt('relevance_score', 0)
      .order('created_at', { ascending: false })
      .limit(limit);
      
    if (error) throw error;
    return (data || []).map(formatMemoryAsNote);
  },

  async delete(id) {
    const { error } = await supabase
      .from('memories')
      .delete()
      .match({ id });
    if (error) throw error;
  },

  async deleteByTitle(title) {
    const { data, error } = await supabase
      .from('memories')
      .delete()
      .in('memory_type', ['knowledge', 'idea', 'fact', 'preference'])
      .ilike('content', `%${title}%`);
    if (error) throw error;
    return data;
  },

  async count() {
    const { count, error } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
      .in('memory_type', ['knowledge', 'idea', 'fact', 'preference'])
      .gt('relevance_score', 0);
    if (error) throw error;
    return count;
  }
};

/**
 * Gestione Conversazioni (Log) - Compatibilità o non utilizzato
 */
export const conversationsService = {
  async log(entry) {
    // Non più utilizzato direttamente ma mantenuto per evitare errori di importazione
    return entry;
  },

  async getRecent(limit = 10) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }
};
