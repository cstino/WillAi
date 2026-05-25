import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';

export default function MessageList({ messages, isThinking }) {
  const containerRef = useRef(null);

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  return (
    <div 
      ref={containerRef}
      className="flex-1 w-full overflow-y-auto px-4 py-2 flex flex-col scrollbar-none space-y-1"
    >
      {messages.map((msg, idx) => (
        <MessageBubble 
          key={msg.id || idx}
          message={msg}
          isLatest={idx === messages.length - 1 && msg.role === 'assistant'}
          onTypewriterComplete={scrollToBottom}
        />
      ))}
      {isThinking && <TypingIndicator />}
    </div>
  );
}
