import React, { useState, useEffect } from 'react';
import AuroraBackground from './components/AuroraBackground';
import CalendarView from './components/CalendarView';
import NotesView from './components/NotesView';
import ChatHeader from './components/chat/ChatHeader';
import MessageList from './components/chat/MessageList';
import SuggestionChips from './components/chat/SuggestionChips';
import ChatInputBar from './components/chat/ChatInputBar';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useAudioVisualizer } from './hooks/useAudioVisualizer';
import { processMessage } from './brain/processMessage';
import { speak } from './services/speechSynthesis';
import { supabase } from './services/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Calendar, FileText, X } from 'lucide-react';

function App() {
  const [view, setView] = useState('assistant'); // 'assistant' | 'calendar' | 'notes'
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [engine, setEngine] = useState('gemini'); // 'gemini' | 'llama'
  const [showSettings, setShowSettings] = useState(false);

  // Load chat messages on mount
  useEffect(() => {
    async function loadChatHistory() {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50);
      
      if (!error && data && data.length > 0) {
        setMessages(data);
        
        // If last message is older than 1 hour, trigger a new greeting
        const lastMsgTime = new Date(data[data.length - 1].created_at).getTime();
        const oneHour = 60 * 60 * 1000;
        if (Date.now() - lastMsgTime > oneHour) {
          triggerGreeting();
        }
      } else {
        // If no history, trigger greeting
        triggerGreeting();
      }
    }
    loadChatHistory();
  }, []);

  const triggerGreeting = async () => {
    setIsThinking(true);
    try {
      const result = await processMessage({ text: '__GREETING__', source: 'app_text', engine });
      if (result && result.assistantMessage) {
        setMessages(prev => [...prev, result.assistantMessage]);
      }
    } catch (err) {
      console.error('Failed to trigger greeting:', err);
    } finally {
      setIsThinking(false);
    }
  };

  const handleSendMessage = async (text, source = 'app_text') => {
    if (!text || !text.trim()) return;
    
    // Optimistically add user message to UI
    const tempUserMsg = {
      id: Math.random().toString(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setIsThinking(true);
    
    try {
      const result = await processMessage({ text, source, engine });
      
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== tempUserMsg.id);
        const next = [...filtered];
        if (result.userMessage) {
          next.push(result.userMessage);
        } else {
          next.push({ ...tempUserMsg, id: result.userMessage?.id || tempUserMsg.id });
        }
        if (result.assistantMessage) {
          next.push(result.assistantMessage);
          // Speak the assistant's voice response
          speak(result.assistantMessage.content);
        }
        return next;
      });
    } catch (err) {
      console.error('Failed to process message:', err);
      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        role: 'assistant',
        content: 'Scusa Cristiano, ho riscontrato un errore tecnico nel processare la tua richiesta.',
        message_type: 'error',
        created_at: new Date().toISOString()
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  // Speech hooks
  const { isListening, transcript, startListening, stopListening } = useSpeechRecognition((txt) => {
    handleSendMessage(txt, 'app_voice');
  });
  const audioData = useAudioVisualizer(isListening);

  return (
    <div className="relative min-h-screen text-white overflow-hidden font-sans flex flex-col">
      <AuroraBackground />
      
      <AnimatePresence mode="wait">
        {view === 'assistant' ? (
          <motion.main 
            key="assistant"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 flex flex-col max-w-md mx-auto w-full pt-4 pb-28 h-screen"
          >
            {/* Sticky Header */}
            <ChatHeader onOpenSettings={() => setShowSettings(true)} />
            
            {/* Chat Area */}
            <MessageList messages={messages} isThinking={isThinking} />
            
            {/* Quick Prompts */}
            <SuggestionChips onSelectChip={(chipText) => handleSendMessage(chipText, 'app_text')} />
            
            {/* Bottom Input Area */}
            <div className="px-4 w-full">
              <ChatInputBar 
                isListening={isListening}
                transcript={transcript}
                startListening={startListening}
                stopListening={stopListening}
                audioData={audioData}
                isProcessing={isThinking}
                onSubmit={(text) => handleSendMessage(text, 'app_text')}
              />
            </div>
          </motion.main>
        ) : view === 'calendar' ? (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="pt-12 flex-1 overflow-y-auto"
          >
            <CalendarView />
          </motion.div>
        ) : (
          <motion.div
            key="notes"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="pt-12 flex-1 overflow-y-auto"
          >
            <NotesView />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm glass-card p-6 relative z-10 border border-white/10 rounded-2xl"
            >
              <button 
                onClick={() => setShowSettings(false)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 text-white/60 hover:text-white"
              >
                <X size={18} />
              </button>

              <h2 className="font-serif text-xl mb-4 pr-8">Impostazioni del Cervello</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-mono uppercase text-white/50 tracking-wider block mb-2">
                    Modello Linguistico (Engine)
                  </label>
                  <div className="flex gap-2">
                    {[
                      { id: 'gemini', label: 'Gemini 1.5 Flash', desc: 'Veloce e strutturato' },
                      { id: 'llama', label: 'Llama 3.3 (Groq)', desc: 'Ragionamento avanzato' }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setEngine(opt.id)}
                        className={`flex-1 p-3 rounded-xl border text-left transition-all duration-300 ${
                          engine === opt.id 
                            ? 'bg-white/10 border-neon-cyan shadow-glow-cyan/20' 
                            : 'bg-white/5 border-white/10 opacity-60'
                        }`}
                      >
                        <p className="text-xs font-semibold">{opt.label}</p>
                        <p className="text-[10px] text-white/50 mt-1">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Navbar Bottom */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-sm h-16 glass-card flex items-center justify-around px-4 z-40">
        {[
          { id: 'assistant', icon: Sparkles, color: 'text-neon-cyan' },
          { id: 'calendar', icon: Calendar, color: 'text-neon-pink' },
          { id: 'notes', icon: FileText, color: 'text-neon-violet' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className="relative p-3 transition-colors duration-300"
          >
            {view === tab.id && (
              <motion.div
                layoutId="nav-pill"
                className="absolute inset-0 bg-white/5 rounded-xl border border-white/10"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            <tab.icon 
              size={24} 
              className={`relative z-10 transition-colors duration-300 ${
                view === tab.id ? tab.color : 'text-white/30'
              }`}
            />
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
