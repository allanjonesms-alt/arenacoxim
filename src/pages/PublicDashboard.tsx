import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, writeBatch, getDoc, where, limit, getDocs } from 'firebase/firestore';
import { Player, Match, Location, Team, AdminData, ScoringRules, Card, MonthlyAward } from '../types';
import { getPositionAbbr, getPositionColor, getPlayerFinalOverall } from '../utils/playerUtils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Trophy, Star, MapPin, Calendar as CalendarIcon, ChevronRight, TrendingUp, User, X, Goal, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SoccerJersey } from '../components/SoccerJersey';
import { SoccerBall, SoccerCleat } from '../components/Icons';
import { SoccerPitch } from '../components/SoccerPitch';
import { handleFirestoreError, OperationType } from '../App';
import { calculateMatchPoints } from '../utils/scoringEngine';
import { calculateGrade } from '../utils/gradeUtils';
import { PlayerSummaryModal } from '../components/PlayerSummaryModal';
import { useNavigate, Link } from 'react-router-dom';

interface PublicDashboardProps {
  adminData?: AdminData | null;
  sharedLocations: Location[];
  sharedTeams: Team[];
  sharedScoringRules: ScoringRules | null;
  isCompact?: boolean;
  bottomMainContent?: React.ReactNode;
  sharedPlayers?: Player[];
  sharedCards?: Card[];
}

