import React, { useState, useEffect } from 'react';
import AuroraBackground from './components/AuroraBackground';
import CalendarView from './components/CalendarView';
import NotesView from './components/NotesView';
import ChatInputBar from './components/chat/ChatInputBar';
import MessageList from './components/chat/MessageList';
import SuggestionChips from './components/chat/SuggestionChips';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useAudioVisualizer } from './hooks/useAudioVisualizer';
import { processMessage } from './brain/processMessage';
import { speak } from './services/speechSynthesis';
import { supabase } from './services/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Calendar, FileText, X, Menu, Settings } from 'lucide-react';

function App() {
  const [view, setView] = useState('assistant'); // 'assistant' | 'calendar' | 'notes'
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [engine, setEngine] = useState('gemini'); // 'gemini' | 'llama'
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);

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

  // Fetch memory count and subscribe to changes
  useEffect(() => {
    async function getCount() {
      const { count, error } = await supabase
        .from('memories')
        .select('*', { count: 'exact', head: true })
        .gt('relevance_score', 0);
      if (!error && count !== null) {
        setMemoryCount(count);
      }
    }
    
    getCount();
    
    const channel = supabase
      .channel('memories-count-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memories' }, getCount)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
    <div className="relative min-h-screen text-white overflow-hidden font-sans flex flex-col animate-fade-in bg-bg-base">
      <AuroraBackground />
      
      {/* Global Header */}
      <header 
        className="fixed top-0 left-0 right-0 z-40 bg-bg-base/30 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-6"
        style={{ 
          height: 'calc(env(safe-area-inset-top) + 56px)',
          paddingTop: 'env(safe-area-inset-top)'
        }}
      >
        <button 
          onClick={() => setShowSidebar(true)}
          className="p-2 rounded-xl hover:bg-white/5 text-white/70 hover:text-white transition-colors"
        >
          <Menu size={22} />
        </button>
        
        <h1 className="font-serif text-xl text-white tracking-wide">
          {view === 'assistant' ? 'Will' : view === 'calendar' ? 'Calendario' : 'Note'}
        </h1>
        
        <button 
          onClick={() => setShowSettings(true)} 
          className="p-2 rounded-xl hover:bg-white/5 text-white/70 hover:text-white transition-colors"
        >
          <Settings size={20} />
        </button>
      </header>
      
      <AnimatePresence mode="wait">
        {view === 'assistant' ? (
          <motion.main 
            key="assistant"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 flex flex-col max-w-md mx-auto w-full overflow-hidden"
            style={{ 
              paddingTop: 'calc(env(safe-area-inset-top) + 64px)',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
              paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
              paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
              height: '100dvh'
            }}
          >
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
            className="flex-1 overflow-y-auto"
            style={{ 
              paddingTop: 'calc(env(safe-area-inset-top) + 72px)',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
              paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
              paddingRight: 'max(1.5rem, env(safe-area-inset-right))'
            }}
          >
            <CalendarView />
          </motion.div>
        ) : (
          <motion.div
            key="notes"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="flex-1 overflow-y-auto"
            style={{ 
              paddingTop: 'calc(env(safe-area-inset-top) + 72px)',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
              paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
              paddingRight: 'max(1.5rem, env(safe-area-inset-right))'
            }}
          >
            <NotesView />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{
              paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
              paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
              paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
              paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))'
            }}
          >
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
              className="w-full max-w-sm glass-card p-6 relative z-10 border border-white/10 rounded-2xl animate-scale-up"
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
                      { id: 'gemini', label: 'Gemini 2.5 Flash', desc: 'Veloce e strutturato' },
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

      {/* Sidebar Drawer */}
      <AnimatePresence>
        {showSidebar && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSidebar(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            />
            
            {/* Drawer Content */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 bottom-0 left-0 z-50 w-72 max-w-[80vw] bg-[#0c0b11]/95 border-r border-white/5 backdrop-blur-2xl flex flex-col p-6 text-white"
              style={{
                paddingTop: 'calc(env(safe-area-inset-top) + 24px)',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)'
              }}
            >
              {/* Drawer Header */}
              <div className="mb-8">
                <h2 className="font-serif text-3xl">Will</h2>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
                  <span className="text-[10px] font-mono text-white/50 uppercase tracking-wider">
                    {memoryCount} ricordi salvati
                  </span>
                </div>
              </div>
              
              {/* Navigation Links */}
              <nav className="flex-1 space-y-2">
                {[
                  { id: 'assistant', label: 'Chat Assistente', icon: Sparkles, color: 'text-neon-cyan' },
                  { id: 'calendar', label: 'Calendario', icon: Calendar, color: 'text-neon-pink' },
                  { id: 'notes', label: 'Le mie Note', icon: FileText, color: 'text-neon-violet' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setView(item.id);
                      setShowSidebar(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left ${
                      view === item.id 
                        ? 'bg-white/10 border border-white/10 font-semibold' 
                        : 'hover:bg-white/5 border border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <item.icon size={18} className={item.color} />
                    <span className="text-sm">{item.label}</span>
                  </button>
                ))}
              </nav>
              
              {/* Drawer Footer */}
              <div className="border-t border-white/5 pt-4 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setShowSettings(true);
                    setShowSidebar(false);
                  }}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/5 opacity-70 hover:opacity-100 text-left text-sm transition-all"
                >
                  <Settings size={16} />
                  <span>Impostazioni</span>
                </button>
                <div className="px-4 text-[10px] font-mono text-white/30 uppercase tracking-widest">
                  Cristiano · Will v2.0
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
