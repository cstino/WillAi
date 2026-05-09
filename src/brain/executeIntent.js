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

      case 'query_events':
        // Inizialmente restituiamo solo la risposta di Gemini
        // In seguito aggiungeremo la logica di ricerca reale
        break;

      case 'query_notes':
        // Inizialmente restituiamo solo la risposta di Gemini
        break;

      case 'delete_event':
        await eventsService.deleteByTitle(data.title);
        break;

      case 'delete_note':
        await notesService.deleteByTitle(data.title);
        break;

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
