import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, AlertTriangle } from 'lucide-react';
import { supabase } from '../../services/supabase';
import MemoryCardBubble from './MemoryCardBubble';
import MemoryListBubble from './MemoryListBubble';

function Typewriter({ text, speed = 15, onComplete }) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    let index = 0;
    setDisplayedText('');
    const interval = setInterval(() => {
      setDisplayedText((prev) => prev + text.charAt(index));
      index++;
      if (index >= text.length) {
        clearInterval(interval);
        if (onComplete) onComplete();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span>
      {displayedText}
      {displayedText.length < text.length && (
        <span className="inline-block w-1.5 h-3.5 bg-neon-cyan animate-pulse ml-0.5" />
      )}
    </span>
  );
}

export default function MessageBubble({ message, isLatest, onTypewriterComplete }) {
  const [memories, setMemories] = useState([]);
  const [isTyping, setIsTyping] = useState(isLatest && message.role === 'assistant');

  useEffect(() => {
    if (message.related_memory_ids && message.related_memory_ids.length > 0) {
      async function fetchMemories() {
        const { data, error } = await supabase
          .from('memories')
          .select('*')
          .in('id', message.related_memory_ids);
        if (!error && data) {
          setMemories(data);
        }
      }
      fetchMemories();
    }
  }, [message.related_memory_ids]);

  const isUser = message.role === 'user';
  
  if (message.message_type === 'action_confirm' && message.role === 'assistant') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex justify-center my-2"
      >
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neon-lime/10 border border-neon-lime/30 text-xs font-medium text-neon-lime shadow-glow-lime/10">
          <Check size={14} />
          <span>{message.content}</span>
        </div>
      </motion.div>
    );
  }

  if (message.message_type === 'error' && message.role === 'assistant') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex self-start max-w-[85%] my-2"
      >
        <div className="px-4 py-3 rounded-2xl rounded-bl-none bg-neon-pink/10 border border-neon-pink/30 backdrop-blur-xl text-sm text-neon-pink flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{message.content}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`flex flex-col my-2 ${isUser ? 'items-end self-end max-w-[80%]' : 'items-start self-start max-w-[85%]'}`}
    >
      {/* Name / Role Identifier */}
      <span className="text-[9px] font-mono uppercase tracking-widest text-white/30 mb-1 px-1">
        {isUser ? 'Cristiano' : 'Will'}
      </span>

      {/* Main Text Bubble */}
      <div
        className={`px-4 py-3 rounded-2xl backdrop-blur-xl text-sm leading-relaxed ${
          isUser
            ? 'bg-[rgba(177,107,255,0.12)] border border-[rgba(177,107,255,0.25)] rounded-tr-none text-white/90'
            : 'bg-[rgba(0,229,255,0.08)] border border-[rgba(0,229,255,0.18)] rounded-tl-none text-white/90'
        }`}
      >
        {isTyping ? (
          <Typewriter
            text={message.content}
            speed={15}
            onComplete={() => {
              setIsTyping(false);
              if (onTypewriterComplete) onTypewriterComplete();
            }}
          />
        ) : (
          <span>{message.content}</span>
        )}
      </div>

      {/* Rich Memory projections */}
      {!isTyping && memories.length > 0 && (
        <div className="w-full mt-1.5 flex flex-col gap-1.5">
          {message.message_type === 'memory_card' &&
            memories.map((mem) => <MemoryCardBubble key={mem.id} memory={mem} />)}
          {message.message_type === 'memory_list' && (
            <MemoryListBubble memories={memories} />
          )}
        </div>
      )}
    </motion.div>
  );
}
