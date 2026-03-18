import React from 'react';

export const SoccerBall = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <img 
    src="https://static.vecteezy.com/ti/vetor-gratis/p1/23366192-futebol-bola-futebol-bola-icone-gratis-vetor.jpg" 
    alt="Goal"
    width={size}
    height={size}
    referrerPolicy="no-referrer"
    className={`${className} object-contain rounded-full bg-white p-0.5`}
    style={{ width: size, height: size }}
  />
);

export const SoccerCleat = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <img 
    src="https://static.vecteezy.com/system/resources/thumbnails/014/524/662/small/soccer-cleat-icon-outline-style-vector.jpg" 
    alt="Assist"
    width={size}
    height={size}
    referrerPolicy="no-referrer"
    className={`${className} object-contain rounded-lg bg-white p-0.5`}
    style={{ width: size, height: size }}
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
