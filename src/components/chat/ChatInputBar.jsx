import React, { useState, useEffect } from 'react';
import { Send, Mic, Square, Loader } from 'lucide-react';
import AudioVisualizerInline from './AudioVisualizerInline';
import { motion, AnimatePresence } from 'framer-motion';

export default function ChatInputBar({
  isListening,
  transcript,
  startListening,
  stopListening,
  audioData,
  isProcessing,
  onSubmit
}) {
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    if (isListening && transcript) {
      setInputText(transcript);
    }
  }, [transcript, isListening]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    onSubmit(text);
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="w-full px-4 py-3 flex gap-2 items-center bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl">
      <div className="flex-1 flex items-center min-h-[44px]">
        <AnimatePresence mode="wait">
          {isListening ? (
            <motion.div
              key="visualizer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex justify-center"
            >
              <AudioVisualizerInline audioData={audioData} />
            </motion.div>
          ) : isProcessing ? (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs font-mono text-white/40 uppercase tracking-widest px-2"
            >
              Will sta elaborando...
            </motion.div>
          ) : (
            <motion.input
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scrivi a Will..."
              className="w-full bg-transparent border-0 text-base text-white placeholder-white/30 focus:ring-0 focus:outline-none px-2"
            />
          )}
        </AnimatePresence>
      </div>

      <div className="flex-shrink-0 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {isListening ? (
            <motion.button
              key="stop-mic"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={stopListening}
              className="p-3 rounded-xl bg-neon-pink text-black hover:bg-neon-pink/80 transition-colors shadow-glow-pink"
            >
              <Square size={16} fill="black" />
            </motion.button>
          ) : isProcessing ? (
            <motion.div
              key="loading"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="p-3 text-neon-cyan"
            >
              <Loader size={16} className="animate-spin" />
            </motion.div>
          ) : inputText.trim() ? (
            <motion.button
              key="send"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={handleSend}
              className="p-3 rounded-xl bg-neon-cyan text-black hover:bg-neon-cyan/80 transition-colors shadow-glow-cyan"
            >
              <Send size={16} />
            </motion.button>
          ) : (
            <motion.button
              key="mic"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={startListening}
              className="p-3 rounded-xl bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
            >
              <Mic size={16} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
