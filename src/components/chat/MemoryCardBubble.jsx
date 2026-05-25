import React from 'react';
import { Calendar, FileText, Clock, MapPin } from 'lucide-react';
import GlassCard from '../GlassCard';

export default function MemoryCardBubble({ memory }) {
  if (!memory) return null;

  const isEvent = memory.memory_type === 'event' || memory.memory_type === 'reminder';
  
  return (
    <div className="w-full max-w-[280px] self-start my-2">
      <GlassCard className="p-4 border-l-4 border-l-neon-pink">
        <div className="flex items-center gap-2 mb-2">
          {isEvent ? (
            <Calendar size={16} className="text-neon-pink" />
          ) : (
            <FileText size={16} className="text-neon-violet" />
          )}
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/50">
            {memory.memory_type}
          </span>
        </div>
        
        <h4 className="font-semibold text-sm text-white mb-1">
          {memory.content}
        </h4>
        
        {isEvent && memory.trigger_at && (
          <div className="space-y-1 text-xs text-white/60 font-mono mt-2">
            <div className="flex items-center gap-1">
              <Clock size={12} />
              <span>
                {new Date(memory.trigger_at).toLocaleString('it-IT', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
            {memory.location && (
              <div className="flex items-center gap-1">
                <MapPin size={12} />
                <span>{memory.location}</span>
              </div>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
