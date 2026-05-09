import React, { useState, useEffect } from 'react'
import AuroraBackground from './components/AuroraBackground'
import GlassCard from './components/GlassCard'
import MicButton from './components/MicButton'
import CalendarView from './components/CalendarView'
import NotesView from './components/NotesView'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import { useAudioVisualizer } from './hooks/useAudioVisualizer'
import { interpretCommand } from './brain/interpretCommand'
import { executeIntent } from './brain/executeIntent'
import { speak } from './services/speechSynthesis'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Calendar, FileText } from 'lucide-react'

function App() {
  const [view, setView] = useState('assistant') // 'assistant' | 'calendar' | 'notes'
  const [response, setResponse] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [history, setHistory] = useState([])
  const [engine, setEngine] = useState('gemini') // 'gemini' | 'llama'

  const handleCommand = async (text) => {
    if (!text) return
    setIsProcessing(true)
    
    try {
      const interpreted = await interpretCommand(text, engine)
      interpreted.input_text = text
      
      const finalResponse = await executeIntent(interpreted)
      
      setResponse(finalResponse)
      speak(finalResponse)
      
      setHistory(prev => [{ text, response: finalResponse }, ...prev].slice(0, 15))
    } catch (error) {
      console.error('Errore:', error)
      setResponse('Scusa, ho avuto un problema tecnico.')
    } finally {
      setIsProcessing(false)
    }
  }

  const { isListening, transcript, startListening, stopListening } = useSpeechRecognition(handleCommand)
  const audioData = useAudioVisualizer(isListening)

  return (
    <div className="relative min-h-screen p-6 font-sans text-white overflow-hidden">
      <AuroraBackground />
      
      <AnimatePresence mode="wait">
        {view === 'assistant' ? (
          <motion.main 
            key="assistant"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-md mx-auto pt-12 flex flex-col items-center min-h-[80vh]"
          >
            {/* Header */}
            <header className="mb-12 text-center">
              <h1 className="font-serif text-4xl mb-2">Buongiorno Cristiano</h1>
              <p className="text-text-secondary font-mono text-xs uppercase tracking-widest mb-6">
                {new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · {new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
              </p>

              {/* Engine Selector */}
              <div className="flex justify-center gap-2">
                {[
                  { id: 'gemini', label: 'Gemini 3.1', color: 'bg-neon-cyan' },
                  { id: 'llama', label: 'Llama 3.3', color: 'bg-neon-violet' }
                ].map((btn) => (
                  <button
                    key={btn.id}
                    onClick={() => setEngine(btn.id)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-tighter transition-all duration-300 border ${
                      engine === btn.id 
                        ? `${btn.color} text-black border-transparent shadow-glow` 
                        : 'bg-white/5 text-white/40 border-white/10'
                    }`}
                    style={engine === btn.id ? { boxShadow: `0 0 20px ${btn.id === 'gemini' ? 'rgba(0,229,255,0.4)' : 'rgba(177,107,255,0.4)'}` } : {}}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </header>

            {/* Mic Section */}
            <div className="flex-1 flex flex-col items-center justify-center gap-12 w-full min-h-[40vh]">
              <MicButton 
                isListening={isListening}
                isProcessing={isProcessing}
                audioData={audioData}
                onStart={startListening}
                onStop={stopListening}
              />
              
              <div className="h-20 text-center px-4 w-full">
                <AnimatePresence mode="wait">
                  {isListening ? (
                    <motion.p key="tr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-neon-cyan text-lg italic font-light">
                      "{transcript || 'Ti ascolto...'}"
                    </motion.p>
                  ) : isProcessing ? (
                    <motion.div 
                      key="proc" 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-2"
                    >
                      <p className="text-text-tertiary text-xs uppercase tracking-[0.2em]">Will sta pensando...</p>
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <motion.div 
                            key={i}
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                            className="w-1.5 h-1.5 rounded-full bg-neon-violet"
                          />
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} className="text-sm uppercase tracking-widest">
                      Tieni premuto per parlare
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Conversation Chat History */}
            <div className="w-full max-w-md mt-auto space-y-4 pb-12 overflow-y-auto max-h-[40vh] px-2 scrollbar-hide">
              <AnimatePresence initial={false}>
                {history.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex flex-col ${i === 0 ? 'opacity-100' : 'opacity-60'}`}
                  >
                    {/* User Message */}
                    <div className="self-end max-w-[80%] mb-2">
                      <div className="px-4 py-2 rounded-2xl rounded-tr-none bg-white/5 border border-white/10 text-sm text-text-secondary italic">
                        {item.text}
                      </div>
                    </div>
                    
                    {/* Assistant Response */}
                    <div className="self-start max-w-[90%]">
                      <GlassCard className={`p-4 border-l-2 ${i === 0 ? 'border-l-neon-cyan shadow-glow-cyan/20' : 'border-l-white/20'}`}>
                        <p className="text-sm leading-relaxed">{item.response}</p>
                      </GlassCard>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.main>
        ) : view === 'calendar' ? (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="pt-12"
          >
            <CalendarView />
          </motion.div>
        ) : (
          <motion.div
            key="notes"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="pt-12"
          >
            <NotesView />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navbar Bottom */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-sm h-16 glass-card flex items-center justify-around px-4 z-50">
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
  )
}

export default App
