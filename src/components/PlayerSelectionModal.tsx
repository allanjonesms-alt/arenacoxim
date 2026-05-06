import React, { useState } from 'react';
import { Player, Team, Location } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, ArrowRight, ArrowLeft, Users, User, Search, Trophy } from 'lucide-react';
import { SoccerJersey } from './SoccerJersey';
import { RandomSelectionModal } from './RandomSelectionModal';

interface PlayerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (teamAId: string, teamBId: string, teamAPlayers: string[], teamBPlayers: string[], goalkeeperAId: string, goalkeeperBId: string, confirmedPlayers: string[], substitutesCount: number) => void;
  onSaveDraft?: (teamAId: string, teamBId: string, teamAPlayers: string[], teamBPlayers: string[], goalkeeperAId: string, goalkeeperBId: string, confirmedPlayers: string[], substitutesCount: number) => void;
  players: Player[];
  allTeams: Team[];
  allLocations: Location[];
  locationId: string;
  playerCount: number;
  initialStep?: number;
  initialDivisionMode?: 'manual' | 'random' | null;
  initialData?: {
    teamAId: string;
    teamBId: string;
    teamAPlayers: string[];
    teamBPlayers: string[];
    goalkeeperAId: string;
    goalkeeperBId: string;
    confirmedPlayers?: string[];
    substitutesCount?: number;
  };
}

