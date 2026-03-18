import React, { useState, useEffect } from 'react';
import { Player } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, Trophy, User } from 'lucide-react';

interface RandomSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (teamAPlayers: string[], teamBPlayers: string[], goalkeeperAId: string, goalkeeperBId: string) => void;
  players: Player[];
  locationId: string;
  playerCount: number;
}

export const RandomSelectionModal: React.FC<RandomSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  players,
  locationId,
  playerCount
}) => {
  const [step, setStep] = useState<'idle' | 'selecting' | 'finished'>('idle');
  const [teamA, setTeamA] = useState<Player[]>([]);
  const [teamB, setTeamB] = useState<Player[]>([]);
  const [goalkeeperA, setGoalkeeperA] = useState<Player | null>(null);
  const [goalkeeperB, setGoalkeeperB] = useState<Player | null>(null);
  const [currentSelection, setCurrentSelection] = useState<Player | null>(null);
  const [countdown, setCountdown] = useState(5);

  const calculateOverall = (player: Player) => {
    if (!player.overallStats) return 0;
    const { speed, stamina, strength, shooting, dribbling, passing } = player.overallStats;
    return speed + stamina + strength + shooting + dribbling + passing;
  };

  const startSelection = () => {
    setStep('selecting');
    const availablePlayers = players.filter(p => p.locationId === locationId);
    const goalkeepers = availablePlayers.filter(p => p.position === 'goleiro').sort((a, b) => calculateOverall(b) - calculateOverall(a));
    const fieldPlayers = availablePlayers.filter(p => p.position !== 'goleiro').sort((a, b) => calculateOverall(b) - calculateOverall(a));

    const selectionSequence = [...goalkeepers, ...fieldPlayers];

    let teamAIds: Player[] = [];
    let teamBIds: Player[] = [];
    let gk1: Player | null = null;
    let gk2: Player | null = null;

    let currentIndex = 0;
    let nextTeam: 'A' | 'B' = 'A';

    const selectNext = () => {
      if (currentIndex < selectionSequence.length && (teamAIds.length + (gk1 ? 1 : 0) < playerCount || teamBIds.length + (gk2 ? 1 : 0) < playerCount)) {
        const player = selectionSequence[currentIndex];
        setCurrentSelection(player);
        setCountdown(5);
        
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              
              if (player.position === 'goleiro') {
                if (!gk1) {
                  gk1 = player;
                  setGoalkeeperA(gk1);
                } else if (!gk2) {
                  gk2 = player;
                  setGoalkeeperB(gk2);
                }
              } else {
                if (nextTeam === 'A') {
                  if (teamAIds.length < playerCount) {
                    teamAIds.push(player);
                    setTeamA([...teamAIds]);
                    nextTeam = 'B';
                  } else {
                    teamBIds.push(player);
                    setTeamB([...teamBIds]);
                    nextTeam = 'A';
                  }
                } else {
                  if (teamBIds.length < playerCount) {
                    teamBIds.push(player);
                    setTeamB([...teamBIds]);
                    nextTeam = 'A';
                  } else {
                    teamAIds.push(player);
                    setTeamA([...teamAIds]);
                    nextTeam = 'B';
                  }
                }
              }
              
              currentIndex++;
              selectNext();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setStep('finished');
      }
    };

    selectNext();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose} />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-[#111] w-full max-w-lg rounded-3xl border border-white/10 p-8 text-center"
      >
        <h2 className="text-2xl font-black uppercase italic tracking-tight mb-6">Sorteio Dramático</h2>
        
        {step === 'idle' && (
          <button 
            onClick={startSelection}
            className="w-full bg-[#00ff00] text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:brightness-90"
          >
            Iniciar Sorteio
          </button>
        )}

        {step === 'selecting' && currentSelection && (
          <div className="flex flex-col items-center gap-4">
            <div className="text-6xl font-black text-[#00ff00]">{countdown}</div>
            <div className="flex flex-col items-center">
              {currentSelection.photoUrl ? (
                <img src={currentSelection.photoUrl} className="w-24 h-24 rounded-full object-cover mb-2" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mb-2">
                  <User size={48} className="text-gray-600" />
                </div>
              )}
              <p className="text-white font-black text-xl">{currentSelection.nickname || currentSelection.name}</p>
              <p className="text-gray-400 text-sm">{currentSelection.position}</p>
            </div>
          </div>
        )}

        {step === 'finished' && (
          <div className="flex flex-col gap-4">
            <p className="text-white font-bold">Times sorteados!</p>
            <button 
              onClick={() => onConfirm(
                teamA.map(p => p.id), 
                teamB.map(p => p.id), 
                goalkeeperA?.id || '', 
                goalkeeperB?.id || ''
              )}
              className="w-full bg-[#00ff00] text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:brightness-90"
            >
              Confirmar Times
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
