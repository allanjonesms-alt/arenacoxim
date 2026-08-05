import React, { useEffect, useState } from 'react';
import { Player, TournamentTeam, Card } from '../types';
import { Shield, X, User } from 'lucide-react';
import { SoccerJersey } from './SoccerJersey';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';

interface TeamSquadModalProps {
  team: TournamentTeam | null;
  players?: Player[];
  onClose: () => void;
}

export const TeamSquadModal: React.FC<TeamSquadModalProps> = ({
  team,
  players: initialPlayers = [],
  onClose
}) => {
  const [localCards, setLocalCards] = useState<Card[]>([]);
  const [fetchedPlayers, setFetchedPlayers] = useState<Player[]>([]);

  useEffect(() => {
    const qCards = query(collection(db, 'cards'), orderBy('createdAt', 'desc'));
    const unsubscribeCards = onSnapshot(qCards, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Card));
      setLocalCards(list);
    }, (err) => {
      console.error("Error loading cards in TeamSquadModal:", err);
    });

    const unsubscribePlayers = onSnapshot(collection(db, 'players'), (snapshot) => {
      const plist = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      setFetchedPlayers(plist);
    }, (err) => {
      console.error("Error loading players in TeamSquadModal:", err);
    });

    return () => {
      unsubscribeCards();
      unsubscribePlayers();
    };
  }, []);

  if (!team) return null;

  // Combine initialPlayers and fetchedPlayers without duplicates
  const allPlayersMap = new Map<string, Player>();
  initialPlayers.forEach(p => allPlayersMap.set(p.id, p));
  fetchedPlayers.forEach(p => allPlayersMap.set(p.id, p));

  // Match team players from playerIds
  const teamPlayers = team.playerIds
    .map(id => allPlayersMap.get(id))
    .filter(Boolean) as Player[];

  // Card resolution logic
  const resolvePlayerCard = (player: Player) => {
    let cardBg = '';
    let fontColor = '#a52a2a';
    let overall = player.overallValue || 75;

    if (localCards && localCards.length > 0) {
      let assignedCard = localCards.find(c => c.imageUrl === player.cardBgUrl) || localCards.find(c => c.isDefault);
      
      if (assignedCard && assignedCard.expirationDate) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (assignedCard.expirationDate < todayStr) {
          assignedCard = localCards.find(c => c.name.toUpperCase() === 'GERAL') || localCards.find(c => c.isDefault);
        }
      }

      const isArtilheiroCard = assignedCard?.name?.toUpperCase()?.includes('ARTILHEIRO');
      const cardBonusValue = isArtilheiroCard ? 5 : (assignedCard?.increaseOverall || 0);
      const rawOverallWithBonus = (player.overallValue || 75) + cardBonusValue;

      const silverCard = localCards.find(c => {
        const n = c.name?.toUpperCase() || '';
        return n === 'PRATA' || n === 'CARTA PRATA' || n.includes('PRATA');
      });
      const forceSilver = (!player.cardBgUrl || assignedCard?.isDefault || assignedCard?.name?.toUpperCase() === 'GERAL') && rawOverallWithBonus < 90 && !!silverCard;

      const resolvedCard = forceSilver ? silverCard! : assignedCard;
      cardBg = resolvedCard?.imageUrl || '';
      fontColor = resolvedCard?.fontColor || '#a52a2a';

      const resolvedIsArtilheiro = resolvedCard?.name?.toUpperCase()?.includes('ARTILHEIRO');
      const resolvedBonus = resolvedIsArtilheiro ? 5 : (resolvedCard?.increaseOverall || 0);
      overall = (player.overallValue || 75) + resolvedBonus;
    }

    if (!cardBg) {
      const defaultCard = localCards.find(c => c.name.toUpperCase() === 'GERAL') || localCards.find(c => c.isDefault);
      cardBg = player.cardBgUrl || defaultCard?.imageUrl || '';
    }

    return { cardBg, fontColor, overall };
  };

  const getProxyUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('data:') || !url.startsWith('http')) return url;
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  };

  // Group players by position
  const goalkeepers = teamPlayers.filter(p => p.position === 'goleiro');
  const defenders = teamPlayers.filter(p => p.position === 'zagueiro' || p.position === 'lateral');
  const midfielders = teamPlayers.filter(p => p.position === 'meio-campo');
  const attackers = teamPlayers.filter(p => p.position === 'centroavante');
  const unassigned = teamPlayers.filter(p => !p.position || (!['goleiro', 'zagueiro', 'lateral', 'meio-campo', 'centroavante'].includes(p.position)));

  // Distribute unassigned if positional lists are sparse
  const allDefenders = [...defenders];
  const allMidfielders = [...midfielders];
  const allAttackers = [...attackers];

  unassigned.forEach((p, i) => {
    if (i % 3 === 0) allDefenders.push(p);
    else if (i % 3 === 1) allMidfielders.push(p);
    else allAttackers.push(p);
  });

  const getVerticalPositions = (count: number): string[] => {
    if (count <= 1) return ['50%'];
    if (count === 2) return ['30%', '70%'];
    if (count === 3) return ['20%', '50%', '80%'];
    if (count === 4) return ['15%', '38%', '62%', '85%'];
    return Array.from({ length: count }, (_, i) => `${15 + (i * 70) / (count - 1)}%`);
  };

  const getPositionLabel = (pos?: string) => {
    switch (pos) {
      case 'goleiro': return 'GOL';
      case 'zagueiro': return 'ZAG';
      case 'lateral': return 'LAT';
      case 'meio-campo': return 'MAT';
      case 'centroavante': return 'ATA';
      default: return 'JOG';
    }
  };

  const renderMiniCard = (player: Player) => {
    const { cardBg, fontColor, overall } = resolvePlayerCard(player);
    const proxiedCardBg = getProxyUrl(cardBg);
    const proxiedPhotoUrl = getProxyUrl(player.photoUrl);
    const playerName = (player.nickname || player.name.split(' ')[0]).toUpperCase();

    return (
      <div className="flex flex-col items-center select-none">
        {/* Mini FUT Card */}
        <div 
          className="w-10 sm:w-12 md:w-14 aspect-[3/4] relative rounded-none overflow-hidden bg-transparent shadow-lg"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
        >
          {proxiedCardBg ? (
            <img 
              src={proxiedCardBg} 
              alt="" 
              className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none" 
            />
          ) : (
            <div className="absolute inset-0 w-full h-full bg-slate-900/60 backdrop-blur-[1px] border border-white/20 rounded-lg z-0" />
          )}

          {/* Overall & Position */}
          <div 
            className="absolute left-[7%] top-[16%] flex flex-col items-center z-10" 
            style={{ color: fontColor }}
          >
            <span className="text-[12px] sm:text-[14px] md:text-[16px] font-black italic leading-none tracking-tighter">
              {overall.toString().padStart(2, '0')}
            </span>
            <span className="text-[4px] sm:text-[5px] md:text-[6px] font-black uppercase mt-0.5 tracking-wider opacity-90">
              {getPositionLabel(player.position)}
            </span>
          </div>

          {/* Photo */}
          <div className="absolute right-[5%] top-[14%] w-[72%] aspect-square z-20 overflow-hidden">
            {proxiedPhotoUrl ? (
              <img 
                src={proxiedPhotoUrl} 
                alt={playerName} 
                className="w-full h-full object-cover" 
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <SoccerJersey color="#eab308" size={24} />
              </div>
            )}
          </div>
        </div>

        {/* Name Plate */}
        <div className="mt-1 bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/20 shadow-md text-center max-w-[70px] sm:max-w-[85px] md:max-w-[100px]">
          <span className="block text-[7px] sm:text-[8.5px] md:text-[10px] font-black uppercase tracking-tight text-white leading-none truncate">
            {playerName}
          </span>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center shrink-0">
                {team.logoUrl ? (
                  <img src={team.logoUrl} alt={team.name} className="w-full h-full object-contain filter drop-shadow-lg" />
                ) : (
                  <Shield className="w-16 h-16 text-amber-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl sm:text-2xl font-black italic uppercase tracking-tight text-white">
                    {team.name}
                  </h3>
                  {team.groupId && (
                    <span className="text-[10px] font-black uppercase bg-amber-400 text-slate-950 px-2.5 py-1 rounded-md">
                      Grupo {team.groupId}
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">
                  Elenco e Disposição Tática ({teamPlayers.length} Jogadores)
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all"
              title="Fechar"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-4 sm:p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            {/* Field Vector Container */}
            <div className="relative aspect-[16/10] sm:aspect-[16/9] w-full bg-[#1b5e20] rounded-2xl md:rounded-3xl border-4 md:border-8 border-white/30 overflow-hidden shadow-2xl select-none">
              {/* Grass Pattern */}
              <div 
                className="absolute inset-0 opacity-15 pointer-events-none" 
                style={{
                  backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 30px, rgba(255,255,255,0.06) 30px, rgba(255,255,255,0.06) 60px)'
                }} 
              />

              {/* Watermark Crest */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none flex flex-col items-center justify-center z-0 opacity-[0.14]">
                {team.logoUrl ? (
                  <img src={team.logoUrl} alt="" className="w-48 h-48 sm:w-72 sm:h-72 md:w-96 md:h-96 object-contain filter grayscale invert drop-shadow-2xl" />
                ) : (
                  <Shield className="w-48 h-48 sm:w-72 sm:h-72 md:w-96 md:h-96 text-white" />
                )}
                <span className="text-sm sm:text-xl font-black uppercase tracking-[0.25em] text-white mt-2">
                  {team.name}
                </span>
              </div>

              {/* Field Markings */}
              {/* Center Line */}
              <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 md:w-1 bg-white/20 pointer-events-none" />
              {/* Center Circle */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 sm:w-32 sm:h-32 md:w-40 md:h-40 border-2 md:border-4 border-white/20 rounded-full pointer-events-none" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 md:w-2.5 md:h-2.5 bg-white/30 rounded-full pointer-events-none" />

              {/* Goal Boxes */}
              <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[16%] h-[60%] border-r-2 md:border-r-4 border-y-2 md:border-y-4 border-white/20 pointer-events-none" />
              <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[6%] h-[32%] border-r-2 md:border-r-3 border-y-2 md:border-y-3 border-white/20 pointer-events-none" />
              <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[16%] h-[60%] border-l-2 md:border-l-4 border-y-2 md:border-y-4 border-white/20 pointer-events-none" />
              <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[6%] h-[32%] border-l-2 md:border-l-3 border-y-2 md:border-y-3 border-white/20 pointer-events-none" />

              {/* Player Positions */}
              {/* Goalkeepers line */}
              {goalkeepers.map((p, idx) => {
                const topPos = getVerticalPositions(goalkeepers.length)[idx];
                return (
                  <div
                    key={p.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 hover:scale-110 transition-transform"
                    style={{ left: '10%', top: topPos }}
                  >
                    {renderMiniCard(p)}
                  </div>
                );
              })}

              {/* Defenders line */}
              {allDefenders.map((p, idx) => {
                const topPos = getVerticalPositions(allDefenders.length)[idx];
                return (
                  <div
                    key={p.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 hover:scale-110 transition-transform"
                    style={{ left: goalkeepers.length > 0 ? '32%' : '20%', top: topPos }}
                  >
                    {renderMiniCard(p)}
                  </div>
                );
              })}

              {/* Midfielders line */}
              {allMidfielders.map((p, idx) => {
                const topPos = getVerticalPositions(allMidfielders.length)[idx];
                return (
                  <div
                    key={p.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 hover:scale-110 transition-transform"
                    style={{ left: '58%', top: topPos }}
                  >
                    {renderMiniCard(p)}
                  </div>
                );
              })}

              {/* Attackers line */}
              {allAttackers.map((p, idx) => {
                const topPos = getVerticalPositions(allAttackers.length)[idx];
                return (
                  <div
                    key={p.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 hover:scale-110 transition-transform"
                    style={{ left: '84%', top: topPos }}
                  >
                    {renderMiniCard(p)}
                  </div>
                );
              })}

              {teamPlayers.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-white/70 font-black uppercase text-xs">
                  Nenhum jogador cadastrado para esta equipe
                </div>
              )}
            </div>

            {/* Squad List Section */}
            <div>
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
                Lista de Jogadores Inscritos ({teamPlayers.length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {teamPlayers.map(p => {
                  const { overall } = resolvePlayerCard(p);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-300 transition-all"
                    >
                      <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs">
                        {p.photoUrl ? (
                          <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-900 truncate">
                          {p.nickname || p.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] font-black uppercase bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                            {getPositionLabel(p.position)}
                          </span>
                          <span className="text-[10px] font-black text-primary-blue">
                            {overall} OVR
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {teamPlayers.length === 0 && (
                  <p className="text-xs font-bold text-gray-400 italic col-span-full py-2">
                    Nenhum jogador associado a este time.
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
