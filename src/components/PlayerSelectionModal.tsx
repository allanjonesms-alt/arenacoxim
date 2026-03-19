import React, { useState } from 'react';
import { Player, Team } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, ArrowRight, ArrowLeft, Users, User, Search } from 'lucide-react';
import { SoccerJersey } from './SoccerJersey';
import { RandomSelectionModal } from './RandomSelectionModal';

interface PlayerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (teamAPlayers: string[], teamBPlayers: string[], goalkeeperAId: string, goalkeeperBId: string) => void;
  players: Player[];
  teamA: Team | undefined;
  teamB: Team | undefined;
  locationId: string;
  playerCount: number;
}

export const PlayerSelectionModal: React.FC<PlayerSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  players,
  teamA,
  teamB,
  locationId,
  playerCount
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedA, setSelectedA] = useState<string[]>([]);
  const [selectedB, setSelectedB] = useState<string[]>([]);
  const [goalkeeperA, setGoalkeeperA] = useState<string>('');
  const [goalkeeperB, setGoalkeeperB] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRandomSelectionOpen, setIsRandomSelectionOpen] = useState(false);

  const availablePlayers = players.filter(p => p.locationId === locationId);

  const handleNext = () => {
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
    else if (step === 3) setStep(4);
    else onConfirm(selectedA, selectedB, goalkeeperA, goalkeeperB);
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 4) setStep(3);
  };

  const handleRandomSelectionConfirm = (teamAIds: string[], teamBIds: string[], gk1: string, gk2: string) => {
    setSelectedA(teamAIds);
    setSelectedB(teamBIds);
    setGoalkeeperA(gk1);
    setGoalkeeperB(gk2);
    setIsRandomSelectionOpen(false);
  };

  const currentTeam = (step === 1 || step === 2) ? teamA : teamB;
  const currentSelection = (step === 1 || step === 2) ? selectedA : selectedB;
  const otherSelection = (step === 1 || step === 2) ? selectedB : selectedA;
  
  // Use team-specific playerCount if available, otherwise fallback to location-based playerCount
  const requiredPerTeam = currentTeam?.playerCount || playerCount;

  const togglePlayer = (playerId: string) => {
    if (step === 1) {
      if (selectedA.includes(playerId)) {
        setSelectedA(selectedA.filter(id => id !== playerId));
        if (goalkeeperA === playerId) setGoalkeeperA('');
      } else {
        if (selectedA.length < requiredPerTeam) {
          setSelectedA([...selectedA, playerId]);
          setSelectedB(selectedB.filter(id => id !== playerId));
        }
      }
    } else if (step === 2) {
      setGoalkeeperA(playerId);
    } else if (step === 3) {
      if (selectedB.includes(playerId)) {
        setSelectedB(selectedB.filter(id => id !== playerId));
        if (goalkeeperB === playerId) setGoalkeeperB('');
      } else {
        if (selectedB.length < requiredPerTeam) {
          setSelectedB([...selectedB, playerId]);
          setSelectedA(selectedA.filter(id => id !== playerId));
        }
      }
    } else if (step === 4) {
      setGoalkeeperB(playerId);
    }
  };

  if (!isOpen) return null;

  const isGoalkeeperStep = step === 2 || step === 4;
  const currentGoalkeeper = step === 2 ? goalkeeperA : goalkeeperB;

  const filteredPlayers = isGoalkeeperStep 
    ? players.filter(p => currentSelection.includes(p.id))
    : availablePlayers.filter(p => !otherSelection.includes(p.id));

  const canProceed = isGoalkeeperStep 
    ? !!currentGoalkeeper 
    : currentSelection.length === requiredPerTeam;

  const stepTitle = step === 1 ? 'Escalar Time 1' 
                  : step === 2 ? 'Selecionar Goleiro 1'
                  : step === 3 ? 'Escalar Time 2'
                  : 'Selecionar Goleiro 2';

  const nextButtonText = step === 1 ? 'Escalar Time'
                       : step === 2 ? 'Confirmar Goleiro'
                       : step === 3 ? 'Escalar Time'
                       : 'Confirmar Partida';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose} />
      
      <RandomSelectionModal
        isOpen={isRandomSelectionOpen}
        onClose={() => setIsRandomSelectionOpen(false)}
        onConfirm={handleRandomSelectionConfirm}
        players={players}
        locationId={locationId}
        playerCount={playerCount}
        teamA={teamA}
        teamB={teamB}
      />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-[#111] w-full max-w-2xl rounded-3xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-bottom border-white/5 bg-[#1a1a1a] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-[#00ff00]/10 p-3 rounded-2xl">
              <Users className="w-6 h-6 text-[#00ff00]" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase italic tracking-tight">
                {stepTitle}
              </h3>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                Passo {step} de 4 • {step <= 2 ? 'Primeiro Time' : 'Segundo Time'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {step === 1 && (
              <button 
                onClick={() => setIsRandomSelectionOpen(true)}
                className="text-[10px] font-black uppercase tracking-widest bg-[#00ff00]/20 text-[#00ff00] px-3 py-1.5 rounded-lg hover:bg-[#00ff00]/30 transition-colors"
              >
                Sorteio
              </button>
            )}
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Team Indicator */}
        <div className="px-6 py-4 bg-black/40 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <SoccerJersey color={currentTeam?.color || '#555'} size={32} />
            <div>
              <span className="text-xs font-black text-gray-500 uppercase tracking-widest block">Escalando</span>
              <span className="text-lg font-black uppercase italic text-[#00ff00]">
                {currentTeam?.name || 'Time não definido'}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest block">
              {isGoalkeeperStep ? 'Status' : 'Selecionados'}
            </span>
            <span className="text-2xl font-black italic text-white">
              {isGoalkeeperStep ? (currentGoalkeeper ? '1/1' : '0/1') : `${currentSelection.length} / ${requiredPerTeam}`}
            </span>
          </div>
        </div>

        {/* Search Bar */}
        {!isGoalkeeperStep && (
          <div className="px-6 py-3 bg-[#1a1a1a] border-b border-white/5 relative">
            <Search className="absolute left-10 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Buscar atleta pelo nome ou apelido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-[#00ff00] transition-colors"
            />
          </div>
        )}

        {/* Player List */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredPlayers
            .filter(p => !isGoalkeeperStep ? (
              p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
              (p.nickname && p.nickname.toLowerCase().includes(searchTerm.toLowerCase()))
            ) : true)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(p => {
              const isSelected = isGoalkeeperStep ? currentGoalkeeper === p.id : currentSelection.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlayer(p.id)}
                  className={`group relative flex flex-col items-center p-4 rounded-2xl border transition-all ${
                    isSelected
                      ? 'text-white'
                      : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                  }`}
                  style={isSelected ? { 
                    backgroundColor: `${currentTeam?.color}20`, // 20 is ~12% opacity in hex
                    borderColor: currentTeam?.color,
                    color: currentTeam?.color === '#ffffff' ? '#ffffff' : currentTeam?.color 
                  } : {}}
                >
                  <div className="relative mb-3">
                    {p.photoUrl ? (
                      <img
                        src={p.photoUrl}
                        className="w-16 h-16 rounded-full border-2 object-cover transition-all"
                        style={{ borderColor: isSelected ? currentTeam?.color : 'transparent' }}
                      />
                    ) : (
                      <div 
                        className="w-16 h-16 rounded-full border-2 bg-white/5 flex items-center justify-center transition-all"
                        style={{ borderColor: isSelected ? currentTeam?.color : 'transparent' }}
                      >
                        <User size={32} className="text-gray-600" />
                      </div>
                    )}
                    {isSelected && (
                      <div 
                        className="absolute -top-1 -right-1 text-black rounded-full p-1 shadow-lg"
                        style={{ backgroundColor: currentTeam?.color }}
                      >
                        <CheckCircle2 size={12} />
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-tight text-center line-clamp-1">
                    {p.nickname || p.name}
                  </span>
                  <span className="text-[8px] font-bold text-gray-500 uppercase mt-1">
                    {p.position || 'Jogador'}
                  </span>
                </button>
              );
            })}
          {filteredPlayers.length === 0 && (
            <div className="col-span-full py-12 text-center">
              <p className="text-gray-500 font-bold italic">Nenhum atleta disponível.</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-[#1a1a1a] border-t border-white/5 flex gap-4">
          {step > 1 && (
            <button
              onClick={handleBack}
              className="flex-1 bg-white/5 text-white py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
            >
              <ArrowLeft size={18} /> Voltar
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className={`flex-[2] py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
              canProceed
                ? 'text-black hover:brightness-90'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
            style={canProceed ? { backgroundColor: currentTeam?.color } : {}}
          >
            {nextButtonText} <ArrowRight size={18} />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
