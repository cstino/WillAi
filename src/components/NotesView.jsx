import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Trash2, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { notesService } from '../services/database';
import GlassCard from './GlassCard';

const NotesView = () => {
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    try {
      const data = await notesService.getAll();
      setNotes(data);
    } catch (error) {
      console.error('Errore caricamento note:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteNote = async (id, e) => {
    e.stopPropagation();
    if (confirm('Vuoi eliminare questa nota?')) {
      try {
        await notesService.delete(id);
        setNotes(notes.filter(n => n.id !== id));
        if (selectedNote?.id === id) setSelectedNote(null);
      } catch (error) {
        console.error('Errore eliminazione nota:', error);
      }
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-8 pb-32">
      <header className="flex justify-between items-end px-2">
        <div>
          <h2 className="font-serif text-4xl">Le mie Note</h2>
          <p className="text-text-tertiary text-sm mt-1">{notes.length} note salvate</p>
        </div>
      </header>

      {/* Lista Note */}
      <div className="grid gap-4">
        {notes.length > 0 ? (
          notes.map((note) => (
            <motion.div
              key={note.id}
              layoutId={`note-${note.id}`}
              onClick={() => setSelectedNote(note)}
              className="cursor-pointer"
            >
              <GlassCard className="p-5 hover:bg-white/10 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <motion.h3 layoutId={`title-${note.id}`} className="font-semibold text-lg">{note.title}</motion.h3>
                  <button onClick={(e) => deleteNote(note.id, e)} className="text-text-tertiary hover:text-neon-pink">
                    <Trash2 size={16} />
                  </button>
                </div>
                <motion.p layoutId={`content-${note.id}`} className="text-sm text-text-secondary line-clamp-2 leading-relaxed">
                  {note.content}
                </motion.p>
                <div className="flex items-center gap-4 mt-4 text-[10px] font-mono text-text-tertiary uppercase tracking-widest">
                  <span className="flex items-center gap-1"><CalendarIcon size={10} /> {new Date(note.created_at).toLocaleDateString('it-IT')}</span>
                  <span className="flex items-center gap-1"><Clock size={10} /> {new Date(note.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </GlassCard>
            </motion.div>
          ))
        ) : !isLoading ? (
          <div className="text-center py-20 text-text-tertiary italic">
            Nessuna nota presente. Chiedi a Jarvis di aggiungerne una!
          </div>
        ) : null}
      </div>

      {/* Dettaglio Nota (Overlay Fullscreen) */}
      <AnimatePresence>
        {selectedNote && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedNote(null)}
              className="absolute inset-0 bg-bg-base/80 backdrop-blur-md"
            />
            
            <motion.div
              layoutId={`note-${selectedNote.id}`}
              className="w-full max-w-lg h-[70vh] glass-card p-8 relative z-10 overflow-y-auto"
            >
              <button 
                onClick={() => setSelectedNote(null)}
                className="absolute top-6 right-6 p-2 rounded-full bg-white/5 text-text-tertiary"
              >
                <X size={20} />
              </button>

              <div className="mt-4">
                <motion.h2 layoutId={`title-${selectedNote.id}`} className="font-serif text-3xl mb-6 pr-10">
                  {selectedNote.title}
                </motion.h2>
                <motion.div layoutId={`content-${selectedNote.id}`} className="text-text-secondary leading-relaxed space-y-4">
                  {selectedNote.content.split('\n').map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </motion.div>
                
                <div className="border-t border-white/10 mt-8 pt-6 text-xs text-text-tertiary font-mono uppercase tracking-widest flex justify-between">
                  <span>Creato il {new Date(selectedNote.created_at).toLocaleString('it-IT')}</span>
                  <span>Sorgente: {selectedNote.source}</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotesView;
