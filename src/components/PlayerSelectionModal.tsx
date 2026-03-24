import React, { useState } from 'react';
import { Player, Team, Location } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, ArrowRight, ArrowLeft, Users, User, Search, Trophy } from 'lucide-react';
import { SoccerJersey } from './SoccerJersey';
import { RandomSelectionModal } from './RandomSelectionModal';

interface PlayerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (teamAId: string, teamBId: string, teamAPlayers: string[], teamBPlayers: string[], goalkeeperAId: string, goalkeeperBId: string) => void;
  players: Player[];
  allTeams: Team[];
  allLocations: Location[];
  locationId: string;
  playerCount: number;
  initialData?: {
    teamAId: string;
    teamBId: string;
    teamAPlayers: string[];
    teamBPlayers: string[];
    goalkeeperAId: string;
    goalkeeperBId: string;
  };
}

export const PlayerSelectionModal: React.FC<PlayerSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  players,
  allTeams,
  allLocations,
  locationId,
  playerCount,
  initialData
}) => {
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(0);
  const [teamAId, setTeamAId] = useState(initialData?.teamAId || '');
  const [teamBId, setTeamBId] = useState(initialData?.teamBId || '');
  const [presentPlayers, setPresentPlayers] = useState<string[]>(
    initialData ? [...initialData.teamAPlayers, ...initialData.teamBPlayers] : []
  );
  const [divisionMode, setDivisionMode] = useState<'manual' | 'random' | null>(initialData ? 'manual' : null);
  const [selectedA, setSelectedA] = useState<string[]>(initialData?.teamAPlayers || []);
  const [selectedB, setSelectedB] = useState<string[]>(initialData?.teamBPlayers || []);
  const [goalkeeperA, setGoalkeeperA] = useState<string>(initialData?.goalkeeperAId || '');
  const [goalkeeperB, setGoalkeeperB] = useState<string>(initialData?.goalkeeperBId || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRandomSelectionOpen, setIsRandomSelectionOpen] = useState(false);

  // Reset state when modal opens/closes or initialData changes
  React.useEffect(() => {
    if (isOpen) {
      setStep(0);
      setTeamAId(initialData?.teamAId || '');
      setTeamBId(initialData?.teamBId || '');
      setPresentPlayers(initialData ? [...initialData.teamAPlayers, ...initialData.teamBPlayers] : []);
      setDivisionMode(initialData ? 'manual' : null);
      setSelectedA(initialData?.teamAPlayers || []);
      setSelectedB(initialData?.teamBPlayers || []);
      setGoalkeeperA(initialData?.goalkeeperAId || '');
      setGoalkeeperB(initialData?.goalkeeperBId || '');
      setSearchTerm('');
    }
  }, [isOpen, initialData]);

  const availablePlayers = players.filter(p => p.locationId === locationId);
  const teamsInLocation = allTeams.filter(t => {
    const selectedLoc = allLocations.find(l => l.id === locationId);
    return t.locationId === locationId || (selectedLoc && t.locationId === selectedLoc.name);
  });

  const teamA = allTeams.find(t => t.id === teamAId);
  const teamB = allTeams.find(t => t.id === teamBId);

  const handleNext = () => {
    if (step === 0) {
      if (teamAId && teamBId && teamAId !== teamBId) setStep(1);
    } else if (step === 1) {
      if (presentPlayers.length > 0) setStep(2);
    } else if (step === 2) {
      if (divisionMode === 'manual') setStep(3);
      else if (divisionMode === 'random') setIsRandomSelectionOpen(true);
    } else if (step === 3) setStep(4);
    else if (step === 4) setStep(5);
    else if (step === 5) setStep(6);
    else onConfirm(teamAId, teamBId, selectedA, selectedB, goalkeeperA, goalkeeperB);
  };

  const handleBack = () => {
    if (step === 1) setStep(0);
    else if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 4) setStep(3);
    else if (step === 5) setStep(4);
    else if (step === 6) setStep(5);
  };

  const handleRandomSelectionConfirm = (teamAIds: string[], teamBIds: string[], gk1: string, gk2: string) => {
    onConfirm(teamAId, teamBId, teamAIds, teamBIds, gk1, gk2);
    setIsRandomSelectionOpen(false);
  };

  const currentTeam = (step === 3 || step === 4) ? teamA : teamB;
  const currentSelection = (step === 3 || step === 4) ? selectedA : selectedB;
  const otherSelection = (step === 3 || step === 4) ? selectedB : selectedA;
  
  // Use team-specific playerCount if available, otherwise fallback to location-based playerCount
  const requiredPerTeam = currentTeam?.playerCount || playerCount;

  const togglePlayer = (playerId: string) => {
    if (step === 1) {
      if (presentPlayers.includes(playerId)) {
        setPresentPlayers(presentPlayers.filter(id => id !== playerId));
      } else {
        setPresentPlayers([...presentPlayers, playerId]);
      }
    } else if (step === 3) {
      if (selectedA.includes(playerId)) {
        setSelectedA(selectedA.filter(id => id !== playerId));
        if (goalkeeperA === playerId) setGoalkeeperA('');
      } else {
        if (selectedA.length < requiredPerTeam) {
          setSelectedA([...selectedA, playerId]);
          setSelectedB(selectedB.filter(id => id !== playerId));
        }
      }
    } else if (step === 4) {
      setGoalkeeperA(playerId);
    } else if (step === 5) {
      if (selectedB.includes(playerId)) {
        setSelectedB(selectedB.filter(id => id !== playerId));
        if (goalkeeperB === playerId) setGoalkeeperB('');
      } else {
        if (selectedB.length < requiredPerTeam) {
          setSelectedB([...selectedB, playerId]);
          setSelectedA(selectedA.filter(id => id !== playerId));
        }
      }
    } else if (step === 6) {
      setGoalkeeperB(playerId);
    }
  };

  if (!isOpen) return null;

  const isGoalkeeperStep = step === 4 || step === 6;
  const currentGoalkeeper = step === 4 ? goalkeeperA : goalkeeperB;

  const filteredPlayers = step === 1
    ? availablePlayers
    : isGoalkeeperStep 
      ? players.filter(p => currentSelection.includes(p.id))
      : players.filter(p => presentPlayers.includes(p.id) && !otherSelection.includes(p.id));

  const canProceed = step === 0
    ? !!teamAId && !!teamBId && teamAId !== teamBId
    : step === 1
      ? presentPlayers.length >= 2
      : step === 2
        ? !!divisionMode
        : isGoalkeeperStep 
          ? !!currentGoalkeeper 
          : currentSelection.length === requiredPerTeam;

  const stepTitle = step === 0 ? 'Selecionar Times'
                  : step === 1 ? 'Quem vai jogar hoje?'
                  : step === 2 ? 'Divisão de Times'
                  : step === 3 ? 'Escalar Time 1' 
                  : step === 4 ? 'Selecionar Goleiro 1'
                  : step === 5 ? 'Escalar Time 2'
                  : 'Selecionar Goleiro 2';

  const nextButtonText = step === 0 ? 'Confirmar Times'
                       : step === 1 ? 'Confirmar Presença'
                       : step === 2 ? (divisionMode === 'random' ? 'Iniciar Sorteio' : 'Próximo')
                       : step === 3 ? 'Escalar Time'
                       : step === 4 ? 'Confirmar Goleiro'
                       : step === 5 ? 'Escalar Time'
                       : 'Confirmar Partida';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose} />
      
      <RandomSelectionModal
        isOpen={isRandomSelectionOpen}
        onClose={() => setIsRandomSelectionOpen(false)}
        onConfirm={handleRandomSelectionConfirm}
        players={players.filter(p => presentPlayers.includes(p.id))}
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
                {step === 0 ? 'Passo 1: Times' : step === 1 ? 'Passo 2: Presença' : step === 2 ? 'Passo 3: Modo' : `Passo ${step + 1} de 7 • ${step <= 4 ? 'Primeiro Time' : 'Segundo Time'}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Team Selection Step */}
        {step === 0 && (
          <div className="flex-1 p-8 space-y-8 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest block">Time A</label>
                <div className="grid grid-cols-1 gap-2">
                  {teamsInLocation.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTeamAId(t.id)}
                      className={`p-4 rounded-2xl border transition-all flex items-center gap-4 ${
                        teamAId === t.id ? 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00]' : 'bg-white/5 border-white/5 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      <SoccerJersey color={t.color} size={24} />
                      <span className="font-black uppercase italic tracking-tight">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest block">Time B</label>
                <div className="grid grid-cols-1 gap-2">
                  {teamsInLocation.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTeamBId(t.id)}
                      className={`p-4 rounded-2xl border transition-all flex items-center gap-4 ${
                        teamBId === t.id ? 'bg-blue-500/10 border-blue-500 text-blue-500' : 'bg-white/5 border-white/5 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      <SoccerJersey color={t.color} size={24} />
                      <span className="font-black uppercase italic tracking-tight">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Team Indicator (only for manual steps) */}
        {step >= 3 && (
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
        )}

        {/* Division Mode Selection */}
        {step === 2 && (
          <div className="flex-1 p-8 flex flex-col items-center justify-center gap-6">
            <div className="text-center mb-4">
              <p className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-2">Atletas Confirmados</p>
              <div className="text-4xl font-black text-[#00ff00] italic">{presentPlayers.length}</div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
              <button
                onClick={() => setDivisionMode('manual')}
                className={`p-8 rounded-3xl border-2 transition-all flex flex-col items-center gap-4 ${
                  divisionMode === 'manual' 
                    ? 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00]' 
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                }`}
              >
                <Users size={48} />
                <span className="font-black uppercase italic tracking-tight">Manual</span>
              </button>
              
              <button
                onClick={() => setDivisionMode('random')}
                className={`p-8 rounded-3xl border-2 transition-all flex flex-col items-center gap-4 ${
                  divisionMode === 'random' 
                    ? 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00]' 
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                }`}
              >
                <Trophy size={48} />
                <span className="font-black uppercase italic tracking-tight">Sorteio</span>
              </button>
            </div>
          </div>
        )}

        {/* Search Bar (only for selection steps) */}
        {(step === 1 || (step >= 3 && !isGoalkeeperStep)) && (
          <div className="px-6 py-3 bg-[#1a1a1a] border-b border-white/5 relative">
            <Search className="absolute left-10 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input 
              type="text" 
              placeholder={step === 1 ? "Buscar atleta para confirmar presença..." : "Buscar atleta selecionado..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-[#00ff00] transition-colors"
            />
          </div>
        )}

        {/* Player List (only for selection steps) */}
        {(step === 1 || step >= 3) && (
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredPlayers
              .filter(p => (step === 1 || !isGoalkeeperStep) ? (
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                (p.nickname && p.nickname.toLowerCase().includes(searchTerm.toLowerCase()))
              ) : true)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(p => {
                const isSelected = step === 1 
                  ? presentPlayers.includes(p.id)
                  : isGoalkeeperStep ? currentGoalkeeper === p.id : currentSelection.includes(p.id);
                
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
                      backgroundColor: step === 1 ? '#00ff0020' : `${currentTeam?.color}20`,
                      borderColor: step === 1 ? '#00ff00' : currentTeam?.color,
                      color: step === 1 ? '#00ff00' : (currentTeam?.color === '#ffffff' ? '#ffffff' : currentTeam?.color)
                    } : {}}
                  >
                    <div className="relative mb-3">
                      {p.photoUrl ? (
                        <img
                          src={p.photoUrl}
                          className="w-16 h-16 rounded-full border-2 object-cover transition-all"
                          style={{ borderColor: isSelected ? (step === 1 ? '#00ff00' : currentTeam?.color) : 'transparent' }}
                        />
                      ) : (
                        <div 
                          className="w-16 h-16 rounded-full border-2 bg-white/5 flex items-center justify-center transition-all"
                          style={{ borderColor: isSelected ? (step === 1 ? '#00ff00' : currentTeam?.color) : 'transparent' }}
                        >
                          <User size={32} className="text-gray-600" />
                        </div>
                      )}
                      {isSelected && (
                        <div 
                          className="absolute -top-1 -right-1 text-black rounded-full p-1 shadow-lg"
                          style={{ backgroundColor: step === 1 ? '#00ff00' : currentTeam?.color }}
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
        )}

        {/* Footer Actions */}
        <div className="p-6 bg-[#1a1a1a] border-t border-white/5 flex gap-4">
          {step > 0 && (
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
            style={canProceed ? { backgroundColor: step === 0 ? '#00ff00' : currentTeam?.color } : {}}
          >
            {nextButtonText} <ArrowRight size={18} />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
