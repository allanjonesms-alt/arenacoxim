import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, doc, updateDoc, writeBatch, deleteDoc, query, orderBy, getDoc } from 'firebase/firestore';
import { Player, Match, Location, Team, ScoringRules, AdminData } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, MapPin, Clock, Plus, Users, CheckCircle2, XCircle, Trophy, Goal, Map, ShieldCheck, X, Trash2, Pencil, Search, Layout } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SoccerJersey } from '../components/SoccerJersey';
import { SoccerBall, SoccerCleat, GoalkeeperGlove } from '../components/Icons';
import { handleFirestoreError, OperationType } from '../App';
import { Link } from 'react-router-dom';
import { PlayerSelectionModal } from '../components/PlayerSelectionModal';
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
  const [creationStep, setCreationStep] = useState(1);
  const [isPlayerSelectionOpen, setIsPlayerSelectionOpen] = useState(false);
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [matchToDelete, setMatchToDelete] = useState<Match | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [matchForLineup, setMatchForLineup] = useState<Match | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all');

  // Form State
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('19:00');
  const [locationId, setLocationId] = useState('');
  const [teamAIdInput, setTeamAIdInput] = useState('');
  const [teamBIdInput, setTeamBIdInput] = useState('');
  const [matchSubstitutesCount, setMatchSubstitutesCount] = useState<number>(0);
  const [confirmedPlayersForCreation, setConfirmedPlayersForCreation] = useState<string[]>([]);
  const [creationSearchTerm, setCreationSearchTerm] = useState('');
  const [matchChoiceType, setMatchChoiceType] = useState<'random' | 'manual'>('random');

  const isDirty = editingMatch ? (
    editingMatch.date !== date ||
    editingMatch.time !== time ||
    editingMatch.locationId !== locationId ||
    (editingMatch.teamAId || '') !== teamAIdInput ||
    (editingMatch.teamBId || '') !== teamBIdInput ||
    (editingMatch.substitutesCount || 0) !== matchSubstitutesCount ||
    JSON.stringify(editingMatch.confirmedPlayers || []) !== JSON.stringify(confirmedPlayersForCreation)
  ) : true;

  useEffect(() => {
    const qMatches = query(collection(db, 'matches'), orderBy('date', 'desc'), orderBy('time', 'desc'));
    const unsubscribeMatches = onSnapshot(qMatches, (snapshot) => {
      let matchesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      
      // Filter by location if not master admin
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        matchesList = matchesList.filter(m => m.locationId === adminData.locationId);
      }
      
      setMatches(matchesList);
      
      // Sync activeMatch if it exists to get latest data from other admins or server updates
      setActiveMatch(prev => {
        if (!prev) return null;
        const updated = matchesList.find(m => m.id === prev.id);
        return updated || prev;
      });
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
    setCreationStep(2);
  };

  const goToPlayerSelection = () => {
    setIsModalOpen(false);
    setIsPlayerSelectionOpen(true);
    setCreationStep(1);
  };

  const onConfirmPlayerSelection = async (tAId: string, tBId: string, teamAPlayers: string[], teamBPlayers: string[], goalkeeperAId: string, goalkeeperBId: string, confirmedPlayers: string[], substitutesCount: number) => {
    try {
      const matchData = {
        date,
        time,
        locationId,
        teamAId: tAId,
        teamBId: tBId,
        teamA: teamAPlayers,
        teamB: teamBPlayers,
        confirmedPlayers,
        goalkeeperAId,
        goalkeeperBId,
        substitutesCount: substitutesCount
      };

      if (editingMatch) {
        await updateDoc(doc(db, 'matches', editingMatch.id), matchData);
        if (editingMatch.status === 'finished') {
          await recalculateAllStats();
        }
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
    setTeamAIdInput('');
    setTeamBIdInput('');
    setMatchSubstitutesCount(0);
    setConfirmedPlayersForCreation([]);
    setCreationSearchTerm('');
    setEditingMatch(null);
    setCreationStep(1);
  };

  const recalculateAllStats = async () => {
    try {
      const batch = writeBatch(db);
      
      // 1. Reset all players to zero stats
      players.forEach(p => {
        batch.update(doc(db, 'players', p.id), {
          'stats.matches': 0,
          'stats.wins': 0,
          'stats.goals': 0,
          'stats.assists': 0,
          'stats.points': 0
        });
      });

      // 2. Iterate through all FINISHED matches
      const finishedMatches = matches.filter(m => m.status === 'finished');
      
      // Temporary map to accumulate points in memory before final batch update
      const playerAccumulator: Record<string, { matches: number, wins: number, goals: number, assists: number, points: number }> = {};
      
      players.forEach(p => {
        playerAccumulator[p.id] = { matches: 0, wins: 0, goals: 0, assists: 0, points: 0 };
      });

      finishedMatches.forEach(match => {
        const results = calculateMatchPoints(
          match, 
          match.scoreA, 
          match.scoreB, 
          match.events || [], 
          match.mvpId || null, 
          players, 
          scoringRules
        );

        results.forEach(res => {
          if (res.playerId.startsWith('unidentified_')) return;
          if (!playerAccumulator[res.playerId]) return;

          const acc = playerAccumulator[res.playerId];
          acc.matches += 1;
          acc.points += res.points;

          const winner = match.scoreA > match.scoreB ? 'A' : match.scoreB > match.scoreA ? 'B' : 'draw';
          const isTeamA = match.teamA.includes(res.playerId);
          const isWin = (winner === 'A' && isTeamA) || (winner === 'B' && !isTeamA);
          if (isWin) acc.wins += 1;

          const pGoals = (match.events || []).filter(e => e.playerId === res.playerId && e.type === 'goal').length;
          const pAssists = (match.events || []).filter(e => e.playerId === res.playerId && e.type === 'assist').length;
          acc.goals += pGoals;
          acc.assists += pAssists;
        });
      });

      // 3. Apply accumulated stats to batch
      Object.entries(playerAccumulator).forEach(([pid, stats]) => {
        batch.update(doc(db, 'players', pid), {
          'stats.matches': stats.matches,
          'stats.wins': stats.wins,
          'stats.goals': stats.goals,
          'stats.assists': stats.assists,
          'stats.points': stats.points
        });
      });

      await batch.commit();
    } catch (error) {
      console.error("Error recalculating stats:", error);
    }
  };

  const handleSaveDraft = async () => {
    try {
      const matchData = {
        date,
        time,
        locationId,
        teamAId: teamAIdInput || editingMatch?.teamAId || '',
        teamBId: teamBIdInput || editingMatch?.teamBId || '',
        teamA: editingMatch?.teamA || [],
        teamB: editingMatch?.teamB || [],
        confirmedPlayers: confirmedPlayersForCreation,
        goalkeeperAId: editingMatch?.goalkeeperAId || '',
        goalkeeperBId: editingMatch?.goalkeeperBId || '',
        scoreA: editingMatch?.scoreA || 0,
        scoreB: editingMatch?.scoreB || 0,
        substitutesCount: matchSubstitutesCount,
        status: editingMatch?.status || 'scheduled',
      };

      if (editingMatch) {
        await updateDoc(doc(db, 'matches', editingMatch.id), matchData);
        // If it was already finished, recalculate stats because teams/players might have changed
        if (editingMatch.status === 'finished') {
          await recalculateAllStats();
        }
      } else {
        await addDoc(collection(db, 'matches'), {
          ...matchData,
          createdAt: Date.now()
        });
      }
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, editingMatch ? OperationType.UPDATE : OperationType.CREATE, 'matches');
    }
  };
  
  const handleDeleteMatch = async () => {
    if (!matchToDelete) return;
    try {
      const wasFinished = matchToDelete.status === 'finished';
      await deleteDoc(doc(db, 'matches', matchToDelete.id));
      if (wasFinished) {
        await recalculateAllStats();
      }
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

  const startMatch = async (match: Match) => {
    setActiveMatch(match);
    if (match.status === 'scheduled') {
      try {
        await updateDoc(doc(db, 'matches', match.id), { status: 'live' });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'matches');
      }
    }
  };

  // Score Entry Modal Component
  const ScoreEntry = ({ match, onClose }: { match: Match, onClose: () => void }) => {
    const [sA, setSA] = useState(match.scoreA);
    const [sB, setSB] = useState(match.scoreB);
    const [events, setEvents] = useState<{playerId: string, type: 'goal' | 'assist'}[]>(match.events || []);
    const [isSaving, setIsSaving] = useState(false);

    const teamA = teams.find(t => t.id === match.teamAId);
    const teamB = teams.find(t => t.id === match.teamBId);

    // Auto-update score when events change
    useEffect(() => {
      const goalsA = events.filter(e => e.type === 'goal' && (match.teamA.includes(e.playerId) || e.playerId === 'unidentified_A')).length;
      const goalsB = events.filter(e => e.type === 'goal' && (match.teamB.includes(e.playerId) || e.playerId === 'unidentified_B')).length;
      setSA(goalsA);
      setSB(goalsB);
    }, [events, match.teamA, match.teamB]);

    // Auto-save events to database
    useEffect(() => {
      // Comparison to avoid redundant writes or if it's the initial load
      const currentEventsStr = JSON.stringify(events);
      const initialEventsStr = JSON.stringify(match.events || []);
      
      if (currentEventsStr === initialEventsStr) return;

      const saveProgress = async () => {
        if (isSaving) return; // Prevent concurrent saves
        setIsSaving(true);
        try {
          await updateDoc(doc(db, 'matches', match.id), {
            events: events,
            scoreA: sA,
            scoreB: sB,
            status: 'live'
          });
          // Note: When this completes, onSnapshot will trigger and update the 'match' prop
        } catch (error) {
          console.error("Failed to auto-save match progress:", error);
          // If it fails with permission error, the status might be the cause (but we just fixed rules)
        } finally {
          setIsSaving(false);
        }
      };

      const timeoutId = setTimeout(saveProgress, 1000); // 1s debounce
      return () => clearTimeout(timeoutId);
    }, [events, sA, sB, match.id, match.events]);

    // Keep internal local state in sync with server if it changed externally (but not if we are saving)
    useEffect(() => {
      if (!isSaving && JSON.stringify(match.events || []) !== JSON.stringify(events)) {
        setEvents(match.events || []);
      }
    }, [match.events]);

    const addEvent = (playerId: string, type: 'goal' | 'assist') => {
      setEvents([...events, { playerId, type }]);
    };

    const removeEvent = (index: number) => {
      setEvents(events.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
      const batch = writeBatch(db);
      
      // Calculate points using the engine (passing null for mvpId to trigger auto-calculation)
      const results = calculateMatchPoints(match, sA, sB, events, null, players, scoringRules);
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
                type="button"
                onClick={onClose}
                className="text-gray-500 hover:text-white transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <div className="absolute top-3 right-3 md:top-5 md:right-5 flex items-center gap-4">
              {isSaving ? (
                <span className="text-[9px] font-bold text-[#00ff00] animate-pulse uppercase tracking-widest">
                  Salvando...
                </span>
              ) : (
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                  Sincronizado
                </span>
              )}
              <button 
                type="button"
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
                <div className="text-xs md:text-sm font-black text-[#00ff00] italic">X</div>
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
                            type="button"
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
                            type="button"
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
                            type="button"
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
                            type="button"
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
                    const foundPlayer = players.find(x => x.id === e.playerId);
                    const p = e.playerId.startsWith('unidentified_') 
                      ? { nickname: 'Não Identificado', name: 'Não Identificado', team: e.playerId.endsWith('_A') ? 'A' : 'B' }
                      : { 
                          ...(foundPlayer || { nickname: 'Jogador Não Encontrado', name: 'Jogador Não Encontrado' }), 
                          team: match.teamA.includes(e.playerId) ? 'A' : 'B' 
                        };
                    const teamColor = p.team === 'A' ? teamA?.color : teamB?.color;
                    return (
                      <div key={i} className="flex items-center gap-2 p-1.5 bg-white/5 border border-white/5 rounded-lg">
                        <SoccerJersey color={teamColor || '#555'} size={10} />
                        {e.type === 'goal' ? <SoccerBall size={10} className="text-[#00ff00]" /> : <SoccerCleat size={10} className="text-blue-500" />}
                        <span className="text-[9px] font-bold">
                          {e.type === 'goal' ? 'Gol' : 'Assist'} de {p.nickname || p.name || '???'}: PID={e.playerId}
                        </span>
                        <button onClick={() => removeEvent(i)} className="text-red-500 hover:text-red-400 ml-auto"><XCircle size={12} /></button>
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
                className="bg-transparent text-white text-xs font-bold uppercase tracking-widest py-2 px-3 outline-none border-none focus:ring-0"
              >
                <option value="all" className="bg-[#1a1a1a] text-white">Todos os Locais</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id} className="bg-[#1a1a1a] text-white">{loc.name}</option>
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
          <div key={match.id} className={`${
            match.status === 'finished' ? 'bg-[#0f0f0f]' : 
            match.status === 'scheduled' ? 'bg-blue-600/10' : 
            'bg-[#1a1a1a]'
          } rounded-2xl border ${match.status === 'scheduled' ? 'border-blue-500/20' : 'border-white/5'} p-6 flex flex-col gap-6 transition-all`}>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className={`${match.status === 'finished' ? 'bg-[#141414]' : 'bg-[#222]'} p-4 rounded-2xl text-center min-w-[100px]`}>
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
                          GOL: {players.find(p => p.id === match.goalkeeperAId)?.nickname || players.find(p => p.id === match.goalkeeperAId)?.name}
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
                          GOL: {players.find(p => p.id === match.goalkeeperBId)?.nickname || players.find(p => p.id === match.goalkeeperBId)?.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-gray-500 mt-2 font-bold uppercase tracking-widest">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-[#00ff00]" /> {match.time}</span>
                    {match.confirmedPlayers && match.confirmedPlayers.length > (match.teamA.length + match.teamB.length) ? (
                      <>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3 text-orange-500" /> {match.confirmedPlayers.length} Selecionados</span>
                        <span className="flex items-center gap-1 text-gray-700">•</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3 text-[#00ff00]" /> {match.teamA.length + match.teamB.length} Em Campo</span>
                      </>
                    ) : (
                      <span className="flex items-center gap-1"><Users className="w-3 h-3 text-[#00ff00]" /> {match.confirmedPlayers?.length || match.teamA.length + match.teamB.length} Atletas</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 md:gap-8">
                <div className="text-center">
                  <div className="text-3xl font-black italic">{match.scoreA} <span className="text-xs text-[#00ff00] mx-1">X</span> {match.scoreB}</div>
                  <div className={`text-[10px] uppercase font-black tracking-widest mt-1 ${
                    match.status === 'finished' ? 'text-gray-500' : 
                    match.status === 'live' ? 'text-[#00ff00] animate-pulse' : 'text-blue-500'
                  }`}>
                    {match.status === 'finished' ? 'Finalizado' : match.status === 'live' ? 'Ao Vivo' : 'Em Aberto'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(match.status === 'scheduled' || match.status === 'live') && (
                    <>
                      <button 
                        onClick={() => setMatchForLineup(match)}
                        className="bg-white/5 hover:bg-[#00ff00]/20 hover:text-[#00ff00] p-3 rounded-xl transition-all"
                        title="Ver Escalação"
                      >
                        <Layout className="w-6 h-6" />
                      </button>
                      <button 
                        onClick={() => startMatch(match)}
                        className={`p-3 rounded-xl transition-all ${match.status === 'live' ? 'bg-[#00ff00]/20 text-[#00ff00]' : 'bg-white/5 hover:bg-[#00ff00]/20 hover:text-[#00ff00]'}`}
                        title={match.status === 'live' ? "Continuar Partida" : "Iniciar Partida"}
                      >
                        <CheckCircle2 className="w-6 h-6" />
                      </button>
                    </>
                  )}
                  <button 
                    onClick={() => {
                      setEditingMatch(match);
                      setDate(match.date);
                      setTime(match.time);
                      setLocationId(match.locationId);
                      setTeamAIdInput(match.teamAId || '');
                      setTeamBIdInput(match.teamBId || '');
                      setConfirmedPlayersForCreation(match.confirmedPlayers || []);
                      setMatchSubstitutesCount(match.substitutesCount || 0);
                      setIsModalOpen(true);
                    }}
                    className="bg-white/5 hover:bg-blue-500/20 hover:text-blue-500 p-3 rounded-xl transition-all"
                    title="Editar Partida"
                  >
                    <Pencil className="w-6 h-6" />
                  </button>
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

            {match.status === 'finished' && match.events && match.events.length > 0 && (
              <div className="border-t border-white/5 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-2">
                    <SoccerBall size={10} className="text-[#00ff00]" /> Gols
                  </h4>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {Object.entries(
                      match.events.filter(e => e.type === 'goal').reduce((acc, e) => {
                        acc[e.playerId] = (acc[e.playerId] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([pid, count]) => {
                      const p = pid.startsWith('unidentified_') ? { nickname: 'Gol Não Identificado', name: 'Gol Não Identificado' } : players.find(x => x.id === pid);
                      return <span key={pid} className="bg-white/5 px-2 py-1 rounded">{p ? (p.nickname || p.name) : 'Jogador Não Encontrado'} ({count})</span>
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-2">
                    <SoccerCleat size={10} className="text-blue-500" /> Assistências
                  </h4>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {Object.entries(
                      match.events.filter(e => e.type === 'assist').reduce((acc, e) => {
                        acc[e.playerId] = (acc[e.playerId] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([pid, count]) => {
                      const p = pid.startsWith('unidentified_') ? { nickname: 'Assist. Não Identificada', name: 'Assist. Não Identificada' } : players.find(x => x.id === pid);
                      return <span key={pid} className="bg-white/5 px-2 py-1 rounded">{p ? (p.nickname || p.name) : 'Jogador Não Encontrado'} ({count})</span>
                    })}
                  </div>
                </div>
              </div>
            )}
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
              setCreationStep(1);
            }} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-[#1a1a1a] w-full max-w-2xl rounded-2xl md:rounded-3xl border border-white/10 overflow-hidden max-h-[95vh] flex flex-col"
            >
              {/* Stepper Header */}
              <div className="px-8 pt-8 pb-4 flex items-center justify-between border-b border-white/5">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black italic ${creationStep >= 1 ? 'bg-[#00ff00] text-black' : 'bg-white/10 text-gray-500'}`}>1</div>
                  <div className={`w-8 h-1 bg-white/10 rounded-full overflow-hidden`}>
                    <motion.div 
                      className="h-full bg-[#00ff00]" 
                      initial={{ width: 0 }}
                      animate={{ width: creationStep >= 2 ? '100%' : '0%' }}
                    />
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black italic ${creationStep >= 2 ? 'bg-[#00ff00] text-black' : 'bg-white/10 text-gray-500'}`}>2</div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#00ff00] italic">
                    Passo {creationStep} de 3
                  </div>
                  {creationStep >= 2 && (
                    <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                      {confirmedPlayersForCreation.length} Selecionados
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 md:p-8 overflow-y-auto">
                <AnimatePresence mode="wait">
                  {creationStep === 1 ? (
                    <motion.form 
                      key="step1"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        setCreationStep(2);
                      }} 
                      className="space-y-6 md:space-y-8"
                    >
                      <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tight">
                        {editingMatch ? 'Editar Partida' : 'Agendar Nova Partida'}
                      </h3>
                      
                      <div className="space-y-6">
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
                            <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-xl py-3 px-4 focus:border-[#00ff00] outline-none text-white text-sm" />
                            <input required type="time" value={time} onChange={e => setTime(e.target.value)} className="w-32 bg-black/40 border border-white/10 rounded-xl py-3 px-4 focus:border-[#00ff00] outline-none text-white text-sm" />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center gap-2">
                              Time 1
                              {teamAIdInput && <SoccerJersey color={teams.find(t => t.id === teamAIdInput)?.color || '#555'} size={12} />}
                            </label>
                            <select
                              required
                              value={teamAIdInput}
                              onChange={(e) => setTeamAIdInput(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 focus:border-[#00ff00] outline-none text-white text-sm appearance-none cursor-pointer"
                            >
                              <option value="" className="bg-[#1a1a1a]">Selecione...</option>
                              {teams.filter(t => t.locationId === locationId).map(team => (
                                <option key={team.id} value={team.id} disabled={team.id === teamBIdInput} className="bg-[#1a1a1a]">
                                  {team.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center gap-2">
                              Time 2
                              {teamBIdInput && <SoccerJersey color={teams.find(t => t.id === teamBIdInput)?.color || '#555'} size={12} />}
                            </label>
                            <select
                              required
                              value={teamBIdInput}
                              onChange={(e) => setTeamBIdInput(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 focus:border-[#00ff00] outline-none text-white text-sm appearance-none cursor-pointer"
                            >
                              <option value="" className="bg-[#1a1a1a]">Selecione...</option>
                              {teams.filter(t => t.locationId === locationId).map(team => (
                                <option key={team.id} value={team.id} disabled={team.id === teamAIdInput} className="bg-[#1a1a1a]">
                                  {team.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-4 pt-4">
                        <button 
                          type="submit" 
                          disabled={!locationId || !teamAIdInput || !teamBIdInput} 
                          className="w-full bg-[#00ff00] text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-[#00cc00] transition-colors disabled:bg-gray-800 disabled:text-gray-500 text-xs"
                        >
                          Continuar
                        </button>
                        <div className="flex gap-4">
                          <button 
                            type="button"
                            onClick={() => {
                              setIsModalOpen(false);
                              setEditingMatch(null);
                            }}
                            className="flex-1 bg-white/5 py-4 rounded-2xl font-black uppercase tracking-widest text-gray-500 hover:bg-white/10 transition-all text-xs"
                          >
                            Cancelar
                          </button>
                          <button 
                            type="button"
                            onClick={handleSaveDraft}
                            disabled={!locationId || !isDirty}
                            className="flex-1 bg-white/5 text-orange-500 border border-orange-500/10 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-orange-500/10 transition-colors text-xs disabled:opacity-50"
                          >
                            {editingMatch ? (isDirty ? 'Salvar Alterações' : 'Salvo') : 'Salvar Draft'}
                          </button>
                        </div>
                      </div>
                    </motion.form>
                  ) : creationStep === 2 ? (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-8"
                    >
                      <div className="text-center">
                        <h3 className="text-2xl font-black uppercase italic tracking-tight">Suplentes</h3>
                        <p className="text-gray-500 text-sm mt-1">Deseja adicionar reservas para este jogo?</p>
                      </div>

                      <div className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-widest">Habilitar Suplentes</h4>
                            <p className="text-[10px] text-gray-500 uppercase font-bold mt-1">Jogadores extras por time</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const newValue = matchSubstitutesCount > 0 ? 0 : 1;
                              setMatchSubstitutesCount(newValue);
                            }}
                            className={`w-14 h-7 rounded-full transition-all relative ${matchSubstitutesCount > 0 ? 'bg-[#00ff00]' : 'bg-white/10'}`}
                          >
                            <motion.div 
                              className={`absolute top-1 w-5 h-5 rounded-full bg-white`}
                              animate={{ left: matchSubstitutesCount > 0 ? 'calc(100% - 24px)' : '4px' }}
                            />
                          </button>
                        </div>

                        {matchSubstitutesCount > 0 && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="pt-6 border-t border-white/5 space-y-4"
                          >
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Quantidade de Suplentes</label>
                              <span className="text-3xl font-black italic text-[#00ff00] tabular-nums">{matchSubstitutesCount}</span>
                            </div>
                            <input 
                              type="range" 
                              min="1" 
                              max="10" 
                              value={matchSubstitutesCount}
                              onChange={(e) => setMatchSubstitutesCount(parseInt(e.target.value))}
                              className="w-full accent-[#00ff00]"
                            />
                            <p className="text-[10px] text-gray-400 font-bold uppercase text-center bg-black/40 py-2 rounded-lg">
                              Total de <span className="text-[#00ff00]">{(locations.find(l => l.id === locationId)?.playerCount || 5) + matchSubstitutesCount}</span> atletas por time
                            </p>
                          </motion.div>
                        )}
                      </div>

                      <div className="flex flex-col gap-4">
                        <button 
                          onClick={() => setCreationStep(3)}
                          className="w-full bg-[#00ff00] text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-[#00cc00] transition-colors text-xs"
                        >
                          Próximo
                        </button>
                        <div className="flex gap-4">
                          <button 
                            onClick={() => setCreationStep(1)}
                            className="flex-1 bg-white/5 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-white/10 transition-colors text-xs"
                          >
                            Voltar
                          </button>
                          <button 
                            type="button"
                            onClick={handleSaveDraft}
                            disabled={!isDirty}
                            className="flex-1 bg-white/5 text-orange-500 border border-orange-500/10 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-orange-500/10 transition-colors text-xs disabled:opacity-50"
                          >
                            {editingMatch ? (isDirty ? 'Salvar Alterações' : 'Salvo') : 'Salvar Draft'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="text-center">
                        <h3 className="text-2xl font-black uppercase italic tracking-tight">Seleção e Times</h3>
                        <p className="text-gray-500 text-sm mt-1">Como deseja definir os times?</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setMatchChoiceType('random')}
                          className={`p-4 rounded-2xl border transition-all ${matchChoiceType === 'random' ? 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00]' : 'bg-black/20 border-white/5 text-gray-500 hover:border-white/20'}`}
                        >
                          <Users className="w-8 h-8 mx-auto mb-2" />
                          <span className="font-black uppercase text-xs">Sorteio</span>
                        </button>
                        <button
                          onClick={() => setMatchChoiceType('manual')}
                          className={`p-4 rounded-2xl border transition-all ${matchChoiceType === 'manual' ? 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00]' : 'bg-black/20 border-white/5 text-gray-500 hover:border-white/20'}`}
                        >
                          <Layout className="w-8 h-8 mx-auto mb-2" />
                          <span className="font-black uppercase text-xs">Manual</span>
                        </button>
                      </div>

                      {matchChoiceType === 'random' && (
                        <>
                          <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                            <input 
                              type="text" 
                              placeholder="Buscar atleta..."
                              value={creationSearchTerm}
                              onChange={(e) => setCreationSearchTerm(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-[#00ff00] transition-colors text-white"
                            />
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[30vh] overflow-y-auto p-2">
                            {players
                              .filter(p => p.locationId === locationId || !p.locationId)
                              .filter(p => p.name.toLowerCase().includes(creationSearchTerm.toLowerCase()) || (p.nickname && p.nickname.toLowerCase().includes(creationSearchTerm.toLowerCase())))
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map(p => {
                                const isSelected = confirmedPlayersForCreation.includes(p.id);
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => {
                                      if (isSelected) {
                                        setConfirmedPlayersForCreation(confirmedPlayersForCreation.filter(id => id !== p.id));
                                      } else {
                                        setConfirmedPlayersForCreation([...confirmedPlayersForCreation, p.id]);
                                      }
                                    }}
                                    className={`flex flex-col items-center p-3 rounded-2xl border transition-all ${
                                      isSelected ? 'bg-[#00ff00]/10 border-[#00ff00] text-[#00ff00]' : 'bg-black/20 border-white/5 text-gray-500 hover:border-white/20'
                                    }`}
                                  >
                                    {p.photoUrl ? (
                                      <img src={p.photoUrl} className="w-10 h-10 rounded-full object-cover mb-2" />
                                    ) : (
                                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-2">
                                        <Users size={16} />
                                      </div>
                                    )}
                                    <span className="text-[10px] font-black uppercase tracking-tight text-center truncate w-full">
                                      {p.nickname || p.name}
                                    </span>
                                  </button>
                                );
                              })}
                          </div>
                        </>
                      )}

                      <div className="flex flex-col gap-4">
                        <button 
                          onClick={goToPlayerSelection}
                          disabled={matchChoiceType === 'random' && confirmedPlayersForCreation.length === 0}
                          className="w-full bg-[#00ff00] text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-[#00cc00] transition-colors disabled:opacity-50 text-xs"
                        >
                          Ir para Escalação
                        </button>
                        <div className="flex gap-4">
                          <button 
                            onClick={() => setCreationStep(2)}
                            className="flex-1 bg-white/5 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-white/10 transition-colors text-xs"
                          >
                            Voltar
                          </button>
                          <button 
                            type="button"
                            onClick={handleSaveDraft}
                            disabled={!isDirty}
                            className="flex-1 bg-white/5 text-orange-500 border border-orange-500/10 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-orange-500/10 transition-colors text-xs disabled:opacity-50"
                          >
                            {editingMatch ? (isDirty ? 'Salvar Alterações' : 'Salvo') : 'Salvar Draft'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
        onSaveDraft={onConfirmPlayerSelection}
        players={players}
        allTeams={teams}
        allLocations={locations}
        locationId={locationId}
        playerCount={locations.find(l => l.id === locationId)?.playerCount || 5}
        initialStep={matchChoiceType === 'manual' ? 4 : 3} // If manual, skip to Step 4 (Team Selection). If random, stay at Step 3 (Division Mode) with Random selected.
        initialDivisionMode={matchChoiceType}
        initialData={editingMatch ? {
          teamAId: teamAIdInput || editingMatch.teamAId || '',
          teamBId: teamBIdInput || editingMatch.teamBId || '',
          teamAPlayers: editingMatch.teamA,
          teamBPlayers: editingMatch.teamB,
          confirmedPlayers: confirmedPlayersForCreation,
          substitutesCount: matchSubstitutesCount,
          goalkeeperAId: editingMatch.goalkeeperAId || '',
          goalkeeperBId: editingMatch.goalkeeperBId || ''
        } : {
          teamAId: teamAIdInput,
          teamBId: teamBIdInput,
          teamAPlayers: [],
          teamBPlayers: [],
          confirmedPlayers: confirmedPlayersForCreation,
          substitutesCount: matchSubstitutesCount,
          goalkeeperAId: '',
          goalkeeperBId: ''
        }}
      />

      {/* Lineup Preview Modal */}
      <AnimatePresence>
        {matchForLineup && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setMatchForLineup(null)} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-[#111] w-full max-w-lg rounded-[2.5rem] border border-white/10 overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-6 flex items-center justify-between border-b border-white/5 bg-black/20">
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight">Escalação das Equipes</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-[#00ff00] uppercase tracking-widest bg-[#00ff00]/10 px-2 py-0.5 rounded">
                      {getLocationName(matchForLineup.locationId)}
                    </span>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{format(new Date(matchForLineup.date + 'T00:00:00'), 'dd/MM/yyyy')}</span>
                  </div>
                </div>
                <button 
                  onClick={() => setMatchForLineup(null)}
                  className="bg-white/5 hover:bg-white/10 p-2 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Soccer Field Vector Visualization */}
              <div className="flex-1 p-6 bg-gradient-to-b from-[#111] to-black">
                <div className="relative aspect-[2/3] w-full bg-[#1a3a1a] rounded-[2rem] border-4 border-white/20 overflow-hidden shadow-2xl flex flex-col">
                  {/* Grass Pattern */}
                  <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.05) 40px, rgba(255,255,255,0.05) 80px)'
                  }} />
                  
                  {/* Field Lines */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-2 border-white/20 rounded-full pointer-events-none" />
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/20 pointer-events-none" />
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 border-b-2 border-x-2 border-white/20 pointer-events-none" />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-20 border-t-2 border-x-2 border-white/20 pointer-events-none" />

                  {/* Goalkeepers in Goal Area */}
                  {(() => {
                    const tPlayersB = matchForLineup.teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
                    const gkB = tPlayersB.find(p => p.id === matchForLineup.goalkeeperBId);
                    const tPlayersA = matchForLineup.teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
                    const gkA = tPlayersA.find(p => p.id === matchForLineup.goalkeeperAId);
                    
                    return (
                      <>
                        {gkB && (
                          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center w-14 h-14 transition-transform hover:scale-110">
                            <SoccerJersey color="#000000" size={56} />
                            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-white bg-black/40 px-1 rounded-sm drop-shadow-lg text-center whitespace-nowrap z-40">
                              {gkB.nickname || gkB.name}
                            </span>
                          </div>
                        )}
                        {gkA && (
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center w-14 h-14 transition-transform hover:scale-110">
                            <SoccerJersey color="#000000" size={56} />
                            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-white bg-black/40 px-1 rounded-sm drop-shadow-lg text-center whitespace-nowrap z-40">
                              {gkA.nickname || gkA.name}
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Match Info Header - TOP LEFT */}
                  <div className="absolute top-4 left-4 z-20 text-left">
                    <div className="inline-block bg-black/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 shadow-xl">
                      <h4 className="text-[10px] font-black uppercase italic tracking-tighter text-[#00ff00]">
                        {getLocationName(matchForLineup.locationId)}
                      </h4>
                      <p className="text-[8px] font-bold text-white/60 uppercase tracking-widest mt-0.5">
                        {format(new Date(matchForLineup.date + 'T00:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })} • {matchForLineup.time}
                      </p>
                    </div>
                  </div>

                  {/* Top Team (B) */}
                  <div className="relative flex-1 flex flex-col justify-start pt-24 gap-6 z-10">
                    {/* Team B Layout (Flipped) */}
                    {(() => {
                      const tPlayers = matchForLineup.teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
                      const gk = tPlayers.find(p => p.id === matchForLineup.goalkeeperBId);
                      const others = tPlayers.filter(p => p.id !== matchForLineup.goalkeeperBId);
                      const teamColor = teams.find(t => t.id === matchForLineup.teamBId)?.color || '#555';

                      // Sort by position
                      const lat = others.filter(p => p.position === 'lateral');
                      const zag = others.filter(p => p.position === 'zagueiro');
                      const mei = others.filter(p => p.position === 'meio-campo');
                      const atk = others.filter(p => p.position === 'centroavante');

                      // Custom lines
                      // Defense: [Lateral, Zagueiro, Lateral]
                      const rowDef: Player[] = [];
                      if (zag.length > 0) rowDef.push(zag[0]);
                      if (lat.length > 0) rowDef.unshift(lat[0]);
                      if (lat.length > 1) rowDef.push(lat[1]);
                      
                      // Fill if empty
                      const used = rowDef.map(p => p.id);
                      if (rowDef.length < 3) {
                          const remaining = others.filter(p => !used.includes(p.id));
                          rowDef.push(...remaining.slice(0, 3 - rowDef.length));
                      }
                      
                      // Midfield: [Meio, Meio]
                      const rowMid: Player[] = [];
                      const used2 = rowDef.map(p => p.id);
                      const remainingMid = others.filter(p => !used2.includes(p.id));
                      const meiPref = remainingMid.filter(p => p.position === 'meio-campo');
                      rowMid.push(...meiPref.slice(0, 2));
                      if (rowMid.length < 2) {
                          const rem = remainingMid.filter(p => !rowMid.map(x => x.id).includes(p.id));
                          rowMid.push(...rem.slice(0, 2 - rowMid.length));
                      }

                      // Attack: [Atk]
                      const used3 = [...rowDef, ...rowMid].map(p => p.id);
                      const rowAtk = others.filter(p => !used3.includes(p.id)).slice(0, 1);

                      return (
                        <>
                          <div className="flex justify-center gap-8 h-16">
                            {rowDef.map(p => (
                              <div key={p.id} className="relative flex items-center justify-center w-14 h-14 transition-transform hover:scale-110">
                                <SoccerJersey color={teamColor} size={56} />
                                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-white bg-black/40 px-1 rounded-sm drop-shadow-lg text-center whitespace-nowrap z-40">
                                  {p.nickname || p.name}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="flex justify-center gap-10 h-16">
                            {rowMid.map(p => (
                              <div key={p.id} className="relative flex items-center justify-center w-14 h-14 transition-transform hover:scale-110">
                                <SoccerJersey color={teamColor} size={56} />
                                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-white bg-black/40 px-1 rounded-sm drop-shadow-lg text-center whitespace-nowrap z-40">
                                  {p.nickname || p.name}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="flex justify-center h-16">
                            {rowAtk.map(p => (
                              <div key={p.id} className="relative flex items-center justify-center w-14 h-14 transition-transform hover:scale-110">
                                <SoccerJersey color={teamColor} size={56} />
                                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-white bg-black/40 px-1 rounded-sm drop-shadow-lg text-center whitespace-nowrap z-40">
                                  {p.nickname || p.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Bottom Team (A) */}
                  <div className="relative flex-1 flex flex-col-reverse justify-start pb-12 gap-6 z-10">
                    {/* Team A Layout */}
                    {(() => {
                      const tPlayers = matchForLineup.teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
                      const gk = tPlayers.find(p => p.id === matchForLineup.goalkeeperAId);
                      const others = tPlayers.filter(p => p.id !== matchForLineup.goalkeeperAId);
                      const teamColor = teams.find(t => t.id === matchForLineup.teamAId)?.color || '#555';

                      // Sort by position
                      const lat = others.filter(p => p.position === 'lateral');
                      const zag = others.filter(p => p.position === 'zagueiro');
                      const mei = others.filter(p => p.position === 'meio-campo');
                      const atk = others.filter(p => p.position === 'centroavante');

                      // Custom lines
                      // Defense: [Lateral, Zagueiro, Lateral]
                      const rowDef: Player[] = [];
                      if (zag.length > 0) rowDef.push(zag[0]);
                      if (lat.length > 0) rowDef.unshift(lat[0]);
                      if (lat.length > 1) rowDef.push(lat[1]);
                      
                      const used = rowDef.map(p => p.id);
                      if (rowDef.length < 3) {
                          const remaining = others.filter(p => !used.includes(p.id));
                          rowDef.push(...remaining.slice(0, 3 - rowDef.length));
                      }
                      
                      const rowMid: Player[] = [];
                      const used2 = rowDef.map(p => p.id);
                      const remainingMid = others.filter(p => !used2.includes(p.id));
                      const meiPref = remainingMid.filter(p => p.position === 'meio-campo');
                      rowMid.push(...meiPref.slice(0, 2));
                      if (rowMid.length < 2) {
                          const rem = remainingMid.filter(p => !rowMid.map(x => x.id).includes(p.id));
                          rowMid.push(...rem.slice(0, 2 - rowMid.length));
                      }

                      const used3 = [...rowDef, ...rowMid].map(p => p.id);
                      const rowAtk = others.filter(p => !used3.includes(p.id)).slice(0, 1);

                      return (
                        <>
                          <div className="flex justify-center gap-8 h-16">
                            {rowDef.map(p => (
                              <div key={p.id} className="relative flex items-center justify-center w-14 h-14 transition-transform hover:scale-110">
                                <SoccerJersey color={teamColor} size={56} />
                                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-white bg-black/40 px-1 rounded-sm drop-shadow-lg text-center whitespace-nowrap z-40">
                                  {p.nickname || p.name}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="flex justify-center gap-10 h-16">
                            {rowMid.map(p => (
                              <div key={p.id} className="relative flex items-center justify-center w-14 h-14 transition-transform hover:scale-110">
                                <SoccerJersey color={teamColor} size={56} />
                                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-white bg-black/40 px-1 rounded-sm drop-shadow-lg text-center whitespace-nowrap z-40">
                                  {p.nickname || p.name}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="flex justify-center h-16">
                            {rowAtk.map(p => (
                              <div key={p.id} className="relative flex items-center justify-center w-14 h-14 transition-transform hover:scale-110">
                                <SoccerJersey color={teamColor} size={56} />
                                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-white bg-black/40 px-1 rounded-sm drop-shadow-lg text-center whitespace-nowrap z-40">
                                  {p.nickname || p.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 bg-black/40 text-center flex flex-col gap-4">
                <button 
                  onClick={() => setMatchForLineup(null)}
                  className="w-full bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl font-black uppercase tracking-widest transition-all text-sm border border-white/10"
                >
                  Fechar
                </button>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center justify-center gap-2">
                  <SoccerBall size={10} className="text-[#00ff00]" /> Visualização Tática Gerada Automaticamente
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
