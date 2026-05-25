import React from 'react';
import { motion } from 'framer-motion';

const DEFAULT_CHIPS = [
  'Cosa ho oggi?',
  'Ricette salvate',
  'Riepilogo settimana',
  'Chi sono?'
];

export default function SuggestionChips({ onSelectChip }) {
  return (
    <div className="w-full overflow-x-auto py-3 px-4 flex gap-2 scrollbar-none">
      {DEFAULT_CHIPS.map((chip, idx) => (
        <motion.button
          key={idx}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSelectChip(chip)}
          className="px-4 py-2 rounded-full glass-card border border-white/10 text-xs text-white/80 hover:text-white hover:bg-white/10 whitespace-nowrap transition-colors flex-shrink-0"
        >
          {chip}
        </motion.button>
      ))}
    </div>
  );
}
