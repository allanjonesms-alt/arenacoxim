import { Position } from '../types';

export const getPositionAbbr = (pos: Position) => {
  switch (pos) {
    case 'goleiro': return 'GK';
    case 'zagueiro': return 'DF';
    case 'lateral': return 'LAT';
    case 'meio-campo': return 'MAT';
    case 'centroavante': return 'CA';
    default: return pos;
  }
};

export const getPositionColor = (pos: Position) => {
  switch (pos) {
    case 'goleiro': return 'text-sky-400';
    case 'zagueiro': return 'text-blue-700';
    case 'lateral': return 'text-cyan-400';
    case 'meio-campo': return 'text-purple-500';
    case 'centroavante': return 'text-red-500';
    default: return 'text-gray-500';
  }
};
