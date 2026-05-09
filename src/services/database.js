import { supabase } from './supabase'

/**
 * Gestione Eventi Calendario
 */
export const eventsService = {
  async getAll() {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('start_date', { ascending: true })
    if (error) throw error
    return data
  },

  async create(event) {
    const { data, error } = await supabase
      .from('events')
      .insert([event])
      .select()
    if (error) throw error
    return data[0]
  },

  async delete(id) {
    const { error } = await supabase
      .from('events')
      .delete()
      .match({ id })
    if (error) throw error
  }
}

/**
 * Gestione Note
 */
export const notesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async create(note) {
    const { data, error } = await supabase
      .from('notes')
      .insert([note])
      .select()
    if (error) throw error
    return data[0]
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('notes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .match({ id })
      .select()
    if (error) throw error
    return data[0]
  },

  async delete(id) {
    const { error } = await supabase
      .from('notes')
      .delete()
      .match({ id })
    if (error) throw error
  }
}

/**
 * Gestione Conversazioni (Log)
 */
export const conversationsService = {
  async log(entry) {
    const { data, error } = await supabase
      .from('conversations')
      .insert([entry])
      .select()
    if (error) throw error
    return data[0]
  },

  async getRecent(limit = 10) {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data
  }
}
