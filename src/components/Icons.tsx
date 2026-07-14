import React from 'react';

export const SoccerBall = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <img 
    src="https://cdn-icons-png.flaticon.com/512/33/33736.png" 
    alt="Goal"
    width={size}
    height={size}
    referrerPolicy="no-referrer"
    className={`${className} object-contain rounded-full bg-white p-0.5 shadow-sm border border-gray-100`}
    style={{ minWidth: size, minHeight: size, width: size, height: size }}
  />
);

export const SoccerCleat = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <img 
    src="https://cdn-icons-png.flaticon.com/512/91/91515.png" 
    alt="Assist"
    width={size}
    height={size}
    referrerPolicy="no-referrer"
    className={`${className} object-contain rounded-xl bg-white p-1 shadow-sm border border-orange-100`}
    style={{ minWidth: size, minHeight: size, width: size, height: size }}
  />
);

export const GoalkeeperGlove = ({ size = 16, className = "" }: { size?: number, className?: string }) => {
  const isCustomColor = className.includes('text-primary-blue') || className.includes('text-white') || className.includes('text-gray') || className.includes('text-orange');
  const textColor = isCustomColor ? 'currentColor' : '#FF4500';

  return (
    <span 
      className={`font-black tracking-tight inline-flex items-center justify-center select-none leading-none ${className}`}
      style={{ 
        color: textColor,
        fontSize: `${size * 0.85}px`, 
        fontWeight: 900,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        width: size,
        height: size,
        textAlign: 'center'
      }}
    >
      DP
    </span>
  );
};

export const PenaltyMissIcon = ({ size = 16, className = "" }: { size?: number, className?: string }) => {
  const isCustomColor = className.includes('text-primary-blue') || className.includes('text-white') || className.includes('text-gray') || className.includes('text-red');
  const textColor = isCustomColor ? 'currentColor' : '#EF4444'; // Vermelha viva

  return (
    <span 
      className={`font-black tracking-tight inline-flex items-center justify-center select-none leading-none ${className}`}
      style={{ 
        color: textColor,
        fontSize: `${size * 0.85}px`, 
        fontWeight: 900,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        width: size,
        height: size,
        textAlign: 'center',
        textShadow: '0 0 6px rgba(239, 68, 68, 0.65)' // Brilhante / Glowing crimson-red
      }}
    >
      PP
    </span>
  );
};

