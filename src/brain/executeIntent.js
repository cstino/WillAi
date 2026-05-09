import { eventsService, notesService, conversationsService } from '../services/database';

export async function executeIntent(interpreted) {
  const { intent, data, response } = interpreted;

  try {
    switch (intent) {
      case 'add_event':
        await eventsService.create({
          title: data.title || 'Nuovo Evento',
          start_date: data.start_date,
          end_date: data.end_date,
          location: data.location,
          description: data.description,
          source: 'app'
        });
        break;

      case 'add_note':
        await notesService.create({
          title: data.title || 'Nuova Nota',
          content: data.description || data.title,
          source: 'app'
        });
        break;

      case 'query_events': {
        const events = await eventsService.getAll();
        if (events && events.length > 0) {
          const list = events.map(e => {
            const date = new Date(e.start_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
            return `📅 ${e.title} - ${date}`;
          }).join('\n');
          return `Certamente! Ecco i tuoi impegni:\n\n${list}`;
        }
        return "Non ho trovato eventi nel tuo calendario. 📭";
      }

      case 'query_notes': {
        const notes = await notesService.getAll();
        if (notes && notes.length > 0) {
          const list = notes.map(n => `📝 ${n.title}\n${n.content}`).join('\n\n');
          return `Ecco le tue note salvate:\n\n${list}`;
        }
        return "Non ho trovato note salvate. 📭";
      }

      case 'delete_event':
        await eventsService.deleteByTitle(data.title);
        return response; // Usiamo la risposta di conferma di Gemini

      case 'delete_note':
        await notesService.deleteByTitle(data.title);
        return response;

      case 'update_event': {
        const searchTitle = data.old_title || data.title;
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
        return response;
      }

      case 'update_note': {
        const searchTitle = data.old_title || data.title;
        const { error } = await supabase
          .from('notes')
          .update({
            title: data.title,
            content: data.description || data.title
          })
          .ilike('title', `%${searchTitle}%`);
        if (error) throw error;
        return response;
      }

      default:
        // general_answer o altri intent non gestiti
        break;
    }

    // Logghiamo la conversazione
    await conversationsService.log({
      input_text: interpreted.input_text || '', // Dovremo passarlo
      input_source: 'text',
      intent: intent,
      response_text: response
    });

    return response;
  } catch (error) {
    console.error('Errore durante l\'esecuzione dell\'intento:', error);
    return 'Ho avuto un problema nell\'eseguire l\'azione su Supabase.';
  }
}
