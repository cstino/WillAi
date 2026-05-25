import React from 'react';
import { Calendar, FileText } from 'lucide-react';
import GlassCard from '../GlassCard';

export default function MemoryListBubble({ memories }) {
  if (!memories || memories.length === 0) return null;

  return (
    <div className="w-full max-w-[320px] self-start my-2">
      <GlassCard className="p-4 border-l-4 border-l-neon-cyan">
        <h4 className="text-[10px] font-mono uppercase tracking-widest text-white/50 mb-3">
          Elementi trovati ({memories.length})
        </h4>
        <div className="space-y-3">
          {memories.map((mem) => {
            const isEvent = mem.memory_type === 'event' || mem.memory_type === 'reminder';
            return (
              <div key={mem.id} className="flex items-start gap-2.5 border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
                <div className="mt-0.5 flex-shrink-0">
                  {isEvent ? (
                    <Calendar size={14} className="text-neon-pink" />
                  ) : (
                    <FileText size={14} className="text-neon-cyan" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-white/90 font-medium">
                    {mem.content}
                  </p>
                  {mem.trigger_at && (
                    <span className="text-[9px] font-mono text-white/40 block mt-0.5">
                      {new Date(mem.trigger_at).toLocaleString('it-IT', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
