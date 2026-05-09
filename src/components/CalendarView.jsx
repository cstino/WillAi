import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, MapPin, Clock } from 'lucide-react';
import { eventsService } from '../services/database';
import GlassCard from './GlassCard';

const CalendarView = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const data = await eventsService.getAll();
      setEvents(data);
    } catch (error) {
      console.error('Errore nel caricamento eventi:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper per generare i giorni del mese
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Rettifica per far partire la settimana da lunedì (0: lun, 6: dom)
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    
    const days = [];
    // Padding giorni mese precedente
    for (let i = 0; i < startOffset; i++) {
      days.push({ day: null, month: 'prev' });
    }
    // Giorni mese corrente
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, month: 'current' });
    }
    return days;
  };

  const days = getDaysInMonth(currentDate);
  const monthName = currentDate.toLocaleString('it-IT', { month: 'long' });
  const year = currentDate.getFullYear();

  const changeMonth = (offset) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
    setSelectedDay(null);
  };

  const getEventsForDay = (day) => {
    if (!day) return [];
    return events.filter(e => {
      const d = new Date(e.start_date);
      return d.getDate() === day && 
             d.getMonth() === currentDate.getMonth() && 
             d.getFullYear() === currentDate.getFullYear();
    });
  };

  const isToday = (day) => {
    const today = new Date();
    return day === today.getDate() && 
           currentDate.getMonth() === today.getMonth() && 
           currentDate.getFullYear() === today.getFullYear();
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-8 pb-24">
      {/* Header Calendario */}
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-4xl capitalize">
          {monthName} <span className="text-text-tertiary font-sans text-xl">{year}</span>
        </h2>
        <div className="flex gap-2">
          <button onClick={() => changeMonth(-1)} className="p-2 rounded-full glass-card hover:bg-white/10">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => changeMonth(1)} className="p-2 rounded-full glass-card hover:bg-white/10">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Griglia Settimana */}
      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(d => (
          <span key={d} className="text-[10px] font-mono text-text-tertiary uppercase tracking-widest">{d}</span>
        ))}
      </div>

      {/* Griglia Giorni */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((item, i) => {
          const dayEvents = getEventsForDay(item.day);
          const hasEvents = dayEvents.length > 0;
          const active = selectedDay === item.day;

          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.9 }}
              onClick={() => item.day && setSelectedDay(item.day === selectedDay ? null : item.day)}
              className={`relative aspect-square rounded-xl flex items-center justify-center text-sm transition-all duration-300 ${
                !item.day ? 'opacity-0 pointer-events-none' : 
                active ? 'bg-neon-cyan text-black shadow-glow-cyan' :
                isToday(item.day) ? 'border border-neon-cyan text-neon-cyan' :
                'glass-card hover:bg-white/10'
              }`}
            >
              {item.day}
              {hasEvents && !active && (
                <div className="absolute bottom-1.5 flex gap-0.5">
                  {dayEvents.slice(0, 3).map((_, idx) => (
                    <div key={idx} className="w-1 h-1 rounded-full bg-neon-pink" />
                  ))}
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Dettaglio Giorno Selezionato */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: 20 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: 20 }}
            className="overflow-hidden"
          >
            <GlassCard className="p-5 border-l-4 border-l-neon-pink">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Impegni per il {selectedDay} {monthName}</h3>
                <button onClick={() => setSelectedDay(null)}><X size={18} className="text-text-tertiary" /></button>
              </div>
              
              <div className="space-y-4">
                {getEventsForDay(selectedDay).length > 0 ? (
                  getEventsForDay(selectedDay).map(event => (
                    <div key={event.id} className="space-y-1">
                      <p className="font-medium text-white">{event.title}</p>
                      <div className="flex gap-3 text-xs text-text-secondary">
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> 
                          {new Date(event.start_date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} /> {event.location}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-text-tertiary italic">Nessun impegno programmato.</p>
                )}
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CalendarView;