function MatchDetailsModal({ match, players, teams, locations, cards, isAdmin, onClose, onPlayerClick }: { 
  match: Match, 
  players: Player[], 
  teams: Team[],
  locations: Location[],
  cards: Card[],
  isAdmin: boolean,
  onClose: () => void,
  onPlayerClick?: (player: Player) => void
}) {
  // Substitutions management state
  const [teamA, setTeamA] = useState(match.teamA || []);
  const [teamB, setTeamB] = useState(match.teamB || []);
  const [substitutesA, setSubstitutesA] = useState(match.substitutesA || []);
  const [substitutesB, setSubstitutesB] = useState(match.substitutesB || []);
  const [isEditingLineup, setIsEditingLineup] = useState(false);
  const [activeTab, setActiveTab] = useState<'events' | 'pitch'>('events');

  const [events, setEvents] = useState(match.events || []);
  const [isSaving, setIsSaving] = useState(false);

  const [scoringRules, setScoringRules] = useState<ScoringRules | null>(null);
  const [showFullScores, setShowFullScores] = useState(false);

  useEffect(() => {
    // Sync internal state with prop if it changes externally
    if (!isSaving) {
      setEvents(match.events || []);
    }
  }, [match.events, isSaving]);

  useEffect(() => {
    const fetchScoringRules = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'scoring'));
        if (docSnap.exists()) {
          setScoringRules(docSnap.data() as ScoringRules);
        }
      } catch (error) {
        console.error("Failed to fetch scoring rules:", error);
      }
    };
    fetchScoringRules();
  }, []);
  
  if (!scoringRules) return null; // Wait for rules
  
  const teamAEntity = teams.find(t => t.id === match.teamAId);
  const teamBEntity = teams.find(t => t.id === match.teamBId);
  const location = locations.find(l => l.id === match.locationId);
  const mvp = players.find(p => p.id === match.mvpId);

  const goalsA = events.filter(e => e.type === 'goal' && (teamA.includes(e.playerId) || e.playerId === 'unidentified_A')).length;
  const goalsB = events.filter(e => e.type === 'goal' && (teamB.includes(e.playerId) || e.playerId === 'unidentified_B')).length;

  const formatOverall = (val: number) => {
    const formatted = val.toFixed(2).replace('.', ',');
    return formatted.endsWith(',00') ? formatted.slice(0, -3) : formatted;
  };

  const getTeamStrength = (teamIds: string[]) => {
    const teamPlayers = teamIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
    if (teamPlayers.length === 0) return 0;
    let totalOverall = 0;
    let totalPointsAvg = 0;

    teamPlayers.forEach(p => {
      totalOverall += getPlayerFinalOverall(p, cards);
      const matches = p.stats?.matches || 1;
      const pts = p.stats?.points || 0;
      totalPointsAvg += (pts / matches);
    });
    
    const avgOverall = totalOverall / teamPlayers.length;
    const avgPoints = totalPointsAvg / teamPlayers.length;
    
    const pointsModifier = 1 + ((avgPoints - 1.0) * 0.05); 
    return avgOverall * pointsModifier;
  };

  const avgOverallA = teamA.length > 0 
    ? formatOverall(getTeamStrength(teamA))
    : "0";
  
  const avgOverallB = teamB.length > 0
    ? formatOverall(getTeamStrength(teamB))
    : "0";

  const handleSaveEvents = async () => {
    if (!isAdmin) return;
    setIsSaving(true);
    console.log('Saving events:', events, 'GoalsA:', goalsA, 'GoalsB:', goalsB);
    const batch = writeBatch(db);

    try {
        // 1. Recalculate OLD points (to subtract)
        const oldResults = calculateMatchPoints(match, match.scoreA, match.scoreB, match.events || [], match.mvpId || null, players, scoringRules);

        // 2. Recalculate NEW points (to add)
        const newResults = calculateMatchPoints(match, match.scoreA, match.scoreB, events, match.mvpId || null, players, scoringRules);

        // 3. Apply deltas to players
        const allInvolvedPlayerIds = new Set([
          ...oldResults.map(r => r.playerId),
          ...newResults.map(r => r.playerId)
        ]);

        allInvolvedPlayerIds.forEach(pid => {
          if (pid.startsWith('unidentified_')) return;
          
          const oldRes = oldResults.find(r => r.playerId === pid);
          const newRes = newResults.find(r => r.playerId === pid);
          const p = players.find(x => x.id === pid);

          if (p) {
            const oldGoals = (match.events || []).filter(e => e.playerId === pid && e.type === 'goal').length;
            const oldAssists = (match.events || []).filter(e => e.playerId === pid && e.type === 'assist').length;
            
            const newGoals = events.filter(e => e.playerId === pid && e.type === 'goal').length;
            const newAssists = events.filter(e => e.playerId === pid && e.type === 'assist').length;

            const deltaPoints = (newRes?.points || 0) - (oldRes?.points || 0);
            const deltaGoals = newGoals - oldGoals;
            const deltaAssists = newAssists - oldAssists;
            
            const oldWinner = match.scoreA > match.scoreB ? 'A' : match.scoreB > match.scoreA ? 'B' : 'draw';
            const newWinner = match.scoreA > match.scoreB ? 'A' : match.scoreB > match.scoreA ? 'B' : 'draw';
            
            const isTeamA = match.teamA.includes(pid);
            const wasWin = (oldWinner === 'A' && isTeamA) || (oldWinner === 'B' && !isTeamA);
            const isWin = (newWinner === 'A' && isTeamA) || (newWinner === 'B' && !isTeamA);
            
            const deltaWins = (isWin ? 1 : 0) - (wasWin ? 1 : 0);

            batch.update(doc(db, 'players', pid), {
              'stats.points': (p.stats.points || 0) + deltaPoints,
              'stats.goals': (p.stats.goals || 0) + deltaGoals,
              'stats.assists': (p.stats.assists || 0) + deltaAssists,
              'stats.wins': (p.stats.wins || 0) + deltaWins
            });
          }
        });

        const newMvpId = newResults.find(r => r.breakdown.mvp > 0)?.playerId || match.mvpId;

        batch.update(doc(db, 'matches', match.id), {
          events: events,
          teamA: teamA,
          teamB: teamB,
          substitutesA: substitutesA,
          substitutesB: substitutesB,
          mvpId: newMvpId || null
        });

      await batch.commit();
      // Automatic update of involved stats
      const { recalculateSpecificPlayerStats } = await import('../utils/maintenanceUtils');
      const matchParticipants = [...new Set([...match.teamA, ...match.teamB])];
      await recalculateSpecificPlayerStats(matchParticipants);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'matches');
    } finally {
      setIsSaving(false);
    }
  };

  const addEvent = (playerId: string, type: 'goal' | 'assist') => {
    setEvents([...events, { playerId, type }]);
  };

  const removeEvent = (index: number) => {
    setEvents(events.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative bg-white w-full max-w-2xl rounded-3xl border border-gray-100 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="p-4 md:p-6 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
            {location?.logoUrl && (
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl border border-gray-100 overflow-hidden flex-shrink-0 bg-gray-50 p-1">
                <img src={location.logoUrl} alt="" className="w-full h-full object-contain" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-lg md:text-xl font-black uppercase italic tracking-tight text-primary-blue truncate">Resumo da Partida</h3>
              <p className="text-[9px] md:text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 md:mt-1 flex items-center gap-1.5 truncate">
                <MapPin className="w-2.5 h-2.5 md:w-3 md:h-3 text-primary-yellow flex-shrink-0" /> <span className="truncate">{location?.name}</span> • <CalendarIcon className="w-2.5 h-2.5 md:w-3 md:h-3 text-primary-yellow flex-shrink-0" /> {format(new Date(match.date + 'T00:00:00'), 'dd MMM yyyy', { locale: ptBR })}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors flex-shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 md:p-6 overflow-y-auto space-y-6 md:space-y-8">
          {/* Scoreboard */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between bg-gray-50 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-gray-100 shadow-inner">
              <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0 cursor-pointer" onClick={() => { setActiveTab('pitch'); setIsEditingLineup(false); }}>
                <div className="w-8 h-8 md:w-10 md:h-10 flex-shrink-0">
                  <SoccerJersey color={teamAEntity?.color || '#555'} />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="font-black uppercase tracking-tight text-[10px] md:text-sm truncate w-full" style={{ color: teamAEntity?.color }}>{teamAEntity?.name}</div>
                  <div className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1 mt-0.5">
                    POWER <span className="text-[11px] md:text-[13px] font-black italic tracking-tighter text-[#a52a2a] tabular-nums">{avgOverallA}</span>
                  </div>
                </div>
              </div>
              
              <div className="text-2xl md:text-4xl font-black italic text-primary-blue tabular-nums px-2 md:px-4">
                {match.scoreA} - {match.scoreB}
              </div>
 
              <div className="flex items-center justify-end gap-2 md:gap-4 flex-1 min-w-0 cursor-pointer" onClick={() => { setActiveTab('pitch'); setIsEditingLineup(false); }}>
                <div className="flex flex-col min-w-0 items-end">
                  <div className="font-black uppercase tracking-tight text-[10px] md:text-sm truncate w-full text-right" style={{ color: teamBEntity?.color }}>{teamBEntity?.name}</div>
                  <div className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1 mt-0.5 justify-end">
                    POWER <span className="text-[11px] md:text-[13px] font-black italic tracking-tighter text-[#a52a2a] tabular-nums">{avgOverallB}</span>
                  </div>
                </div>
                <div className="w-8 h-8 md:w-10 md:h-10 flex-shrink-0">
                  <SoccerJersey color={teamBEntity?.color || '#555'} />
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-[10px] md:text-xs font-bold text-gray-500">
              <div className="flex flex-col gap-1 items-center">
                  {events.filter(e => 
                    (e.type === 'goal' && (teamA.includes(e.playerId) || e.playerId === 'unidentified_A')) ||
                    (e.type === 'own_goal' && (teamB.includes(e.playerId) || e.playerId === 'unidentified_B'))
                  ).map((e, idx) => {
                    const p = players.find(x => x.id === e.playerId);
                    const isOwnGoal = e.type === 'own_goal';
                    return (
                      <div key={idx} className="bg-blue-50 text-blue-800 text-[8px] px-2 py-0.5 rounded-full flex items-center gap-1 font-extrabold tracking-tight">
                        <span>{(p?.nickname || '').toUpperCase() || p?.name || '---'}</span>
                        {isOwnGoal && <span className="text-red-500 font-black text-[7px] ml-1 uppercase">(CONTRA)</span>}
                      </div>
                    );
                  })}
              </div>
              <div className="flex flex-col gap-1 items-center">
                  {events.filter(e => 
                    (e.type === 'goal' && (teamB.includes(e.playerId) || e.playerId === 'unidentified_B')) ||
                    (e.type === 'own_goal' && (teamA.includes(e.playerId) || e.playerId === 'unidentified_A'))
                  ).map((e, idx) => {
                    const p = players.find(x => x.id === e.playerId);
                    const isOwnGoal = e.type === 'own_goal';
                    return (
                      <div key={idx} className="bg-blue-50 text-blue-800 text-[8px] px-2 py-0.5 rounded-full flex items-center gap-1 font-extrabold tracking-tight">
                        <span>{(p?.nickname || '').toUpperCase() || p?.name || '---'}</span>
                        {isOwnGoal && <span className="text-red-500 font-black text-[7px] ml-1 uppercase">(CONTRA)</span>}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex p-1 bg-gray-100 rounded-2xl">
            <button 
              onClick={() => { setActiveTab('events'); setIsEditingLineup(false); }}
              className={`flex-1 py-3 text-[10px] md:text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'events' && !isEditingLineup ? 'bg-white text-primary-blue shadow-sm' : 'text-gray-400'}`}
            >
              Eventos
            </button>
            <button 
              onClick={() => { setActiveTab('pitch'); setIsEditingLineup(false); }}
              className={`flex-1 py-3 text-[10px] md:text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'pitch' ? 'bg-white text-primary-blue shadow-sm' : 'text-gray-400'}`}
            >
              Campo
            </button>
            {isAdmin && (
              <button 
                onClick={() => setIsEditingLineup(true)}
                className={`flex-1 py-3 text-[10px] md:text-xs font-black uppercase tracking-widest rounded-xl transition-all ${isEditingLineup ? 'bg-primary-blue text-white shadow-sm' : 'text-gray-400'}`}
              >
                Escalação
              </button>
            )}
          </div>

          {/* Content Section: Events, Pitch or Editor */}
          {isEditingLineup ? (
            <div className="space-y-6 text-primary-gray">
              <h4 className="font-black uppercase tracking-widest text-center text-primary-blue">Editar Escalação</h4>
              <div className="grid grid-cols-2 gap-4">
                {/* Team A Lineup Editor */}
                <div className="space-y-4">
                  <h5 className="text-xs font-black uppercase text-center">{teamAEntity?.name}</h5>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2 shadow-inner">
                    <p className="text-[10px] uppercase font-black text-gray-400">Titulares</p>
                    {teamA.map(pid => {
                      const p = players.find(x => x.id === pid);
                      return (
                        <div key={pid} className="flex justify-between text-xs p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                          <span className="font-bold">{p?.nickname || p?.name}</span>
                          <button onClick={() => { setTeamA(teamA.filter(id => id !== pid)); setSubstitutesA([...substitutesA, pid]); }} className="text-yellow-600 font-bold">Substituir</button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2 shadow-inner">
                    <p className="text-[10px] uppercase font-black text-gray-400">Reservas</p>
                    {substitutesA.map(pid => {
                      const p = players.find(x => x.id === pid);
                      return (
                        <div key={pid} className="flex justify-between text-xs p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                          <span className="font-bold">{p?.nickname || p?.name}</span>
                          <button onClick={() => { setSubstitutesA(substitutesA.filter(id => id !== pid)); setTeamA([...teamA, pid]); }} className="text-primary-blue font-bold">Entrar</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Team B Lineup Editor */}
                <div className="space-y-4">
                  <h5 className="text-xs font-black uppercase text-center">{teamBEntity?.name}</h5>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2 shadow-inner">
                    <p className="text-[10px] uppercase font-black text-gray-400">Titulares</p>
                    {teamB.map(pid => {
                      const p = players.find(x => x.id === pid);
                      return (
                        <div key={pid} className="flex justify-between text-xs p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                          <span className="font-bold">{p?.nickname || p?.name}</span>
                          <button onClick={() => { setTeamB(teamB.filter(id => id !== pid)); setSubstitutesB([...substitutesB, pid]); }} className="text-yellow-600 font-bold">Substituir</button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2 shadow-inner">
                    <p className="text-[10px] uppercase font-black text-gray-400">Reservas</p>
                    {substitutesB.map(pid => {
                      const p = players.find(x => x.id === pid);
                      return (
                        <div key={pid} className="flex justify-between text-xs p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                          <span className="font-bold">{p?.nickname || p?.name}</span>
                          <button onClick={() => { setSubstitutesB(substitutesB.filter(id => id !== pid)); setTeamB([...teamB, pid]); }} className="text-primary-blue font-bold">Entrar</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'pitch' ? (
            <SoccerPitch 
              teamA={teamA}
              teamB={teamB}
              goalkeeperAId={match.goalkeeperAId}
              goalkeeperBId={match.goalkeeperBId}
              teamAColor={teamAEntity?.color}
              teamBColor={teamBEntity?.color}
              players={players}
              matchDate={match.date}
              matchTime={match.time}
              teamAName={teamAEntity?.name}
              teamBName={teamBEntity?.name}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-primary-gray">
              {/* Team A Events */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                  <SoccerJersey color={teamAEntity?.color || '#555'} size={16} />
                  <h4 className="text-xs font-black uppercase tracking-widest text-primary-gray/60">{teamAEntity?.name}</h4>
                </div>
                <div className="space-y-4">
                  {/* Goals */}
                  <div className="text-[10px] font-black text-primary-blue uppercase italic">Gols</div>
                  <div className="space-y-2">
                    {events.filter(e => 
                      (e.type === 'goal' && (teamA.includes(e.playerId) || e.playerId === 'unidentified_A')) ||
                      (e.type === 'own_goal' && (teamB.includes(e.playerId) || e.playerId === 'unidentified_B'))
                    ).map((e, idx) => {
                      const p = players.find(x => x.id === e.playerId);
                      const isOwnGoal = e.type === 'own_goal';
                      return (
                        <div key={idx} className={`${isAdmin ? 'flex justify-between' : ''} text-xs p-3 bg-blue-50 rounded-xl border border-blue-100 font-bold group/player`}>
                          <span 
                            className={p ? "cursor-pointer hover:text-primary-blue transition-colors" : ""}
                            onClick={() => p && onPlayerClick?.(p)}
                          >
                            {(p?.nickname || '').toUpperCase() || p?.name || '---'}
                            {isOwnGoal && <span className="text-red-500 font-black text-[9px] uppercase ml-1.5">(GOL CONTRA)</span>}
                          </span>
                          {isAdmin && (
                            <button onClick={() => removeEvent(events.indexOf(e))} className="text-red-500 hover:scale-110 transition-transform"><Trash2 size={14} /></button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Assists */}
                  <div className="text-[10px] font-black text-primary-yellow uppercase italic mt-4">Assistências</div>
                  <div className="space-y-2">
                    {events.filter(e => (teamA.includes(e.playerId) || e.playerId === 'unidentified_A') && e.type === 'assist').map((e, idx) => {
                      const p = players.find(x => x.id === e.playerId);
                      return (
                        <div key={idx} className="text-xs p-3 bg-yellow-50 rounded-xl border border-yellow-100 font-bold group/player">
                          <span 
                            className={p ? "cursor-pointer hover:text-primary-blue transition-colors" : ""}
                            onClick={() => p && onPlayerClick?.(p)}
                          >
                            {(p?.nickname || '').toUpperCase() || p?.name || '---'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* Team B Events */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                  <SoccerJersey color={teamBEntity?.color || '#555'} size={16} />
                  <h4 className="text-xs font-black uppercase tracking-widest text-primary-gray/60">{teamBEntity?.name}</h4>
                </div>
                {/* Events list for Team B */}
                <div className="space-y-4">
                  {/* Goals */}
                  <div className="text-[10px] font-black text-primary-blue uppercase italic">Gols</div>
                  <div className="space-y-2">
                    {events.filter(e => 
                      (e.type === 'goal' && (teamB.includes(e.playerId) || e.playerId === 'unidentified_B')) ||
                      (e.type === 'own_goal' && (teamA.includes(e.playerId) || e.playerId === 'unidentified_A'))
                    ).map((e, idx) => {
                      const p = players.find(x => x.id === e.playerId);
                      const isOwnGoal = e.type === 'own_goal';
                      return (
                        <div key={idx} className={`${isAdmin ? 'flex justify-between' : ''} text-xs p-3 bg-blue-50 rounded-xl border border-blue-100 font-bold group/player`}>
                          <span 
                            className={p ? "cursor-pointer hover:text-primary-blue transition-colors" : ""}
                            onClick={() => p && onPlayerClick?.(p)}
                          >
                            {(p?.nickname || '').toUpperCase() || p?.name || '---'}
                            {isOwnGoal && <span className="text-red-500 font-black text-[9px] uppercase ml-1.5">(GOL CONTRA)</span>}
                          </span>
                          {isAdmin && (
                            <button onClick={() => removeEvent(events.indexOf(e))} className="text-red-500 hover:scale-110 transition-transform"><Trash2 size={14} /></button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Assists */}
                  <div className="text-[10px] font-black text-primary-yellow uppercase italic mt-4">Assistências</div>
                  <div className="space-y-2">
                    {events.filter(e => (teamB.includes(e.playerId) || e.playerId === 'unidentified_B') && e.type === 'assist').map((e, idx) => {
                      const p = players.find(x => x.id === e.playerId);
                      return (
                        <div key={idx} className="text-xs p-3 bg-yellow-50 rounded-xl border border-yellow-100 font-bold group/player">
                          <span 
                            className={p ? "cursor-pointer hover:text-primary-blue transition-colors" : ""}
                            onClick={() => p && onPlayerClick?.(p)}
                          >
                            {(p?.nickname || '').toUpperCase() || p?.name || '---'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
            </div>
          </div>
          )}

          {/* MVP Section */}
          {mvp && (
            <div 
              className={`bg-primary-blue p-6 rounded-3xl flex items-center gap-5 shadow-lg border border-primary-blue/20 ${mvp ? 'cursor-pointer hover:bg-blue-700 transition-colors' : ''}`}
              onClick={() => mvp && onPlayerClick?.(mvp)}
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-primary-yellow overflow-hidden shadow-inner bg-white/10 p-0.5">
                  {mvp.photoUrl ? (
                    <img src={mvp.photoUrl} alt="" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center">
                      <User className="text-white/30" size={32} />
                    </div>
                  )}
                </div>
                <div className="absolute -top-1 -right-1 bg-primary-yellow rounded-full p-1.5 shadow-lg">
                  <Star size={12} className="text-primary-blue fill-primary-blue" />
                </div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-primary-yellow italic mb-1">Craque da Partida</div>
                <div className="text-xl font-black uppercase italic leading-none text-white tracking-tight">{(mvp.nickname || '').toUpperCase() || mvp.name}</div>
              </div>
            </div>
          )}

          <button 
            onClick={() => setShowFullScores(!showFullScores)}
            className="w-full py-4 text-[10px] uppercase font-black tracking-widest bg-gray-50 hover:bg-gray-100 rounded-2xl transition-all border border-gray-100 text-primary-blue mt-4"
          >
            {showFullScores ? 'Esconder Pontuação' : 'Ver Pontuação de Todos os Jogadores'}
          </button>

          {showFullScores && (
            <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100 space-y-4 mt-4 shadow-inner">
              <h4 className="font-black uppercase tracking-widest text-xs text-center text-primary-blue">Pontuação Completa</h4>
              <div className="space-y-2">
                {calculateMatchPoints(match, match.scoreA, match.scoreB, events, match.mvpId || null, players, scoringRules!)
                  .sort((a, b) => b.points - a.points)
                  .map(res => {
                  const p = players.find(x => x.id === res.playerId);
                  if (!p) return null;
                  
                  return (
                    <div 
                      key={res.playerId} 
                      className="flex justify-between items-center text-xs p-4 bg-white rounded-2xl border border-gray-100 shadow-sm cursor-pointer hover:border-primary-blue/30 transition-all group/score"
                      onClick={() => p && onPlayerClick?.(p)}
                    >
                      <span className="font-bold text-primary-gray group-hover/score:text-primary-blue transition-colors">{(p.nickname || '').toUpperCase() || p.name}</span>
                      <div className="flex gap-4">
                        <span className="text-gray-400 font-bold">{res.breakdown.goalsCount} <span className="text-[9px] uppercase tracking-wider">Gol</span></span>
                        <span className="text-gray-400 font-bold">{res.breakdown.assistsCount} <span className="text-[9px] uppercase tracking-wider">Ass</span></span>
                        <span className="font-black text-primary-blue tabular-nums">{res.points} pts</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {isAdmin && (
          <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-end">
            <button
              type="button"
              onClick={handleSaveEvents}
              disabled={isSaving}
              className="bg-primary-blue text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest flex items-center gap-3 hover:bg-blue-700 transition-all disabled:opacity-50 shadow-xl shadow-blue-200 active:scale-95"
            >
              {isSaving ? <X className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function PublicDashboard({ 
  adminData, 
  sharedLocations, 
  sharedTeams, 
  sharedScoringRules, 
  isCompact = false, 
  bottomMainContent,
  sharedPlayers,
  sharedCards
}: PublicDashboardProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [cards, setCards] = useState<Card[]>(sharedCards || []);
  const [monthlyAwards, setMonthlyAwards] = useState<MonthlyAward[]>([]);
  const [players, setPlayers] = useState<Player[]>(sharedPlayers || []);
  const [teams, setTeams] = useState<Team[]>(sharedTeams);
  const [loading, setLoading] = useState(!sharedPlayers);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const navigate = useNavigate();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [scoringRules, setScoringRules] = useState<ScoringRules | null>(sharedScoringRules);
  const [showAllPoints, setShowAllPoints] = useState(false);
  const [showAllScorers, setShowAllScorers] = useState(false);

  useEffect(() => {
    setTeams(sharedTeams);
  }, [sharedTeams]);

  useEffect(() => {
    setScoringRules(sharedScoringRules);
  }, [sharedScoringRules]);

  useEffect(() => {
    if (sharedPlayers && sharedPlayers.length > 0) {
      setPlayers(sharedPlayers);
      setLoading(false);
    }
  }, [sharedPlayers]);

  useEffect(() => {
    if (sharedCards && sharedCards.length > 0) {
      setCards(sharedCards);
    }
  }, [sharedCards]);

  // Sync selected match if it gets updated in the background
  useEffect(() => {
    if (selectedMatch) {
      const updated = matches.find(m => m.id === selectedMatch.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedMatch)) {
        setSelectedMatch(updated);
      }
    }
  }, [matches, selectedMatch]);

  // 1. Matches subscription
  useEffect(() => {
    let qMatches = query(collection(db, 'matches'), orderBy('date', 'desc'), limit(25));
    
    if (adminData && adminData.role !== 'master' && adminData.locationId) {
      qMatches = query(
        collection(db, 'matches'), 
        where('locationId', '==', adminData.locationId),
        orderBy('date', 'desc'),
        limit(25)
      );
    }

    const unsubscribeMatches = onSnapshot(qMatches, async (snapshot) => {
      let matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      
      matchesData.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.time || '').localeCompare(a.time || '');
      });

      setMatches(matchesData);
    }, async (err) => {
      if (err.message?.includes('index') || err.code === 'failed-precondition') {
        console.warn("Secondary fallback triggered for index issue.");
        const qFallback = query(collection(db, 'matches'), limit(25));
        const snap = await getDocs(qFallback);
        setMatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match)));
      } else {
        handleFirestoreError(err, OperationType.LIST, 'matches');
      }
    });

    return () => unsubscribeMatches();
  }, [adminData?.locationId, adminData?.role]);

  // 2. Players subscription (only if not shared)
  useEffect(() => {
    if (sharedPlayers && sharedPlayers.length > 0) {
      setPlayers(sharedPlayers);
      setLoading(false);
      return;
    }

    let qPlayers = query(collection(db, 'players'));
    if (adminData && adminData.role !== 'master' && adminData.locationId) {
      qPlayers = query(
        collection(db, 'players'), 
        where('locationId', '==', adminData.locationId)
      );
    }

    const unsubscribePlayers = onSnapshot(qPlayers, async (snapshot) => {
      let playersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      setPlayers(playersData);
      setLoading(false);
    }, async (err) => {
      const snap = await getDocs(collection(db, 'players'));
      let playersData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        playersData = playersData.filter(p => p.locationId === adminData.locationId);
      }
      setPlayers(playersData);
      setLoading(false);
    });

    return () => unsubscribePlayers();
  }, [adminData?.locationId, adminData?.role, sharedPlayers]);

  // 3. Monthly Awards subscription
  useEffect(() => {
    let qAwards = query(collection(db, 'monthlyAwards'), orderBy('createdAt', 'desc'));
    if (adminData && adminData.role !== 'master' && adminData.locationId) {
      qAwards = query(
        collection(db, 'monthlyAwards'),
        where('locationId', '==', adminData.locationId)
      );
    }
    const unsubscribeAwards = onSnapshot(qAwards, (snapshot) => {
      setMonthlyAwards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MonthlyAward)));
    }, (err) => {
      console.error("Error fetching monthly awards:", err);
    });

    return () => unsubscribeAwards();
  }, [adminData?.locationId, adminData?.role]);

  // 4. Cards subscription (only if not shared)
  useEffect(() => {
    if (sharedCards && sharedCards.length > 0) {
      setCards(sharedCards);
      return;
    }

    const unsubscribeCards = onSnapshot(collection(db, 'cards'), (snapshot) => {
      setCards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Card)));
    }, (err) => {
      console.error("Error fetching cards:", err);
    });

    return () => unsubscribeCards();
  }, [sharedCards]);

  const getAveragePoints = (p: Player) => {
    if (!p.stats.matches || p.stats.matches === 0) return 0;
    return (p.stats.points || 0) / p.stats.matches;
  };

  const topScorers = [...players].sort((a, b) => b.stats.goals - a.stats.goals).slice(0, 5);
  const topPoints = [...players]
    .filter(p => p.stats.matches > 0)
    .sort((a, b) => {
      const avgA = (a.stats.points || 0) / (a.stats.matches || 1);
      const avgB = (b.stats.points || 0) / (b.stats.matches || 1);
      if (avgB !== avgA) {
        return avgB - avgA;
      }
      const numA = parseInt(calculateGrade(a.overallStats, avgA).grade) || 0;
      const numB = parseInt(calculateGrade(b.overallStats, avgB).grade) || 0;
      return numB - numA;
    })
    .slice(0, 5);

  const getLocationName = (locId: string) => {
    if (!locId) return 'Local não definido';
    const loc = sharedLocations.find(l => l.id === locId);
    if (loc) return loc.name;
    
    // Fallback: check if the locId matches a location name (for legacy data)
    const normalizedLocId = (locId || '').trim().toLowerCase();
    const locByName = sharedLocations.find(l => (l.name || '').trim().toLowerCase() === normalizedLocId);
    if (locByName) return locByName.name;
    
    return 'Local não definido';
  };

  if (loading) return null;

  const allPoints = [...players]
    .filter(p => p.stats.matches > 0)
    .sort((a, b) => {
      const avgA = (a.stats.points || 0) / (a.stats.matches || 1);
      const avgB = (b.stats.points || 0) / (b.stats.matches || 1);
      if (avgB !== avgA) {
        return avgB - avgA;
      }
      const numA = parseInt(calculateGrade(a.overallStats, avgA).grade) || 0;
      const numB = parseInt(calculateGrade(b.overallStats, avgB).grade) || 0;
      return numB - numA;
    });

  const allScorers = [...players]
    .filter(p => p.stats.goals > 0)
    .sort((a, b) => b.stats.goals - a.stats.goals);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Main Content: Match Results */}
      <div className="lg:col-span-8 space-y-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex flex-col">
            <h2 className="text-2xl font-black uppercase italic tracking-tight flex items-center gap-2 text-primary-gray">
              <TrendingUp className="text-primary-blue" /> Últimos Resultados
            </h2>
            {adminData && adminData.role !== 'master' && adminData.locationId && (
              <div className="flex items-center gap-1 text-gray-400 text-[10px] uppercase font-bold tracking-widest mt-1">
                <MapPin className="w-3 h-3 text-primary-blue" />
                Restrito a: {getLocationName(adminData.locationId)}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matches.length === 0 ? (
            <div className="bg-app-card p-12 rounded-3xl border border-gray-100 text-center shadow-sm">
              <CalendarIcon className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400 font-medium">Nenhuma partida registrada ainda.</p>
            </div>
          ) : (
            <>
              {matches.slice(0, 6).map((match, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  key={match.id} 
                  onClick={() => setSelectedMatch(match)}
                  className={`${
                    match.status === 'finished' ? 'bg-app-card' : 
                    match.status === 'scheduled' ? 'bg-blue-50' :
                    'bg-app-card'
                  } ${isCompact ? 'rounded-2xl' : 'rounded-3xl'} border ${match.status === 'scheduled' ? 'border-blue-100' : 'border-gray-100'} overflow-hidden hover:border-primary-blue/30 hover:shadow-md transition-all group shadow-sm cursor-pointer hover:scale-[1.01] active:scale-[0.99]`}
                >
                  <div className="flex flex-row h-full">
                    {/* Location Logo - Left Side */}
                    {(() => {
                      const loc = sharedLocations.find(l => l.id === match.locationId);
                      return loc?.logoUrl ? (
                        <div className={isCompact ? "w-10 bg-gray-50/50 flex items-center justify-center p-1.5 border-r border-gray-100 flex-shrink-0" : "w-16 md:w-24 bg-gray-50/50 flex items-center justify-center p-2 border-r border-gray-100 flex-shrink-0"}>
                          <img src={loc.logoUrl} alt="" className="w-full h-full object-contain drop-shadow-sm" />
                        </div>
                      ) : null;
                    })()}

                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        {/* Match Header */}
                        <div className={`${
                          match.status === 'finished' ? 'bg-gray-50' : 
                          match.status === 'scheduled' ? 'bg-blue-100/50' :
                          'bg-gray-50'
                        } ${isCompact ? 'px-3 py-1.5 text-[8px] md:text-[9px]' : 'px-4 md:px-5 py-2 md:py-2.5 text-[9px] md:text-[10px]'} uppercase tracking-widest font-black text-gray-400 border-b border-gray-100 flex items-center justify-between`}>
                          <div className="flex items-center gap-1.5 md:gap-3 overflow-hidden font-bold">
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className={isCompact ? "w-2 h-2 text-primary-blue flex-shrink-0" : "w-2.5 h-2.5 md:w-3 md:h-3 text-primary-blue flex-shrink-0"} /> 
                              <span className="truncate">{getLocationName(match.locationId)}</span>
                            </span>
                            <span className="flex items-center gap-1 flex-shrink-0"><CalendarIcon className={isCompact ? "w-2 h-2 text-primary-blue" : "w-2.5 h-2.5 md:w-3 md:h-3 text-primary-blue"} /> {format(new Date(match.date + 'T00:00:00'), 'dd MMM yyyy', { locale: ptBR })}</span>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] flex-shrink-0 ${
                            match.status === 'finished' ? 'bg-gray-200 text-gray-600' : 
                            match.status === 'live' ? 'bg-red-500 text-white animate-pulse font-black' : 
                            'bg-primary-blue/10 text-primary-blue'
                          }`}>
                            {match.status === 'finished' ? 'Fim' : match.status === 'live' ? 'VIVO' : 'Agend'}
                          </span>
                        </div>

                        {/* Scoreboard Area */}
                        <div className={isCompact ? "p-3 md:p-4 flex items-center justify-between gap-1" : "p-4 md:p-8 flex items-center justify-between gap-2"}>
                          <div className="flex-1 text-center min-w-0">
                            <div className={isCompact ? "flex flex-col items-center gap-1" : "flex flex-col items-center gap-2 md:gap-3"}>
                              <div className={isCompact ? "w-6 h-6 md:w-7 md:h-7" : "w-8 h-8 md:w-10 md:h-10"}>
                                <SoccerJersey color={teams.find(t => t.id === match.teamAId)?.color || '#555'} />
                              </div>
                              <div className={`${isCompact ? 'text-[10px] md:text-xs' : 'text-xs md:text-lg'} font-black uppercase tracking-tight text-primary-blue truncate w-full px-1`}>
                                {teams.find(t => t.id === match.teamAId)?.name || 'Time A'}
                              </div>
                            </div>
                          </div>

                          <div className={isCompact ? "flex items-center gap-1 px-1" : "flex items-center gap-3 md:gap-10 px-2 md:px-8"}>
                            <div className={isCompact ? "text-xl md:text-3xl font-black italic text-primary-blue tabular-nums drop-shadow-sm" : "text-3xl md:text-6xl font-black italic text-primary-blue tabular-nums drop-shadow-sm"}>{match.scoreA}</div>
                            <div className={isCompact ? "text-[8px] font-black text-primary-yellow opacity-30 italic" : "text-[10px] md:text-sm font-black text-primary-yellow opacity-30 italic"}>X</div>
                            <div className={isCompact ? "text-xl md:text-3xl font-black italic text-primary-blue tabular-nums drop-shadow-sm" : "text-3xl md:text-6xl font-black italic text-primary-blue tabular-nums drop-shadow-sm"}>{match.scoreB}</div>
                          </div>

                          <div className="flex-1 text-center min-w-0">
                            <div className={isCompact ? "flex flex-col items-center gap-1" : "flex flex-col items-center gap-2 md:gap-3"}>
                              <div className={isCompact ? "w-6 h-6 md:w-7 md:h-7" : "w-8 h-8 md:w-10 md:h-10"}>
                                <SoccerJersey color={teams.find(t => t.id === match.teamBId)?.color || '#555'} />
                              </div>
                              <div className={`${isCompact ? 'text-[10px] md:text-xs' : 'text-xs md:text-lg'} font-black uppercase tracking-tight text-primary-blue truncate w-full px-1`}>
                                {teams.find(t => t.id === match.teamBId)?.name || 'Time B'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}

              {matches.length > 6 && (
                <button 
                  onClick={() => navigate('/resultados')}
                  className={isCompact ? "col-span-full w-full bg-white border-2 border-primary-blue text-primary-blue py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-primary-blue hover:text-white transition-all shadow-sm active:scale-95 group flex items-center justify-center gap-2 text-xs" : "w-full bg-white border-2 border-primary-blue text-primary-blue py-5 rounded-3xl font-black uppercase tracking-widest hover:bg-primary-blue hover:text-white transition-all shadow-sm active:scale-95 group flex items-center justify-center gap-3"}
                >
                  Ver Todas as Partidas
                  <ChevronRight className={isCompact ? "w-4 h-4 group-hover:translate-x-1 transition-transform" : "w-5 h-5 group-hover:translate-x-1 transition-transform"} />
                </button>
              )}
            </>
          )}
        </div>
        {bottomMainContent && (
          <div className="mt-8">
            {bottomMainContent}
          </div>
        )}
      </div>

      {/* Player Details Modal */}
      <AnimatePresence>
        {selectedPlayer && (
          <PlayerSummaryModal 
            player={selectedPlayer}
            matches={matches}
            scoringRules={scoringRules}
            isAdminView={!!adminData}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
      </AnimatePresence>
      
      {/* Match Details Modal */}
      <AnimatePresence>
        {selectedMatch && (
          <MatchDetailsModal
            cards={cards} 
            match={selectedMatch} 
            players={players}
            teams={teams}
            locations={sharedLocations}
            isAdmin={!!adminData}
            onClose={() => setSelectedMatch(null)}
            onPlayerClick={(player) => {
              setSelectedMatch(null);
              setSelectedPlayer(player);
            }}
          />
        )}
      </AnimatePresence>

      {/* Sidebars: Leaderboards */}
      <div className="lg:col-span-4 space-y-8">
        {/* Top Points */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="bg-primary-blue p-1 rounded">
                <Star className="w-4 h-4 text-primary-yellow" />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest italic text-primary-blue">Top 5 Pontuadores</h3>
            </div>
            <button 
              onClick={() => setShowAllPoints(true)}
              className="text-[10px] font-black uppercase tracking-widest text-primary-blue hover:underline"
            >
              Ver Tudo
            </button>
          </div>
          <div className="bg-app-card rounded-3xl border border-gray-100 divide-y divide-gray-50 overflow-hidden shadow-sm">
            {topPoints.map((player, i) => (
              <div key={player.id} onClick={() => setSelectedPlayer(player)} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors cursor-pointer group">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-gray-300 w-4 group-hover:text-primary-blue transition-colors">{i + 1}</span>
                  <div className="relative">
                    {player.photoUrl ? (
                      <img src={player.photoUrl} alt="" className="w-10 h-10 rounded-full border-2 border-gray-100 object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full border-2 border-gray-100 bg-gray-50 flex items-center justify-center">
                        <User size={20} className="text-gray-300" />
                      </div>
                    )}
                    {i === 0 && <Trophy className="w-4 h-4 text-primary-yellow absolute -top-1 -right-1 drop-shadow-md" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-black leading-tight text-primary-blue">{player.nickname || player.name}</div>
                      <span className={`text-[9px] font-black italic ${calculateGrade(player.overallStats, (player.stats.points || 0) / (player.stats.matches || 1)).color} bg-gray-50 px-1.5 rounded-md border border-gray-100`}>
                        {calculateGrade(player.overallStats, (player.stats.points || 0) / (player.stats.matches || 1)).grade}
                      </span>
                    </div>
                    <div className={`text-[10px] uppercase font-black tracking-tighter ${getPositionColor(player.position)}`}>
                      {getPositionAbbr(player.position)} • <span className="text-gray-400">{player.stats.matches} Partidas</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-primary-blue italic leading-none">{getAveragePoints(player).toFixed(1)}</div>
                  <div className="text-[8px] uppercase font-black text-gray-400 tracking-widest">Média</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Top Scorers */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="bg-primary-blue p-1 rounded">
                <SoccerBall size={16} className="text-primary-yellow" />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest italic text-primary-blue">Top 5 Artilheiros</h3>
            </div>
            <button 
              onClick={() => setShowAllScorers(true)}
              className="text-[10px] font-black uppercase tracking-widest text-primary-blue hover:underline"
            >
              Ver Tudo
            </button>
          </div>
          <div className="bg-app-card rounded-3xl border border-gray-100 divide-y divide-gray-50 overflow-hidden shadow-sm">
            {topScorers.map((player, i) => (
              <div key={player.id} onClick={() => setSelectedPlayer(player)} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors cursor-pointer group">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-gray-300 w-4 group-hover:text-primary-blue transition-colors">{i + 1}</span>
                  {player.photoUrl ? (
                    <img src={player.photoUrl} alt="" className="w-10 h-10 rounded-full border-2 border-gray-100 object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full border-2 border-gray-100 bg-gray-50 flex items-center justify-center">
                      <User size={20} className="text-gray-300" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-black leading-tight text-primary-blue">{player.nickname || player.name}</div>
                      <span className={`text-[9px] font-black italic ${calculateGrade(player.overallStats, (player.stats.points || 0) / (player.stats.matches || 1)).color} bg-gray-50 px-1.5 rounded-md border border-gray-100`}>
                        {calculateGrade(player.overallStats, (player.stats.points || 0) / (player.stats.matches || 1)).grade}
                      </span>
                    </div>
                    <div className="text-[10px] uppercase text-gray-400 font-bold tracking-tighter">{player.stats.matches} Partidas</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-primary-blue italic leading-none">{player.stats.goals}</div>
                  <div className="text-[8px] uppercase font-black text-gray-400 tracking-widest">Gols</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Leaderboard Modal */}
      <AnimatePresence>
        {(showAllPoints || showAllScorers) && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              onClick={() => { setShowAllPoints(false); setShowAllScorers(false); }} 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.9, y: 20 }} 
              className="relative bg-app-card w-full max-w-lg rounded-3xl border border-gray-100 overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight text-primary-gray">
                    {showAllPoints ? 'Ranking de Pontuadores' : 'Ranking de Artilheiros'}
                  </h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                    {adminData?.locationId ? `Arena: ${getLocationName(adminData.locationId)}` : 'Todas as Arenas'}
                  </p>
                </div>
                <button type="button" onClick={() => { setShowAllPoints(false); setShowAllScorers(false); }} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="overflow-y-auto p-4 space-y-2 text-primary-gray">
                {(showAllPoints ? allPoints : allScorers).map((player, i) => (
                  <div key={player.id} onClick={() => setSelectedPlayer(player)} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors border border-gray-100 cursor-pointer shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-gray-300 w-5">{i + 1}º</span>
                      <div className="relative">
                        {player.photoUrl ? (
                          <img src={player.photoUrl} alt="" className="w-10 h-10 rounded-full border-2 border-gray-100 object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full border-2 border-gray-100 bg-white flex items-center justify-center">
                            <User size={20} className="text-gray-300" />
                          </div>
                        )}
                        {i < 3 && (
                          <div className={`absolute -top-1 -right-1 rounded-full p-1 shadow-lg ${i === 0 ? 'bg-primary-yellow' : i === 1 ? 'bg-gray-300' : 'bg-amber-600'}`}>
                            {i === 0 ? <Trophy size={8} className="text-primary-blue" /> : <Star size={8} className="text-white" />}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-sm font-black text-primary-blue leading-tight">
                          {player.nickname || player.name}
                          <span className={`text-[9px] font-black italic ${calculateGrade(player.overallStats, (player.stats.points || 0) / (player.stats.matches || 1)).color} bg-white px-1.5 rounded-md border border-gray-100 shadow-sm`}>
                            {calculateGrade(player.overallStats, (player.stats.points || 0) / (player.stats.matches || 1)).grade}
                          </span>
                        </div>
                        <div className={`text-[10px] uppercase font-bold tracking-tighter ${getPositionColor(player.position)}`}>
                          {getPositionAbbr(player.position)} • <span className="text-gray-400">{player.stats.matches} jogos • {player.stats.goals || 0} G / {player.stats.assists || 0} A</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-black italic leading-none text-primary-blue`}>
                        {showAllPoints ? getAveragePoints(player).toFixed(1) : player.stats.goals}
                      </div>
                      <div className="text-[8px] uppercase font-black text-gray-400 tracking-widest">
                        {showAllPoints ? 'Média' : 'Gols'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
