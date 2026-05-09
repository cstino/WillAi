import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic } from 'lucide-react';

const MicButton = ({ isListening, isProcessing, audioData, onStart, onStop }) => {
  // Calcoliamo una media semplice dei dati audio per l'animazione degli anelli
  const audioLevel = audioData.length > 0 
    ? audioData.reduce((acc, val) => acc + val, 0) / audioData.length 
    : 0;
  
  const scale = isListening ? 1.1 + (audioLevel / 255) * 0.1 : 1;

  return (
    <div className="relative flex items-center justify-center">
      {/* Anelli concentrici (Active state) */}
      <AnimatePresence>
        {isListening && [1, 2, 3].map((i) => (
          <motion.div
            key={i}
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 2.5, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ 
              duration: 2, 
              repeat: Infinity, 
              delay: i * 0.4,
              ease: "easeOut" 
            }}
            className="absolute w-32 h-32 rounded-full border border-neon-cyan/30"
          />
        ))}
      </AnimatePresence>

      {/* Pulsante Principale */}
      <motion.button
        onPointerDown={onStart}
        onPointerUp={onStop}
        whileTap={{ scale: 0.95 }}
        animate={{ 
          scale,
          boxShadow: isListening ? '0 0 60px rgba(0, 229, 255, 0.4)' : '0 0 20px rgba(0, 0, 0, 0.2)'
        }}
        className={`relative z-10 w-32 h-32 rounded-full glass-card flex items-center justify-center transition-colors duration-300 ${
          isListening ? 'border-neon-cyan' : 'border-glass-border'
        }`}
      >
        {isProcessing ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 rounded-full border-2 border-t-neon-cyan border-r-neon-violet border-b-transparent border-l-transparent"
          />
        ) : (
          <Mic 
            size={48} 
            className={isListening ? 'text-neon-cyan' : 'text-white/40'} 
          />
        )}
      </motion.button>

      {/* Visualizzazione audio (Siri-style bars) */}
      {isListening && (
        <div className="absolute -bottom-12 flex gap-1 items-end h-8">
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              animate={{ 
                height: `${Math.max(4, (audioData[i * 2] || 0) / 4)}px`,
                backgroundColor: i % 2 === 0 ? '#00E5FF' : '#B16BFF'
              }}
              className="w-1.5 rounded-full"
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MicButton;
