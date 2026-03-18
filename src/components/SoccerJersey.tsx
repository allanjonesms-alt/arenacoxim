import React from 'react';

interface SoccerJerseyProps {
  color: string;
  className?: string;
  size?: number;
}

export const SoccerJersey: React.FC<SoccerJerseyProps> = ({ color, className = "", size = 100 }) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} drop-shadow-xl`}
    >
      {/* Jersey Body */}
      <path 
        d="M25 20L35 15H65L75 20L85 40L75 45V85H25V45L15 40L25 20Z" 
        fill={color} 
        stroke="black" 
        strokeWidth="1"
      />
      
      {/* 3D Shading/Highlights */}
      <path 
        d="M35 15L25 20L15 40L25 45V85" 
        fill="black" 
        fillOpacity="0.1"
      />
      <path 
        d="M65 15L75 20L85 40L75 45V85" 
        fill="white" 
        fillOpacity="0.1"
      />
      
      {/* Collar */}
      <path 
        d="M40 15C40 18 60 18 60 15H40Z" 
        fill="#222"
      />
      
      {/* Jersey Details (Stripes/Patterns) */}
      <rect x="48" y="20" width="4" height="65" fill="white" fillOpacity="0.2" />
      <rect x="38" y="22" width="2" height="63" fill="white" fillOpacity="0.1" />
      <rect x="60" y="22" width="2" height="63" fill="white" fillOpacity="0.1" />
      
      {/* Sleeve Cuffs */}
      <path d="M15 40L20 42L25 38L15 40Z" fill="black" fillOpacity="0.2" />
      <path d="M85 40L80 42L75 38L85 40Z" fill="black" fillOpacity="0.2" />
      
      {/* Texture Overlay */}
      <rect x="25" y="15" width="50" height="70" fill="url(#jerseyTexture)" fillOpacity="0.05" />
      
      <defs>
        <pattern id="jerseyTexture" x="0" y="0" width="2" height="2" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.5" fill="white" />
        </pattern>
      </defs>
    </svg>
  );
};
