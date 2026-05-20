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

export const GoalkeeperGlove = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <img 
    src="https://static.vecteezy.com/system/resources/thumbnails/016/314/436/small/goalkeeper-gloves-icon-outline-style-vector.jpg" 
    alt="Goalkeeper"
    width={size}
    height={size}
    referrerPolicy="no-referrer"
    className={`${className} object-contain rounded-lg bg-white p-0.5`}
    style={{ width: size, height: size }}
  />
);
