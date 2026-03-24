import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, doc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { Player, Match, Location, Team, ScoringRules, AdminData } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, MapPin, Clock, Plus, Users, CheckCircle2, XCircle, Trophy, Goal, Map, ShieldCheck, X, Trash2, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SoccerJersey } from '../components/SoccerJersey';
import { SoccerBall, SoccerCleat, GoalkeeperGlove } from '../components/Icons';
import { handleFirestoreError, OperationType } from '../App';
import { Link } from 'react-router-dom';
import { PlayerSelectionModal } from '../components/PlayerSelectionModal';
import { getDoc } from 'firebase/firestore';
import { calculateMatchPoints, MatchEvent } from '../utils/scoringEngine';

const DEFAULT_RULES: ScoringRules = {
  id: 'scoring',
  win: 3,
  draw: 1,
  goal: 5,
  assist: 3,
  cleanSheet: 5,
  mvp: 10,
  updatedAt: Date.now()
};

interface MatchManagementProps {
  adminData?: AdminData | null;
}

export default function MatchManagement({ adminData }: MatchManagementProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scoringRules, setScoringRules] = useState<ScoringRules>(DEFAULT_RULES);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPlayerSelectionOpen, setIsPlayerSelectionOpen] = useState(false);
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [matchToDelete, setMatchToDelete] = useState<Match | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all');

  // Form State
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('19:00');
  const [locationId, setLocationId] = useState('');

  useEffect(() => {
    const unsubscribeMatches = onSnapshot(collection(db, 'matches'), (snapshot) => {
      let matchesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      
      // Filter by location if not master admin
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        matchesList = matchesList.filter(m => m.locationId === adminData.locationId);
      }
      
      setMatches(matchesList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'matches'));

    const unsubscribePlayers = onSnapshot(collection(db, 'players'), (snapshot) => {
      let playersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      
      // Filter by location if not master admin
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        playersList = playersList.filter(p => p.locationId === adminData.locationId);
      }
      
      setPlayers(playersList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'players'));

    const unsubscribeLocations = onSnapshot(collection(db, 'locations'), (snapshot) => {
      let locationsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location));
      
      // Filter locations if not master admin
      if (adminData && adminData.role !== 'master') {
        if (adminData.locationId && adminData.locationId !== 'all') {
          locationsList = locationsList.filter(l => l.id === adminData.locationId);
        } else if (!adminData.locationId) {
          // If admin is not master but has no locationId assigned, they should see no locations.
          locationsList = [];
        }
      }
      
      setLocations(locationsList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'locations'));

    const unsubscribeTeams = onSnapshot(collection(db, 'teams'), (snapshot) => {
      let teamsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
      
      // Filter by location if not master admin
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        teamsList = teamsList.filter(t => t.locationId === adminData.locationId);
      }
      
      setTeams(teamsList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'teams'));

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

    return () => {
      unsubscribeMatches();
      unsubscribePlayers();
      unsubscribeLocations();
      unsubscribeTeams();
    };
  }, [adminData]);

  useEffect(() => {
    if (adminData && adminData.role !== 'master' && adminData.locationId) {
      setLocationId(adminData.locationId);
    }
  }, [adminData, isModalOpen]);

  const handleCreateMatch = (e: React.FormEvent) => {
    e.preventDefault();
    setIsModalOpen(false);
    setIsPlayerSelectionOpen(true);
  };

  const onConfirmPlayerSelection = async (tAId: string, tBId: string, teamAPlayers: string[], teamBPlayers: string[], goalkeeperAId: string, goalkeeperBId: string) => {
    try {
      const matchData = {
        date,
        time,
        locationId,
        teamAId: tAId,
        teamBId: tBId,
        teamA: teamAPlayers,
        teamB: teamBPlayers,
        goalkeeperAId,
        goalkeeperBId,
      };

      if (editingMatch) {
        await updateDoc(doc(db, 'matches', editingMatch.id), matchData);
      } else {
        await addDoc(collection(db, 'matches'), {
          ...matchData,
          scoreA: 0,
          scoreB: 0,
          status: 'scheduled',
          createdAt: Date.now()
        });
      }
      setIsPlayerSelectionOpen(false);
      setEditingMatch(null);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, editingMatch ? OperationType.UPDATE : OperationType.CREATE, 'matches');
    }
  };

  const resetForm = () => {
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setTime('19:00');
    setLocationId(adminData && adminData.role !== 'master' && adminData.locationId ? adminData.locationId : '');
    setEditingMatch(null);
  };
  
  const handleDeleteMatch = async () => {
    if (!matchToDelete) return;
    try {
      await deleteDoc(doc(db, 'matches', matchToDelete.id));
      setMatchToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'matches');
    }
  };

  const getLocationName = (locId: string) => {
    if (!locId) return 'Local não definido';
    const loc = locations.find(l => l.id === locId);
    if (loc) return loc.name;
    
    // Fallback: check if the locId matches a location name (for legacy data)
    const normalizedLocId = (locId || '').trim().toLowerCase();
    const locByName = locations.find(l => (l.name || '').trim().toLowerCase() === normalizedLocId);
    if (locByName) return locByName.name;
    
    return 'Local não definido';
  };

  const finishMatch = async (match: Match, scoreA: number, scoreB: number) => {
    const batch = writeBatch(db);
    const matchRef = doc(db, 'matches', match.id);

    // Update match status
    batch.update(matchRef, { scoreA, scoreB, status: 'finished' });

    // Update player stats
    const winner = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'draw';
    
    [...match.teamA, ...match.teamB].forEach(pid => {
      const player = players.find(p => p.id === pid);
      if (player) {
        const playerRef = doc(db, 'players', pid);
        const isWinner = (winner === 'A' && match.teamA.includes(pid)) || (winner === 'B' && match.teamB.includes(pid));
        
        batch.update(playerRef, {
          'stats.matches': (player.stats.matches || 0) + 1,
          'stats.wins': isWinner ? (player.stats.wins || 0) + 1 : (player.stats.wins || 0)
        });
      }
    });

    await batch.commit();
    setActiveMatch(null);
  };

  // Score Entry Modal Component
  const ScoreEntry = ({ match, onClose }: { match: Match, onClose: () => void }) => {
    const [sA, setSA] = useState(match.scoreA);
    const [sB, setSB] = useState(match.scoreB);
    const [events, setEvents] = useState<{playerId: string, type: 'goal' | 'assist'}[]>(match.events || []);

    const teamA = teams.find(t => t.id === match.teamAId);
    const teamB = teams.find(t => t.id === match.teamBId);

    // Auto-update score when events change
    useEffect(() => {
      const goalsA = events.filter(e => e.type === 'goal' && (match.teamA.includes(e.playerId) || e.playerId === 'unidentified_A')).length;
      const goalsB = events.filter(e => e.type === 'goal' && (match.teamB.includes(e.playerId) || e.playerId === 'unidentified_B')).length;
      setSA(goalsA);
      setSB(goalsB);
    }, [events, match.teamA, match.teamB]);

    const addEvent = (playerId: string, type: 'goal' | 'assist') => {
      setEvents([...events, { playerId, type }]);
    };

    const removeEvent = (index: number) => {
      setEvents(events.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
      const batch = writeBatch(db);
      
      // Calculate points using the engine (passing null for mvpId to trigger auto-calculation)
      const results = calculateMatchPoints(match, sA, sB, events, null, players);
      const calculatedMvpId = results.find(r => r.breakdown.mvp > 0)?.playerId;

      // Update match
      batch.update(doc(db, 'matches', match.id), { 
        scoreA: sA, 
        scoreB: sB, 
        status: 'finished',
        mvpId: calculatedMvpId || null,
        events: events
      });

      // Update player stats
      results.forEach(res => {
        if (res.playerId.startsWith('unidentified_')) return;
        const p = players.find(x => x.id === res.playerId);
        if (p) {
          const winner = sA > sB ? 'A' : sB > sA ? 'B' : 'draw';
          const isTeamA = match.teamA.includes(res.playerId);
          const isWin = (winner === 'A' && isTeamA) || (winner === 'B' && !isTeamA);
          
          const pGoals = events.filter(e => e.playerId === res.playerId && e.type === 'goal').length;
          const pAssists = events.filter(e => e.playerId === res.playerId && e.type === 'assist').length;

          batch.update(doc(db, 'players', res.playerId), {
            'stats.matches': (p.stats.matches || 0) + 1,
            'stats.wins': isWin ? (p.stats.wins || 0) + 1 : (p.stats.wins || 0),
            'stats.goals': (p.stats.goals || 0) + pGoals,
            'stats.assists': (p.stats.assists || 0) + pAssists,
            'stats.points': (p.stats.points || 0) + res.points
          });
        }
      });

      try {
        await batch.commit();
        onClose();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'matches/players');
      }
    };

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative bg-[#1a1a1a] w-full max-w-4xl rounded-2xl md:rounded-3xl border border-white/10 overflow-hidden max-h-[95vh] flex flex-col"
        >
          <div className="p-3 md:p-5 overflow-y-auto relative">
            <div className="absolute top-3 left-3 md:top-5 md:left-5">
              <button 
                onClick={onClose}
                className="text-gray-500 hover:text-white transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <div className="absolute top-3 right-3 md:top-5 md:right-5 flex gap-2">
              <button 
                onClick={handleSave}
                className="bg-[#00ff00] hover:bg-[#00cc00] text-black px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors"
              >
                FINALIZAR PARTIDA
              </button>
            </div>

            <h3 className="text-xl md:text-2xl font-black uppercase italic mb-4 md:mb-6 text-center">PARTIDA AO VIVO</h3>
            <div className="flex items-center justify-center gap-2 md:gap-8 mb-8 py-4 bg-black/20 rounded-3xl border border-white/5 mx-2">
              <div className="flex flex-col items-end flex-1 min-w-0">
                <SoccerJersey color={teamA?.color || '#555'} size={24} className="mb-1" />
                <div className="text-[10px] md:text-sm font-black uppercase italic tracking-tight truncate w-full text-right" style={{ color: teamA?.color }}>
                  {teamA?.name || 'TIME A'}
                </div>
              </div>

              <div className="flex items-center gap-2 md:gap-4 px-4 md:px-8 py-2 bg-black/40 rounded-2xl border border-white/10 shrink-0">
                <div className="text-3xl md:text-6xl font-black tabular-nums">{sA}</div>
                <div className="text-lg md:text-2xl font-black text-[#00ff00] italic">X</div>
                <div className="text-4xl md:text-6xl font-black tabular-nums">{sB}</div>
              </div>

              <div className="flex flex-col items-start flex-1 min-w-0">
                <SoccerJersey color={teamB?.color || '#555'} size={24} className="mb-1" />
                <div className="text-[10px] md:text-sm font-black uppercase italic tracking-tight truncate w-full text-left" style={{ color: teamB?.color }}>
                  {teamB?.name || 'TIME B'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Team A Logging */}
              <div className="space-y-3">
                <div className="bg-black/20 rounded-2xl p-3 space-y-2">
                  {[
                    ...[...match.teamA].sort((a, b) => {
                      if (a === match.goalkeeperAId) return -1;
                      if (b === match.goalkeeperAId) return 1;
                      return 0;
                    }).map(pid => ({ ...players.find(x => x.id === pid), team: 'A' })),
                    { id: 'unidentified_A', name: 'Atleta Não Identificado', nickname: 'Não Identificado', team: 'A' }
                  ]
                    .filter((p): p is any => !!p.id)
                    .map(p => {
                    const teamColor = teamA?.color;
                    const pGoals = events.filter(e => e.playerId === p.id && e.type === 'goal').length;
                    const pAssists = events.filter(e => e.playerId === p.id && e.type === 'assist').length;
                    const isGoalkeeper = p.id === match.goalkeeperAId;

                    return (
                      <div key={p.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <SoccerJersey color={teamColor || '#555'} size={14} />
                          {isGoalkeeper && <GoalkeeperGlove size={14} className="shrink-0" />}
                          <span className={`text-[10px] font-bold truncate ${isGoalkeeper ? 'text-[#00ff00]' : ''}`}>
                            {p.nickname || p.name}
                          </span>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button 
                            onClick={() => addEvent(p.id, 'goal')} 
                            className="relative p-1.5 bg-[#00ff00]/10 text-[#00ff00] rounded hover:bg-[#00ff00]/20"
                          >
                            {pGoals > 0 && (
                              <span className="absolute -top-2 -right-1 text-[9px] font-black text-yellow-400 drop-shadow-md">
                                {pGoals}
                              </span>
                            )}
                            <SoccerBall size={12} />
                          </button>

                          <button 
                            onClick={() => addEvent(p.id, 'assist')} 
                            className="relative p-1.5 bg-blue-500/10 text-blue-500 rounded hover:bg-blue-500/20"
                          >
                            {pAssists > 0 && (
                              <span className="absolute -top-2 -right-1 text-[9px] font-black text-yellow-400 drop-shadow-md">
                                {pAssists}
                              </span>
                            )}
                            <SoccerCleat size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team B Logging */}
              <div className="space-y-3">
                <div className="bg-black/20 rounded-2xl p-3 space-y-2">
                  {[
                    ...[...match.teamB].sort((a, b) => {
                      if (a === match.goalkeeperBId) return -1;
                      if (b === match.goalkeeperBId) return 1;
                      return 0;
                    }).map(pid => ({ ...players.find(x => x.id === pid), team: 'B' })),
                    { id: 'unidentified_B', name: 'Atleta Não Identificado', nickname: 'Não Identificado', team: 'B' }
                  ]
                    .filter((p): p is any => !!p.id)
                    .map(p => {
                    const teamColor = teamB?.color;
                    const pGoals = events.filter(e => e.playerId === p.id && e.type === 'goal').length;
                    const pAssists = events.filter(e => e.playerId === p.id && e.type === 'assist').length;
                    const isGoalkeeper = p.id === match.goalkeeperBId;

                    return (
                      <div key={p.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <SoccerJersey color={teamColor || '#555'} size={14} />
                          {isGoalkeeper && <GoalkeeperGlove size={14} className="shrink-0" />}
                          <span className={`text-[10px] font-bold truncate ${isGoalkeeper ? 'text-[#00ff00]' : ''}`}>
                            {p.nickname || p.name}
                          </span>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button 
                            onClick={() => addEvent(p.id, 'goal')} 
                            className="relative p-1.5 bg-[#00ff00]/10 text-[#00ff00] rounded hover:bg-[#00ff00]/20"
                          >
                            {pGoals > 0 && (
                              <span className="absolute -top-2 -right-1 text-[9px] font-black text-yellow-400 drop-shadow-md">
                                {pGoals}
                              </span>
                            )}
                            <SoccerBall size={12} />
                          </button>

                          <button 
                            onClick={() => addEvent(p.id, 'assist')} 
                            className="relative p-1.5 bg-blue-500/10 text-blue-500 rounded hover:bg-blue-500/20"
                          >
                            {pAssists > 0 && (
                              <span className="absolute -top-2 -right-1 text-[9px] font-black text-yellow-400 drop-shadow-md">
                                {pAssists}
                              </span>
                            )}
                            <SoccerCleat size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Event List */}
              <div className="space-y-3 md:col-span-2">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500">Histórico de Eventos ({events.length})</h4>
                <div className="bg-black/20 rounded-2xl p-3 max-h-40 overflow-y-auto flex flex-wrap gap-2">
                  {events.map((e, i) => {
                    const p = e.playerId.startsWith('unidentified_') 
                      ? { nickname: 'Não Identificado', team: e.playerId.endsWith('_A') ? 'A' : 'B' }
                      : { ...players.find(x => x.id === e.playerId), team: match.teamA.includes(e.playerId) ? 'A' : 'B' };
                    const teamColor = p.team === 'A' ? teamA?.color : teamB?.color;
                    return (
                      <div key={i} className="flex items-center gap-2 p-1.5 bg-white/5 border border-white/5 rounded-lg">
                        <SoccerJersey color={teamColor || '#555'} size={10} />
                        {e.type === 'goal' ? <SoccerBall size={10} className="text-[#00ff00]" /> : <SoccerCleat size={10} className="text-blue-500" />}
                        <span className="text-[9px] font-bold">{p.nickname || (p as any).name}</span>
                        <button onClick={() => removeEvent(i)} className="text-red-500 hover:text-red-400"><XCircle size={12} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-black uppercase italic tracking-tight">Gestão de Partidas</h2>
            <p className="text-gray-500 text-sm">Agende jogos e registre resultados.</p>
          </div>
          
          {adminData?.role === 'master' && (
            <div className="flex items-center gap-2 bg-[#1a1a1a] p-1 rounded-xl border border-white/5">
              <MapPin className="w-4 h-4 text-[#00ff00] ml-2" />
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="bg-transparent text-xs font-bold uppercase tracking-widest py-2 px-3 outline-none border-none focus:ring-0"
              >
                <option value="all">Todos os Locais</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button 
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="bg-[#00ff00] text-black px-6 py-3 rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#00cc00] transition-all"
        >
          <Plus className="w-5 h-5" /> Nova Partida
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {matches
          .filter(m => selectedLocationId === 'all' || m.locationId === selectedLocationId)
          .map((match) => (
          <div key={match.id} className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="bg-[#222] p-4 rounded-2xl text-center min-w-[100px]">
                <div className="text-2xl font-black italic leading-none">{format(new Date(match.date + 'T00:00:00'), 'dd')}</div>
                <div className="text-[10px] uppercase font-bold text-gray-500">{format(new Date(match.date + 'T00:00:00'), 'MMM', { locale: ptBR })}</div>
              </div>
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2 uppercase italic tracking-tight">
                  <MapPin className="w-4 h-4 text-[#00ff00]" /> {getLocationName(match.locationId)}
                </h3>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <SoccerJersey color={teams.find(t => t.id === match.teamAId)?.color || '#555'} size={16} />
                    <span className="text-sm font-black uppercase italic tracking-tight">
                      {teams.find(t => t.id === match.teamAId)?.name || 'Time não definido'}
                    </span>
                    {match.goalkeeperAId && (
                      <span className="text-[8px] bg-white/5 px-1.5 py-0.5 rounded text-gray-400 font-bold">
                        GK: {players.find(p => p.id === match.goalkeeperAId)?.nickname || players.find(p => p.id === match.goalkeeperAId)?.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <SoccerJersey color={teams.find(t => t.id === match.teamBId)?.color || '#555'} size={16} />
                    <span className="text-sm font-black uppercase italic tracking-tight">
                      {teams.find(t => t.id === match.teamBId)?.name || 'Time não definido'}
                    </span>
                    {match.goalkeeperBId && (
                      <span className="text-[8px] bg-white/5 px-1.5 py-0.5 rounded text-gray-400 font-bold">
                        GK: {players.find(p => p.id === match.goalkeeperBId)?.nickname || players.find(p => p.id === match.goalkeeperBId)?.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-gray-500 mt-2 font-bold uppercase tracking-widest">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-[#00ff00]" /> {match.time}</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3 text-[#00ff00]" /> {match.teamA.length + match.teamB.length} Atletas</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 md:gap-8">
              <div className="text-center">
                <div className="text-3xl font-black italic">{match.scoreA} - {match.scoreB}</div>
                <div className={`text-[10px] uppercase font-black tracking-widest mt-1 ${match.status === 'finished' ? 'text-gray-500' : 'text-[#00ff00]'}`}>
                  {match.status === 'finished' ? 'Finalizado' : 'Em Aberto'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {match.status === 'scheduled' && (
                  <>
                    <button 
                      onClick={() => setActiveMatch(match)}
                      className="bg-white/5 hover:bg-[#00ff00]/20 hover:text-[#00ff00] p-3 rounded-xl transition-all"
                      title="Iniciar Partida"
                    >
                      <CheckCircle2 className="w-6 h-6" />
                    </button>
                    <button 
                      onClick={() => {
                        setEditingMatch(match);
                        setDate(match.date);
                        setTime(match.time);
                        setLocationId(match.locationId);
                        setIsModalOpen(true);
                      }}
                      className="bg-white/5 hover:bg-blue-500/20 hover:text-blue-500 p-3 rounded-xl transition-all"
                      title="Editar Partida"
                    >
                      <Pencil className="w-6 h-6" />
                    </button>
                  </>
                )}
                <button 
                  onClick={() => setMatchToDelete(match)}
                  className="bg-white/5 hover:bg-red-500/20 hover:text-red-500 p-3 rounded-xl transition-all"
                  title="Excluir Partida"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* New Match Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => {
              setIsModalOpen(false);
              setEditingMatch(null);
            }} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-[#1a1a1a] w-full max-w-4xl rounded-2xl md:rounded-3xl border border-white/10 overflow-hidden max-h-[95vh] overflow-y-auto"
            >
              <form onSubmit={handleCreateMatch} className="p-4 md:p-8 space-y-6 md:space-y-8">
                <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tight text-center">
                  {editingMatch ? 'Editar Partida' : 'Agendar Nova Partida'}
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center justify-between">
                      Local da Partida
                      {adminData?.role === 'master' && (
                        <Link to="/admin/locations" className="text-[#00ff00] hover:underline normal-case font-bold flex items-center gap-1">
                          <Plus className="w-2 h-2" /> Novo
                        </Link>
                      )}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {locations.map(loc => (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => setLocationId(loc.id)}
                          className={`p-3 rounded-xl border text-xs font-bold transition-all text-center ${locationId === loc.id ? 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00]' : 'bg-black/20 border-white/10 text-gray-400 hover:border-white/30'}`}
                        >
                          {loc.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Data e Horário</label>
                    <div className="flex gap-4">
                      <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="flex-1 bg-black/20 border border-white/10 rounded-xl py-3 px-4 focus:border-[#00ff00] outline-none" />
                      <input required type="time" value={time} onChange={e => setTime(e.target.value)} className="w-32 bg-black/20 border border-white/10 rounded-xl py-3 px-4 focus:border-[#00ff00] outline-none" />
                    </div>
                  </div>
                </div>

                <button type="submit" disabled={!locationId} className="w-full bg-[#00ff00] text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-[#00cc00] transition-colors disabled:bg-gray-800 disabled:text-gray-500">
                  Próximo: Selecionar Atletas
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Score Entry Modal */}
      <AnimatePresence>
        {activeMatch && <ScoreEntry match={activeMatch} onClose={() => setActiveMatch(null)} />}
      </AnimatePresence>

      {/* Player Selection Modal */}
      <PlayerSelectionModal
        isOpen={isPlayerSelectionOpen}
        onClose={() => {
          setIsPlayerSelectionOpen(false);
          setEditingMatch(null);
        }}
        onConfirm={onConfirmPlayerSelection}
        players={players}
        allTeams={teams}
        allLocations={locations}
        locationId={locationId}
        playerCount={locations.find(l => l.id === locationId)?.playerCount || 5}
        initialData={editingMatch ? {
          teamAId: editingMatch.teamAId,
          teamBId: editingMatch.teamBId,
          teamAPlayers: editingMatch.teamA,
          teamBPlayers: editingMatch.teamB,
          goalkeeperAId: editingMatch.goalkeeperAId || '',
          goalkeeperBId: editingMatch.goalkeeperBId || ''
        } : undefined}
      />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {matchToDelete && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setMatchToDelete(null)} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-[#1a1a1a] w-full max-w-md rounded-3xl border border-white/10 p-8 text-center"
            >
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-10 h-10 text-red-500" />
              </div>
              <h3 className="text-2xl font-black uppercase italic mb-2">Excluir Partida?</h3>
              <p className="text-gray-400 mb-8">
                Esta ação não pode ser desfeita. 
                {matchToDelete.status === 'finished' && ' Os pontos já atribuídos aos atletas não serão removidos automaticamente.'}
              </p>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setMatchToDelete(null)}
                  className="flex-1 bg-white/5 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDeleteMatch}
                  className="flex-1 bg-red-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-red-600 transition-colors"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
