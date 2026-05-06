import React, { useState, useEffect } from 'react';
import { Player, Team } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, Trophy, User, CheckCircle2 } from 'lucide-react';
import { calculateAverage } from '../utils/gradeUtils';

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
    return calculateAverage(player.overallStats);
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
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-md" 
        onClick={onClose} 
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-white w-full max-w-lg rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-10 text-center border border-gray-100 max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-6 md:mb-8 shrink-0">
          <div className="flex items-center gap-2 md:gap-3">
             <div className="bg-primary-blue/5 p-2 md:p-3 rounded-xl md:rounded-2xl border border-primary-blue/10">
                <Trophy className="w-4 h-4 md:w-5 md:h-5 text-primary-blue" />
             </div>
             <h2 className="text-xl md:text-2xl font-black uppercase italic tracking-tighter text-primary-blue">SORTEIO</h2>
          </div>
          <button onClick={onClose} className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-all text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8 overflow-y-auto pr-1">
          <div className="bg-gray-50 p-4 md:p-5 rounded-2xl md:rounded-[2rem] border border-gray-100 shadow-inner">
            <h3 className="text-primary-blue font-black uppercase italic text-[10px] md:text-[11px] mb-3 md:mb-4 border-b border-gray-200 pb-2 flex items-center gap-2">
              <div className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full shadow-sm" style={{ backgroundColor: teamA?.color || '#3b82f6' }} />
              {teamA?.name || 'Time A'}
            </h3>
            <div className="space-y-2 md:space-y-3">
              <div className="flex items-center justify-between text-[8px] md:text-[10px] font-black uppercase tracking-widest leading-none">
                <span className="text-gray-400 italic">Goleiro</span>
                <span className={`truncate max-w-[80px] md:max-w-none ${goalkeeperA ? "text-primary-blue" : "text-gray-200"}`}>
                  {goalkeeperA ? (goalkeeperA.nickname || goalkeeperA.name) : "..."}
                </span>
              </div>
              {Array.from({ length: playerCount - 1 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between text-[8px] md:text-[10px] font-black uppercase tracking-widest leading-none">
                  <span className="text-gray-400 italic">Atleta {i + 2}</span>
                  <span className={`truncate max-w-[80px] md:max-w-none ${teamASelected[i] ? "text-primary-blue" : "text-gray-200"}`}>
                    {teamASelected[i] ? (teamASelected[i].nickname || teamASelected[i].name) : "---"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gray-50 p-4 md:p-5 rounded-2xl md:rounded-[2rem] border border-gray-100 shadow-inner">
            <h3 className="text-primary-blue font-black uppercase italic text-[10px] md:text-[11px] mb-3 md:mb-4 border-b border-gray-200 pb-2 flex items-center gap-2">
              <div className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full shadow-sm" style={{ backgroundColor: teamB?.color || '#eab308' }} />
              {teamB?.name || 'Time B'}
            </h3>
            <div className="space-y-2 md:space-y-3">
              <div className="flex items-center justify-between text-[8px] md:text-[10px] font-black uppercase tracking-widest leading-none">
                <span className="text-gray-400 italic">Goleiro</span>
                <span className={`truncate max-w-[80px] md:max-w-none ${goalkeeperB ? "text-primary-blue" : "text-gray-200"}`}>
                  {goalkeeperB ? (goalkeeperB.nickname || goalkeeperB.name) : "..."}
                </span>
              </div>
              {Array.from({ length: playerCount - 1 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between text-[8px] md:text-[10px] font-black uppercase tracking-widest leading-none">
                  <span className="text-gray-400 italic">Atleta {i + 2}</span>
                  <span className={`truncate max-w-[80px] md:max-w-none ${teamBSelected[i] ? "text-primary-blue" : "text-gray-200"}`}>
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
            className="w-full bg-primary-blue text-white py-5 rounded-3xl font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-xl shadow-blue-100 active:scale-95"
          >
            Iniciar Sorteio
          </button>
        )}

         {step === 'selecting' && (
          <div className="relative h-48 md:h-80 flex items-center justify-center shrink-0">
            <AnimatePresence mode="wait">
              {!currentSelection ? (
                <motion.div
                  key="countdown"
                  initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 1.2, opacity: 0, rotate: 10 }}
                  className="w-40 h-40 md:w-64 md:h-64 rounded-[2rem] md:rounded-[3.5rem] flex flex-col items-center justify-center shadow-2xl relative overflow-hidden border-4 border-white"
                  style={{ backgroundColor: currentTeamColor }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-50" />
                  <span className="relative z-10 text-white font-black text-[8px] md:text-xs uppercase tracking-[0.4em] mb-2 md:mb-4 drop-shadow-md">
                    {currentTeamName}
                  </span>
                  <span className="relative z-10 text-white font-black text-6xl md:text-9xl leading-none tracking-tighter drop-shadow-xl">
                    {countdown}
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  key="reveal"
                  initial={{ scale: 0.8, opacity: 0, rotateY: 90 }}
                  animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                  className="w-40 h-40 md:w-64 md:h-64 rounded-[2rem] md:rounded-[3.5rem] p-4 md:p-8 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden border-4 border-white"
                  style={{ backgroundColor: currentTeamColor }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-50" />
                  <div className="relative z-10 mb-2 md:mb-5">
                    {currentSelection.photoUrl ? (
                      <img src={currentSelection.photoUrl} className="w-16 h-16 md:w-24 md:h-24 rounded-full object-cover border-4 border-white shadow-xl" />
                    ) : (
                      <div className="w-16 h-16 md:w-24 md:h-24 rounded-full bg-white/20 flex items-center justify-center border-4 border-white shadow-xl backdrop-blur-sm">
                        <User className="w-8 h-8 md:w-12 md:h-12 text-white" />
                      </div>
                    )}
                  </div>
                  <h3 className="relative z-10 text-white font-black text-lg md:text-2xl uppercase italic leading-tight text-center drop-shadow-md line-clamp-1">
                    {currentSelection.nickname || currentSelection.name}
                  </h3>
                  <p className="relative z-10 text-white/80 font-black uppercase text-[8px] md:text-[10px] tracking-[0.2em] mt-1 md:mt-2 drop-shadow-sm">
                    {currentSelection.position === 'goleiro' ? 'GOLEIRO' : 'JOGADOR'}
                  </p>
                  <div className="relative z-10 mt-3 md:mt-6 px-3 md:px-5 py-1 md:py-2 rounded-lg md:rounded-xl text-[8px] md:text-[10px] font-black uppercase tracking-widest bg-white text-primary-blue shadow-lg">
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
            className="flex flex-col gap-5 pt-4"
          >
            <div className="bg-primary-blue/5 border-2 border-dashed border-primary-blue/20 p-5 rounded-3xl">
              <p className="text-primary-blue font-black uppercase italic text-sm tracking-tight flex items-center justify-center gap-3">
                <CheckCircle2 size={18} className="text-primary-blue animate-pulse" />
                Sorteio Finalizado!
              </p>
            </div>
            <button 
              onClick={() => onConfirm(
                teamASelected.map(p => p.id), 
                teamBSelected.map(p => p.id), 
                goalkeeperA?.id || '', 
                goalkeeperB?.id || ''
              )}
              className="w-full bg-primary-blue text-white py-5 rounded-3xl font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-xl shadow-blue-100 active:scale-95"
            >
              Concluir Escalação
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};
