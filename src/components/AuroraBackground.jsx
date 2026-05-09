import React from 'react';

const AuroraBackground = () => {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-bg-base">
      {/* Aurora Blobs */}
      <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-neon-cyan aurora-blur animate-aurora" />
      <div className="absolute top-[10%] -right-[10%] w-[50%] h-[50%] rounded-full bg-neon-violet aurora-blur animate-aurora" style={{ animationDelay: '-5s' }} />
      <div className="absolute -bottom-[10%] left-[20%] w-[40%] h-[40%] rounded-full bg-neon-pink aurora-blur animate-aurora" style={{ animationDelay: '-10s' }} />
      
      {/* Grain Texture */}
      <div className="absolute inset-0 bg-grain" />
    </div>
  );
};

export default AuroraBackground;
