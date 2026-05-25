import React from 'react';
import { motion } from 'framer-motion';

export default function TypingIndicator() {
  return (
    <div className="flex self-start max-w-[80%] my-2">
      <div className="px-4 py-3 rounded-2xl rounded-bl-none bg-[rgba(0,229,255,0.08)] border border-[rgba(0,229,255,0.18)] backdrop-blur-xl flex items-center gap-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/40 mr-2">
          Will
        </span>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.15,
              ease: 'easeInOut'
            }}
            className="w-1.5 h-1.5 rounded-full bg-neon-cyan"
          />
        ))}
      </div>
    </div>
  );
}
