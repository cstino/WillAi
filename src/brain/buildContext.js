import { eventsService, notesService } from '../services/database';

export async function buildContext() {
  const now = new Date();
  
  // Helper per date
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const [todayEvents, upcomingEvents, recentEvents, recentNotes, totalEvents, totalNotes] = 
      await Promise.all([
        eventsService.getByDateRange(startOfToday, endOfToday),
        eventsService.getByDateRange(now, next7Days),
        eventsService.getByDateRange(last7Days, now),
        notesService.getRecent(10),
        eventsService.count(),
        notesService.count()
      ]);

    const formatEvents = (evts) => evts.map(e => {
      const start = new Date(e.start_date).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `- ${e.title} (${start})${e.location ? ' @ ' + e.location : ''}`;
    }).join('\n');

    const formatNotes = (nts) => nts.map(n => `- ${n.content.substring(0, 50)}${n.content.length > 50 ? '...' : ''}`).join('\n');

    return `
## STATO ATTUALE
Data e ora: ${now.toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'full', timeStyle: 'short' })}
Giorno della settimana: ${now.toLocaleDateString('it-IT', { weekday: 'long' })}

## EVENTI DI OGGI (${todayEvents.length})
${formatEvents(todayEvents) || 'Nessun evento oggi.'}

## EVENTI PROSSIMI 7 GIORNI (${upcomingEvents.length})
${formatEvents(upcomingEvents) || 'Nessun evento in programma.'}

## EVENTI ULTIMI 7 GIORNI (memoria recente)
${formatEvents(recentEvents) || 'Nessun evento recente.'}

## NOTE RECENTI (ultime 10)
${formatNotes(recentNotes) || 'Nessuna nota.'}

## STATISTICHE
- Eventi totali nel calendario: ${totalEvents}
- Note totali salvate: ${totalNotes}
    `.trim();
  } catch (error) {
    console.error('Errore nel building del contesto:', error);
    return "Contesto non disponibile per errore tecnico.";
  }
}
