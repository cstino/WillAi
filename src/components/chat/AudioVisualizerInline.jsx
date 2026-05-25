import React from 'react';
import { motion } from 'framer-motion';

export default function AudioVisualizerInline({ audioData }) {
  const totalBars = 15;
  const step = audioData && audioData.length > 0 ? Math.floor(audioData.length / totalBars) || 1 : 1;

  return (
    <div className="flex gap-1.5 items-center justify-center h-8 w-full px-4">
      {[...Array(totalBars)].map((_, i) => {
        const val = audioData && audioData.length > 0 ? audioData[i * step] || 0 : 0;
        const height = Math.max(4, (val / 255) * 28);
        const color = i % 3 === 0 
          ? '#00E5FF' // neon-cyan
          : i % 3 === 1 
            ? '#B16BFF' // neon-violet
            : '#FF2A85'; // neon-pink
        
        return (
          <motion.div
            key={i}
            animate={{ 
              height: `${height}px`,
              backgroundColor: color
            }}
            transition={{ type: 'spring', stiffness: 350, damping: 18 }}
            className="w-1 rounded-full"
          />
        );
      })}
    </div>
  );
}
