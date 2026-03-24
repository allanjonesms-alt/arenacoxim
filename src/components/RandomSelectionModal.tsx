import React, { useState, useEffect } from 'react';
import { Player, Team } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, Trophy, User } from 'lucide-react';

interface RandomSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (teamAPlayers: string[], teamBPlayers: string[], goalkeeperAId: string, goalkeeperBId: string) => void;
  players: Player[];
  locationId: string;
  playerCount: number;
  teamA?: Team;
  teamB?: Team;
}

export const RandomSelectionModal: React.FC<RandomSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  players,
  locationId,
  playerCount,
  teamA,
  teamB
}) => {
  const [step, setStep] = useState<'idle' | 'selecting' | 'finished'>('idle');
  const [teamASelected, setTeamASelected] = useState<Player[]>([]);
  const [teamBSelected, setTeamBSelected] = useState<Player[]>([]);
  const [goalkeeperA, setGoalkeeperA] = useState<Player | null>(null);
  const [goalkeeperB, setGoalkeeperB] = useState<Player | null>(null);
  const [currentSelection, setCurrentSelection] = useState<Player | null>(null);
  const [assignedTeam, setAssignedTeam] = useState<'A' | 'B' | null>(null);
  const [targetTeam, setTargetTeam] = useState<'A' | 'B' | null>(null);
  const [countdown, setCountdown] = useState(5);

  const selectionRefs = React.useRef({
    teamAIds: [] as Player[],
    teamBIds: [] as Player[],
    gk1: null as Player | null,
    gk2: null as Player | null,
    currentIndex: 0,
    nextTeam: 'A' as 'A' | 'B'
  });

  const calculateOverall = (player: Player) => {
    if (!player.overallStats) return 0;
    const { speed, stamina, strength, shooting, dribbling, passing } = player.overallStats;
    return speed + stamina + strength + shooting + dribbling + passing;
  };

  const startSelection = () => {
    setStep('selecting');
    setTeamASelected([]);
    setTeamBSelected([]);
    setGoalkeeperA(null);
    setGoalkeeperB(null);
    setCurrentSelection(null);
    setAssignedTeam(null);
    setTargetTeam(null);
    
    // Deduplicate players by ID to prevent duplicate names
    const availablePlayers = Array.from(new Map(players.map(p => [p.id, p])).values());
    
    const goalkeepers = availablePlayers.filter(p => p.position === 'goleiro');
    const fieldPlayers = availablePlayers.filter(p => p.position !== 'goleiro').sort((a, b) => calculateOverall(b) - calculateOverall(a));

    const selectionSequence: {player: Player, team: 'A' | 'B'}[] = [];
    
    // 1. Pick GKs (A then B)
    if (goalkeepers.length >= 2) {
        const shuffledGKs = [...goalkeepers].sort(() => Math.random() - 0.5);
        selectionSequence.push({player: shuffledGKs[0], team: 'A'});
        selectionSequence.push({player: shuffledGKs[1], team: 'B'});
    }

    // 2. Pick Field Players (A then B)
    // Algorithm: Pick a random player for A, then find the most similar overall for B
    const fieldPool = [...fieldPlayers];
    while (fieldPool.length >= 2 && selectionSequence.length < playerCount * 2) {
        // Pick random for A
        const randomIndex = Math.floor(Math.random() * fieldPool.length);
        const playerA = fieldPool.splice(randomIndex, 1)[0];
        const overallA = calculateOverall(playerA);

        // Find most similar for B in the remaining pool
        let closestIndex = 0;
        let minDiff = Infinity;
        for (let j = 0; j < fieldPool.length; j++) {
            const diff = Math.abs(calculateOverall(fieldPool[j]) - overallA);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = j;
            }
        }
        const playerB = fieldPool.splice(closestIndex, 1)[0];

        selectionSequence.push({player: playerA, team: 'A'});
        selectionSequence.push({player: playerB, team: 'B'});
    }

    selectionRefs.current = {
      teamAIds: [],
      teamBIds: [],
      gk1: null,
      gk2: null,
      currentIndex: 0,
      nextTeam: 'A'
    };

    const selectNext = () => {
      if (selectionRefs.current.currentIndex < selectionSequence.length) {
        const { player, team } = selectionSequence[selectionRefs.current.currentIndex];
        
        setCurrentSelection(null);
        setAssignedTeam(null);
        setTargetTeam(team);
        setCountdown(5);
        
        let localCountdown = 5;
        const timer = setInterval(() => {
          localCountdown--;
          
          if (localCountdown > 0) {
            setCountdown(localCountdown);
          } else {
            clearInterval(timer);
            
            // Reveal
            setCurrentSelection(player);
            setAssignedTeam(team);
            
            if (player.position === 'goleiro') {
              if (team === 'A') {
                selectionRefs.current.gk1 = player;
                setGoalkeeperA(player);
              } else {
                selectionRefs.current.gk2 = player;
                setGoalkeeperB(player);
              }
            } else {
              if (team === 'A') {
                selectionRefs.current.teamAIds.push(player);
                setTeamASelected([...selectionRefs.current.teamAIds]);
              } else {
                selectionRefs.current.teamBIds.push(player);
                setTeamBSelected([...selectionRefs.current.teamBIds]);
              }
            }
            
            setTimeout(() => {
              selectionRefs.current.currentIndex++;
              selectNext();
            }, 3000);
          }
        }, 1000);
      } else {
        setStep('finished');
      }
    };

    selectNext();
  };

  if (!isOpen) return null;

  const currentTeamColor = targetTeam === 'A' ? (teamA?.color || '#00ff00') : (teamB?.color || '#ff0000');
  const currentTeamName = targetTeam === 'A' ? (teamA?.name || 'Time A') : (teamB?.name || 'Time B');

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose} />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-[#111] w-full max-w-lg rounded-3xl border border-white/10 p-8 text-center"
      >
        <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-8 text-white">SORTEIO</h2>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 className="text-white font-black uppercase italic text-[10px] mb-4 border-b border-white/10 pb-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: teamA?.color || '#00ff00' }} />
              {teamA?.name || 'Time A'}
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                <span className="text-gray-500">Goleiro:</span>
                <span className={goalkeeperA ? "text-[#00ff00]" : "text-gray-700"}>
                  {goalkeeperA ? (goalkeeperA.nickname || goalkeeperA.name) : "Aguardando..."}
                </span>
              </div>
              {Array.from({ length: playerCount - 1 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                  <span className="text-gray-500">Jogador {i + 2}:</span>
                  <span className={teamASelected[i] ? "text-white" : "text-gray-700"}>
                    {teamASelected[i] ? (teamASelected[i].nickname || teamASelected[i].name) : "---"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 className="text-white font-black uppercase italic text-[10px] mb-4 border-b border-white/10 pb-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: teamB?.color || '#ff0000' }} />
              {teamB?.name || 'Time B'}
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                <span className="text-gray-500">Goleiro:</span>
                <span className={goalkeeperB ? "text-[#00ff00]" : "text-gray-700"}>
                  {goalkeeperB ? (goalkeeperB.nickname || goalkeeperB.name) : "Aguardando..."}
                </span>
              </div>
              {Array.from({ length: playerCount - 1 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                  <span className="text-gray-500">Jogador {i + 2}:</span>
                  <span className={teamBSelected[i] ? "text-white" : "text-gray-700"}>
                    {teamBSelected[i] ? (teamBSelected[i].nickname || teamBSelected[i].name) : "---"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {step === 'idle' && (
          <button 
            onClick={startSelection}
            className="w-full bg-[#00ff00] text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:brightness-90 transition-all"
          >
            Iniciar Sorteio
          </button>
        )}

        {step === 'selecting' && (
          <div className="relative h-80 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {!currentSelection ? (
                <motion.div
                  key="countdown"
                  initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 1.2, opacity: 0, rotate: 10 }}
                  className="w-64 h-64 rounded-[2.5rem] flex flex-col items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.3)] relative overflow-hidden"
                  style={{ backgroundColor: currentTeamColor }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent opacity-50" />
                  <span className="relative z-10 text-black/60 font-black text-xs uppercase tracking-[0.3em] mb-4">
                    {currentTeamName}
                  </span>
                  <span className="relative z-10 text-black font-black text-9xl leading-none tracking-tighter">
                    {countdown}
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  key="reveal"
                  initial={{ scale: 0.8, opacity: 0, rotateY: 90 }}
                  animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                  className="w-64 h-64 rounded-[2.5rem] p-6 flex flex-col items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.3)] relative overflow-hidden"
                  style={{ backgroundColor: currentTeamColor }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent opacity-50" />
                  <div className="relative z-10 mb-4">
                    {currentSelection.photoUrl ? (
                      <img src={currentSelection.photoUrl} className="w-20 h-20 rounded-full object-cover border-4 border-black/10" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-black/5 flex items-center justify-center border-4 border-black/10">
                        <User size={40} className="text-black/40" />
                      </div>
                    )}
                  </div>
                  <h3 className="relative z-10 text-black font-black text-2xl uppercase italic leading-tight text-center">
                    {currentSelection.nickname || currentSelection.name}
                  </h3>
                  <p className="relative z-10 text-black/60 font-bold uppercase text-[10px] tracking-widest mt-1">
                    {currentSelection.position === 'goleiro' ? 'GOLEIRO' : 'JOGADOR'}
                  </p>
                  <div className="relative z-10 mt-4 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-black text-white">
                    {currentTeamName}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {step === 'finished' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            <div className="bg-[#00ff00]/10 border border-[#00ff00]/20 p-4 rounded-2xl">
              <p className="text-[#00ff00] font-black uppercase italic text-sm">Sorteio Finalizado!</p>
            </div>
            <button 
              onClick={() => onConfirm(
                teamASelected.map(p => p.id), 
                teamBSelected.map(p => p.id), 
                goalkeeperA?.id || '', 
                goalkeeperB?.id || ''
              )}
              className="w-full bg-[#00ff00] text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:brightness-90 transition-all shadow-lg shadow-[#00ff00]/20"
            >
              Concluir Escalação
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};
