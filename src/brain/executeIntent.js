import { eventsService, notesService, conversationsService } from '../services/database';

export async function executeIntent(interpreted) {
  const { type, intent, data, response } = interpreted;

  // Se è una semplice conversazione, non facciamo nulla sul DB e ritorniamo la risposta
  if (type === 'conversation') {
    return response;
  }

  try {
    switch (intent) {
      case 'add_event':
        await eventsService.create({
          title: data.title || 'Nuovo Evento',
          start_date: data.start_date,
          end_date: data.end_date,
          all_day: data.all_day ?? false,
          location: data.location,
          description: data.description,
          source: 'app'
        });
        break;

      case 'add_note':
        await notesService.create({
          title: data.title || 'Nuova Nota',
          content: data.content || data.description || data.title,
          source: 'app'
        });
        break;

      case 'delete_event':
        await eventsService.deleteByTitle(data.search_query || data.title);
        break;

      case 'delete_note':
        await notesService.deleteByTitle(data.search_query || data.title);
        break;

      case 'update_event': {
        const searchTitle = data.search_query || data.old_title || data.title;
        // Importante: qui usiamo direttamente Supabase per la flessibilità della query ilike
        const { error } = await supabase
          .from('events')
          .update({
            title: data.title,
            start_date: data.start_date,
            end_date: data.end_date,
            all_day: data.all_day ?? false,
            location: data.location,
            description: data.description
          })
          .ilike('title', `%${searchTitle}%`);
        if (error) throw error;
        break;
      }

      case 'update_note': {
        const searchTitle = data.search_query || data.old_title || data.title;
        const { error } = await supabase
          .from('notes')
          .update({
            title: data.title,
            content: data.content || data.description || data.title
          })
          .ilike('title', `%${searchTitle}%`);
        if (error) throw error;
        break;
      }

      default:
        // Intent non mappati o query (gestite dalla conversazione)
        break;
    }

    // Logghiamo la conversazione nel DB per storico futuro (opzionale)
    try {
      await conversationsService.log({
        input_text: interpreted.input_text || '',
        input_source: 'app',
        intent: intent || 'conversation',
        response_text: response
      });
    } catch (e) {
      console.warn('Errore logging conversazione:', e);
    }

    return response;
  } catch (error) {
    console.error('Errore durante l\'esecuzione dell\'intento:', error);
    return 'Ho avuto un problema tecnico nel salvare i dati. Ma la tua richiesta era chiara!';
  }
}
