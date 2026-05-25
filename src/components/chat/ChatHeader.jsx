import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { Settings } from 'lucide-react';

export default function ChatHeader({ onOpenSettings }) {
  const [memoryCount, setMemoryCount] = useState(0);

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

  return (
    <header className="w-full glass-card border-b border-white/10 p-4 flex justify-between items-center backdrop-blur-xl rounded-b-2xl">
      <div>
        <h1 className="font-serif text-2xl text-white">Will</h1>
        <p className="text-[10px] font-mono text-neon-cyan uppercase tracking-widest">
          Online · {memoryCount} ricordi su di te
        </p>
      </div>
      <button 
        onClick={onOpenSettings} 
        className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
      >
        <Settings size={20} />
      </button>
    </header>
  );
}
