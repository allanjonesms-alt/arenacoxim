import { Position, Player, Card } from '../types';

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

export const getPlayerFinalOverall = (player: Player, cards: Card[]): number => {
  let overall = player.overallValue || 75;
  if (!cards || cards.length === 0) return overall;

  let assignedCard = cards.find(c => c.imageUrl === player.cardBgUrl) || cards.find(c => c.isDefault);
  
  if (assignedCard && assignedCard.expirationDate) {
    const todayStr = new Date().toISOString().split('T')[0];
    if (assignedCard.expirationDate < todayStr) {
      assignedCard = cards.find(c => c.name.toUpperCase() === 'GERAL') || cards.find(c => c.isDefault);
    }
  }
  
  const isArtilheiroCard = assignedCard?.name?.toUpperCase()?.includes('ARTILHEIRO');
  const cardBonusValue = isArtilheiroCard ? 5 : (assignedCard?.increaseOverall || 0);
  const rawOverallWithBonus = overall + cardBonusValue;

  const silverCard = cards.find(c => {
    const n = c.name?.toUpperCase() || '';
    return n === 'PRATA' || n === 'CARTA PRATA' || n.includes('PRATA');
  });

  const forceSilver = (!player.cardBgUrl || assignedCard?.isDefault || assignedCard?.name?.toUpperCase() === 'GERAL') && rawOverallWithBonus < 90 && !!silverCard;
  const resolvedCard = forceSilver ? silverCard! : assignedCard;

  const resolvedIsArtilheiro = resolvedCard?.name?.toUpperCase()?.includes('ARTILHEIRO');
  const resolvedBonus = resolvedIsArtilheiro ? 5 : (resolvedCard?.increaseOverall || 0);
  
  return overall + resolvedBonus;
};