export const PlayerSelectionModal: React.FC<PlayerSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onSaveDraft,
  players,
  allTeams,
  allLocations,
  locationId,
  playerCount,
  initialStep = 0,
  initialDivisionMode = null,
  initialData
}) => {
  const [step, setStep] = useState<number>(initialStep);
  const [teamAId, setTeamAId] = useState(initialData?.teamAId || '');
  const [teamBId, setTeamBId] = useState(initialData?.teamBId || '');
  const [presentPlayers, setPresentPlayers] = useState<string[]>(
    initialData?.confirmedPlayers || (initialData ? [...initialData.teamAPlayers, ...initialData.teamBPlayers] : [])
  );
  const [matchSubstitutesCount, setMatchSubstitutesCount] = useState<number>(initialData?.substitutesCount || 0);
  const [divisionMode, setDivisionMode] = useState<'manual' | 'random' | null>(initialDivisionMode || (initialData?.teamAPlayers.length ? 'manual' : null));
  const [selectedA, setSelectedA] = useState<string[]>(initialData?.teamAPlayers || []);
  const [selectedB, setSelectedB] = useState<string[]>(initialData?.teamBPlayers || []);
  const [goalkeeperA, setGoalkeeperA] = useState<string>(initialData?.goalkeeperAId || '');
  const [goalkeeperB, setGoalkeeperB] = useState<string>(initialData?.goalkeeperBId || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRandomSelectionOpen, setIsRandomSelectionOpen] = useState(false);

  // Reset state when modal opens/closes or initialData changes
  React.useEffect(() => {
    if (isOpen) {
      setStep(initialStep);
      setTeamAId(initialData?.teamAId || '');
      setTeamBId(initialData?.teamBId || '');
      setPresentPlayers(initialData?.confirmedPlayers || (initialData ? [...initialData.teamAPlayers, ...initialData.teamBPlayers] : []));
      setMatchSubstitutesCount(initialData?.substitutesCount || 0);
      setDivisionMode(initialDivisionMode || (initialData?.teamAPlayers.length ? 'manual' : null));
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
      if (teamAId && teamBId && teamAId !== teamBId) {
        // Se já temos a presença e suplentes (vindos do wizard de criação), pula para a divisão (Passo 3)
        if (initialStep === 0 && presentPlayers.length > 0) {
          setStep(3);
        } else {
          setStep(1);
        }
      }
    } else if (step === 1) {
      if (presentPlayers.length > 0) setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      if (divisionMode === 'manual') setStep(4);
      else if (divisionMode === 'random') setIsRandomSelectionOpen(true);
    } else if (step === 4) setStep(5);
    else if (step === 5) setStep(6);
    else if (step === 6) setStep(7);
    else onConfirm(teamAId, teamBId, selectedA, selectedB, goalkeeperA, goalkeeperB, presentPlayers, matchSubstitutesCount);
  };

  const handleBack = () => {
    if (step === 1) setStep(0);
    else if (step === 2) setStep(1);
    else if (step === 3) {
      // Se pulamos a presença e suplentes na vinda, pula na volta também
      if (initialStep === 0 && (initialData?.confirmedPlayers?.length || 0) > 0) {
        setStep(0);
      } else {
        setStep(2);
      }
    }
    else if (step === 4) setStep(3);
    else if (step === 5) setStep(4);
    else if (step === 6) setStep(5);
    else if (step === 7) setStep(6);
  };

  const handleRandomSelectionConfirm = (teamAIds: string[], teamBIds: string[], gk1: string, gk2: string) => {
    onConfirm(teamAId, teamBId, teamAIds, teamBIds, gk1, gk2, presentPlayers, matchSubstitutesCount);
    setIsRandomSelectionOpen(false);
  };

  const currentTeam = (step === 4 || step === 5) ? teamA : teamB;
  const currentSelection = (step === 4 || step === 5) ? selectedA : selectedB;
  const otherSelection = (step === 4 || step === 5) ? selectedB : selectedA;
  
  // Use team-specific playerCount if available, otherwise fallback to location-based playerCount
  const requiredPerTeam = (currentTeam?.playerCount || playerCount) + matchSubstitutesCount;

  const togglePlayer = (playerId: string) => {
    if (step === 1) {
      if (presentPlayers.includes(playerId)) {
        setPresentPlayers(presentPlayers.filter(id => id !== playerId));
      } else {
        setPresentPlayers([...presentPlayers, playerId]);
      }
    } else if (step === 4) {
      if (selectedA.includes(playerId)) {
        setSelectedA(selectedA.filter(id => id !== playerId));
        if (goalkeeperA === playerId) setGoalkeeperA('');
      } else {
        if (selectedA.length < requiredPerTeam) {
          setSelectedA([...selectedA, playerId]);
          setSelectedB(selectedB.filter(id => id !== playerId));
          // Auto-add to present (confirmed) players if not there
          if (divisionMode === 'manual' && !presentPlayers.includes(playerId)) {
            setPresentPlayers([...presentPlayers, playerId]);
          }
        }
      }
    } else if (step === 5) {
      setGoalkeeperA(playerId);
    } else if (step === 6) {
      if (selectedB.includes(playerId)) {
        setSelectedB(selectedB.filter(id => id !== playerId));
        if (goalkeeperB === playerId) setGoalkeeperB('');
      } else {
        if (selectedB.length < requiredPerTeam) {
          setSelectedB([...selectedB, playerId]);
          setSelectedA(selectedA.filter(id => id !== playerId));
          // Auto-add to present (confirmed) players if not there
          if (divisionMode === 'manual' && !presentPlayers.includes(playerId)) {
            setPresentPlayers([...presentPlayers, playerId]);
          }
        }
      }
    } else if (step === 7) {
      setGoalkeeperB(playerId);
    }
  };

  if (!isOpen) return null;

  const isGoalkeeperStep = step === 5 || step === 7;
  const currentGoalkeeper = step === 5 ? goalkeeperA : goalkeeperB;

  const filteredPlayers = step === 1
    ? availablePlayers
    : isGoalkeeperStep 
      ? players.filter(p => currentSelection.includes(p.id))
      : divisionMode === 'manual' 
        ? availablePlayers.filter(p => !otherSelection.includes(p.id))
        : players.filter(p => presentPlayers.includes(p.id) && !otherSelection.includes(p.id));

  const visiblePlayers = filteredPlayers
    .filter(p => (step === 1 || !isGoalkeeperStep) ? (
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (p.nickname && p.nickname.toLowerCase().includes(searchTerm.toLowerCase()))
    ) : true)
    .sort((a, b) => a.name.localeCompare(b.name));

  const canProceed = step === 0
    ? !!teamAId && !!teamBId && teamAId !== teamBId
    : step === 1
      ? presentPlayers.length >= 2
      : step === 2
        ? true
      : step === 3
        ? !!divisionMode
        : isGoalkeeperStep 
          ? !!currentGoalkeeper 
          : currentSelection.length > 0;

  const stepTitle = step === 0 ? 'Selecionar Times'
                  : step === 1 ? 'Quem vai jogar hoje?'
                  : step === 2 ? 'Configurar Suplentes'
                  : step === 3 ? 'Divisão de Times'
                  : step === 4 ? 'Escalar Time 1' 
                  : step === 5 ? 'Selecionar Goleiro 1'
                  : step === 6 ? 'Escalar Time 2'
                  : 'Selecionar Goleiro 2';

  const nextButtonText = step === 0 ? 'Confirmar Times'
                       : step === 1 ? 'Confirmar Presença'
                       : step === 2 ? 'Confirmar Suplentes'
                       : step === 3 ? (divisionMode === 'random' ? 'Iniciar Sorteio' : 'Próximo')
                       : step === 4 ? 'Escalar Time'
                       : step === 5 ? 'Confirmar Goleiro'
                       : step === 6 ? 'Escalar Time'
                       : 'Confirmar Partida';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-md" 
      />
      
      <RandomSelectionModal
        isOpen={isRandomSelectionOpen}
        onClose={() => setIsRandomSelectionOpen(false)}
        onConfirm={handleRandomSelectionConfirm}
        players={players.filter(p => presentPlayers.includes(p.id))}
        locationId={locationId}
        playerCount={requiredPerTeam}
        teamA={teamA}
        teamB={teamB}
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative bg-white w-full max-w-2xl rounded-2xl md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
      >
        {/* Header */}
        <div className="p-5 md:p-8 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-5">
            <div className="bg-primary-blue/5 p-3 md:p-4 rounded-xl md:rounded-2xl border border-primary-blue/10">
              <Users className="w-5 h-5 md:w-6 md:h-6 text-primary-blue" />
            </div>
            <div>
              <h3 className="text-lg md:text-2xl font-black uppercase italic tracking-tighter text-primary-blue leading-tight">
                {stepTitle}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[8px] md:text-[10px] font-black text-primary-yellow uppercase tracking-widest bg-primary-blue px-2 py-0.5 md:px-3 md:py-1 rounded-md md:rounded-lg">
                  {step === 0 ? 'Equipes' : step === 1 ? 'Presença' : step === 2 ? 'Reservas' : step === 3 ? 'Escalamento' : `Etapa ${step + 1}`}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            {step === 1 && (
              <div className="flex flex-col items-end">
                <span className="text-[8px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Confirmados</span>
                <span className="text-xl md:text-2xl font-black text-primary-blue italic leading-none">{presentPlayers.length}</span>
              </div>
            )}
            <button onClick={onClose} className="bg-gray-100 hover:bg-gray-200 p-2 md:p-3 rounded-full transition-all active:scale-95 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>
        </div>

        {/* Team Selection Step */}
        {step === 0 && (
          <div className="flex-1 p-5 md:p-10 space-y-6 md:space-y-10 overflow-y-auto bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
              <div className="space-y-4 md:space-y-5">
                <label className="text-[10px] md:text-[11px] uppercase font-black text-primary-blue tracking-[0.2em] block px-2 opacity-50 italic">Mandante</label>
                <div className="grid grid-cols-1 gap-2 md:gap-3">
                  {teamsInLocation.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTeamAId(t.id)}
                      className={`p-4 md:p-5 rounded-xl md:rounded-2xl border-2 transition-all flex items-center gap-3 md:gap-4 group ${
                        teamAId === t.id 
                          ? 'bg-blue-50/50 border-primary-blue text-primary-blue shadow-lg shadow-blue-100/50' 
                          : 'bg-gray-50 border-gray-100 text-gray-400 hover:border-blue-200 hover:bg-white'
                      }`}
                    >
                      < SoccerJersey color={t.color} size={24} />
                      <span className="font-black uppercase italic tracking-tight text-base md:text-lg truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4 md:space-y-5">
                <label className="text-[10px] md:text-[11px] uppercase font-black text-primary-blue tracking-[0.2em] block px-2 opacity-50 italic">Visitante</label>
                <div className="grid grid-cols-1 gap-2 md:gap-3">
                  {teamsInLocation.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTeamBId(t.id)}
                      className={`p-4 md:p-5 rounded-xl md:rounded-2xl border-2 transition-all flex items-center gap-3 md:gap-4 group ${
                        teamBId === t.id 
                          ? 'bg-yellow-50/50 border-primary-yellow text-primary-blue shadow-lg shadow-yellow-100/50' 
                          : 'bg-gray-50 border-gray-100 text-gray-400 hover:border-yellow-200 hover:bg-white'
                      }`}
                    >
                      <SoccerJersey color={t.color} size={24} />
                      <span className="font-black uppercase italic tracking-tight text-base md:text-lg truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Team Indicator (only for manual steps) */}
        {step >= 4 && (
          <div className="px-5 md:px-10 py-4 md:py-6 bg-gray-50 flex items-center justify-between border-b border-gray-100 shadow-inner">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="p-2 md:p-3 bg-white rounded-xl md:rounded-2xl shadow-sm border border-gray-100">
                <SoccerJersey color={currentTeam?.color || '#555'} size={28} />
              </div>
              <div>
                <span className="text-[8px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Escalando o time</span>
                <span className="text-base md:text-xl font-black uppercase italic text-primary-blue leading-tight truncate block max-w-[120px] md:max-w-none">
                  {currentTeam?.name || 'Não selecionado'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[8px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">
                {isGoalkeeperStep ? 'Proteção' : 'Plantel'}
              </span>
              <span className="text-lg md:text-2xl font-black italic text-primary-blue tabular-nums">
                {isGoalkeeperStep ? (currentGoalkeeper ? '1/1' : '0/1') : `${currentSelection.length} / ${requiredPerTeam}`}
              </span>
            </div>
          </div>
        )}

        {/* Substitutes Step */}
        {step === 2 && (
          <div className="flex-1 p-10 flex flex-col items-center justify-center gap-10 bg-white">
            <div className="text-center max-w-xs">
              <h3 className="text-3xl font-black uppercase italic tracking-tighter text-primary-blue mb-3">Reservas</h3>
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest leading-relaxed">Defina se haverá atletas de suplência para cada equipe hoje.</p>
            </div>

            <div className="p-10 bg-gray-50 rounded-[2.5rem] border border-gray-100 w-full max-w-sm space-y-10 shadow-xl shadow-gray-100/50">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-black uppercase italic tracking-tight text-primary-blue">Suplência</h4>
                  <p className="text-[10px] text-primary-yellow font-black uppercase tracking-widest mt-1">Habilitar reservas</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newValue = matchSubstitutesCount > 0 ? 0 : 1;
                    setMatchSubstitutesCount(newValue);
                  }}
                  className={`w-16 h-9 rounded-full transition-all relative ${matchSubstitutesCount > 0 ? 'bg-primary-blue' : 'bg-gray-200'}`}
                >
                  <motion.div 
                    className={`absolute top-1.5 w-6 h-6 rounded-full bg-white shadow-md`}
                    animate={{ left: matchSubstitutesCount > 0 ? 'calc(100% - 30px)' : '6px' }}
                  />
                </button>
              </div>

              {matchSubstitutesCount > 0 && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="pt-10 border-t border-gray-200 space-y-8"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest italic">Qtd por equipe</label>
                    <span className="text-5xl font-black italic text-primary-blue tabular-nums">{matchSubstitutesCount}</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    value={matchSubstitutesCount}
                    onChange={(e) => setMatchSubstitutesCount(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-blue"
                  />
                  <div className="p-4 bg-primary-blue/5 rounded-2xl border border-primary-blue/10 flex items-center justify-center gap-3">
                    <Users size={14} className="text-primary-blue opacity-30" />
                    <p className="text-[11px] text-primary-blue font-black uppercase">
                      Total de <span className="text-primary-blue px-2 py-0.5 bg-primary-yellow rounded-lg">{(allLocations.find(l => l.id === locationId)?.playerCount || 5) + matchSubstitutesCount}</span> atletas por time
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        )}

        {/* Division Mode Selection */}
        {step === 3 && (
          <div className="flex-1 p-4 md:p-10 flex flex-col items-center justify-center gap-8 bg-white">
            <div className="text-center mb-4">
              <p className="text-gray-400 font-black uppercase tracking-[0.2em] text-[10px] mb-2 opacity-50">Atletas à Disposição</p>
              <div className="text-6xl font-black text-primary-blue italic tabular-nums group">
                {presentPlayers.length}
                <div className="w-12 h-1.5 bg-primary-yellow mx-auto mt-2 rounded-full transition-all group-hover:w-24" />
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-lg">
              <button
                onClick={() => setDivisionMode('manual')}
                className={`p-8 md:p-12 rounded-[2.5rem] border-4 transition-all flex flex-col items-center gap-5 group relative overflow-hidden ${
                  divisionMode === 'manual' 
                    ? 'bg-blue-50/50 border-primary-blue text-primary-blue shadow-2xl shadow-blue-100' 
                    : 'bg-gray-50 border-gray-100 text-gray-400 hover:border-blue-100 hover:bg-white'
                }`}
              >
                <Users size={48} className="md:w-16 md:h-16 transition-transform group-hover:scale-110" />
                <span className="font-black uppercase italic tracking-tighter text-lg md:text-xl">Manual</span>
                <span className="text-[10px] font-black opacity-40 uppercase tracking-widest">Escalação Livre</span>
              </button>
              
              <button
                onClick={() => setDivisionMode('random')}
                className={`p-8 md:p-12 rounded-[2.5rem] border-4 transition-all flex flex-col items-center gap-5 group relative overflow-hidden ${
                  divisionMode === 'random' 
                    ? 'bg-yellow-50/50 border-primary-yellow text-primary-blue shadow-2xl shadow-yellow-100' 
                    : 'bg-gray-50 border-gray-100 text-gray-400 hover:border-yellow-100 hover:bg-white'
                }`}
              >
                <Trophy size={48} className="md:w-16 md:h-16 transition-transform group-hover:scale-110" />
                <span className="font-black uppercase italic tracking-tighter text-lg md:text-xl">Sorteio</span>
                <span className="text-[10px] font-black opacity-40 uppercase tracking-widest">Equilíbrio Automático</span>
              </button>
            </div>
          </div>
        )}

        {/* Search Bar (only for selection steps) */}
        {(step === 1 || (step >= 4 && !isGoalkeeperStep)) && (
          <div className="px-5 md:px-10 py-4 md:py-5 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row gap-3 md:gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-5 md:left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-blue transition-colors w-4 h-4 md:w-5 md:h-5" />
              <input 
                type="text" 
                placeholder={step === 1 ? "Localizar atleta..." : "Filtrar por nome..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border-2 border-gray-100 rounded-xl md:rounded-2xl py-3 md:py-4 pl-12 md:pl-14 pr-4 md:pr-6 text-xs md:text-sm focus:outline-none focus:border-primary-blue transition-all text-primary-blue font-bold placeholder:text-gray-300 shadow-sm"
              />
            </div>
            {(step === 1 || step === 4 || step === 6) && (
              <button
                onClick={() => {
                  const visibleIds = visiblePlayers.map(p => p.id);
                  const currentList = step === 1 ? presentPlayers : (step === 4 ? selectedA : selectedB);
                  const setList = step === 1 ? setPresentPlayers : (step === 4 ? setSelectedA : setSelectedB);
                  
                  const allVisibleSelected = visibleIds.every(id => currentList.includes(id));
                  
                  if (allVisibleSelected) {
                    setList(currentList.filter(id => !visibleIds.includes(id)));
                  } else {
                    const newList = [...new Set([...currentList, ...visibleIds])];
                    if (step === 4 || step === 6) {
                      const otherSetList = step === 4 ? setSelectedB : setSelectedA;
                      const otherList = step === 4 ? selectedB : selectedA;
                      otherSetList(otherList.filter(id => !visibleIds.includes(id)));
                    }
                    setList(newList);
                  }
                }}
                className="bg-white hover:bg-gray-50 text-primary-blue px-4 md:px-6 py-3 md:py-4 rounded-xl md:rounded-2xl text-[9px] md:text-[11px] font-black uppercase tracking-widest transition-all border-2 border-gray-100 hover:border-primary-blue shadow-sm"
              >
                {visiblePlayers.every(p => (step === 1 ? presentPlayers : (step === 4 ? selectedA : selectedB)).includes(p.id)) 
                  ? 'Limpar' 
                  : 'Marcar Todos'}
              </button>
            )}
          </div>
        )}

        {/* Player List (only for selection steps) */}
        {(step === 1 || step >= 4) && (
          <div className="flex-1 overflow-y-auto p-4 md:p-10 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 bg-gray-50/30">
            {visiblePlayers.map(p => {
                const isSelected = step === 1 
                  ? presentPlayers.includes(p.id)
                  : isGoalkeeperStep ? currentGoalkeeper === p.id : currentSelection.includes(p.id);
                
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlayer(p.id)}
                    className={`group relative flex flex-col items-center p-3 md:p-6 rounded-2xl md:rounded-3xl border-2 transition-all shadow-sm ${
                      isSelected
                        ? 'bg-white shadow-xl'
                        : 'bg-white/50 border-transparent text-gray-400 hover:bg-white hover:border-gray-200'
                    }`}
                    style={isSelected ? { 
                      borderColor: step === 1 ? '#eab308' : (currentTeam?.color || '#3b82f6')
                    } : {}}
                  >
                    <div className="relative mb-3 md:mb-5">
                      {p.photoUrl ? (
                        <div className="relative p-0.5 md:p-1 rounded-full border-2 border-dashed border-gray-200 group-hover:border-primary-blue transition-colors">
                          <img
                            src={p.photoUrl}
                            className="w-12 h-12 md:w-20 md:h-20 rounded-full object-cover shadow-lg"
                          />
                        </div>
                      ) : (
                        <div 
                          className="w-12 h-12 md:w-20 md:h-20 rounded-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-200 group-hover:border-primary-blue transition-all"
                        >
                          <User className="w-6 h-6 md:w-9 md:h-9 text-gray-300" />
                        </div>
                      )}
                      {isSelected && (
                        <div 
                          className="absolute -top-1 -right-1 md:-top-2 md:-right-2 text-white rounded-full p-1.5 md:p-2 shadow-xl border-2 border-white scale-100 md:scale-110"
                          style={{ backgroundColor: step === 1 ? '#eab308' : (currentTeam?.color || '#3b82f6') }}
                        >
                          <CheckCircle2 className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] md:text-xs font-black uppercase italic tracking-tight text-center line-clamp-1 text-primary-blue">
                      {p.nickname || p.name}
                    </span>
                    <span className="text-[8px] md:text-[9px] font-bold text-gray-400 uppercase mt-1 md:mt-1.5 tracking-widest">
                      {p.position || 'Jogador'}
                    </span>
                  </button>
                );
              })}
            {filteredPlayers.length === 0 && (
              <div className="col-span-full py-20 text-center flex flex-col items-center opacity-30">
                <Users size={48} className="text-gray-400 mb-4" />
                <p className="text-gray-400 font-black uppercase tracking-[0.3em] italic">Lista Vazia</p>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-5 md:p-10 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-3 md:gap-5 shadow-inner">
          <div className="flex-[2] flex gap-3 md:gap-5 w-full sm:w-auto order-2 sm:order-1">
            {step > 0 && (
              <button
                onClick={handleBack}
                className="flex-1 bg-white text-gray-400 border-2 border-gray-100 py-3 md:py-5 rounded-xl md:rounded-3xl font-black uppercase tracking-widest flex items-center justify-center gap-2 md:gap-3 hover:bg-gray-50 transition-all active:scale-95 text-[10px] md:text-sm shadow-sm"
              >
                <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" /> Voltar
              </button>
            )}
            {onSaveDraft && (
              <button
                onClick={() => onSaveDraft(teamAId, teamBId, selectedA, selectedB, goalkeeperA, goalkeeperB, presentPlayers, matchSubstitutesCount)}
                className="flex-1 bg-white text-primary-yellow border-2 border-gray-100 py-3 md:py-5 rounded-xl md:rounded-3xl font-black uppercase tracking-widest hover:bg-yellow-50 hover:border-primary-yellow/30 transition-all active:scale-95 text-[10px] md:text-sm shadow-sm"
              >
                Draft
              </button>
            )}
          </div>
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className={`flex-[3] py-4 md:py-5 rounded-xl md:rounded-3xl font-black uppercase tracking-widest flex items-center justify-center gap-2 md:gap-3 transition-all order-1 sm:order-2 w-full sm:w-auto shadow-xl active:scale-95 text-xs md:text-base ${
              canProceed
                ? 'text-white hover:brightness-110 shadow-blue-200'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
            }`}
            style={canProceed ? { 
                backgroundColor: step === 0 ? '#3b82f6' : (currentTeam?.color || '#3b82f6'),
                color: (currentTeam?.color === '#ffffff' ? '#1e3a8a' : '#ffffff')
            } : {}}
          >
            <span className="truncate">{nextButtonText}</span> <ArrowRight className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
