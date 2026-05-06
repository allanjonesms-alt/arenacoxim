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
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-md" 
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col"
        >
          {/* Header */}
          <div className="p-6 md:p-8 flex items-center justify-between border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-4">
              <button 
                type="button"
                onClick={onClose}
                className="bg-gray-100 hover:bg-gray-200 p-2.5 rounded-full transition-all active:scale-90"
              >
                <X size={20} className="text-gray-400" />
              </button>
              <div>
                <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tighter text-primary-blue">Partida ao Vivo</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className={`w-2 h-2 rounded-full ${isSaving ? 'bg-primary-yellow animate-pulse' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'}`} />
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    {isSaving ? 'Sincronizando...' : 'Conexão Segura'}
                  </span>
                </div>
              </div>
            </div>

            <button 
              type="button"
              onClick={handleSave}
              className="bg-primary-blue text-white px-6 md:px-8 py-3.5 rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all hover:bg-blue-700 shadow-lg shadow-blue-100 active:scale-95"
            >
              Finalizar Match
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/30">
            {/* Scoreboard Card */}
            <div className="bg-white rounded-[1.5rem] md:rounded-[2rem] border border-gray-100 shadow-xl shadow-gray-100/50 p-4 md:p-10 mb-8 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 relative overflow-hidden">
               {/* Team A */}
              <div className="flex flex-row md:flex-col items-center gap-4 md:gap-0 flex-1 min-w-0 z-10 w-full md:w-auto">
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-gray-50 flex items-center justify-center md:mb-4 border border-gray-100 shadow-inner flex-shrink-0">
                  <SoccerJersey color={teamA?.color || '#555'} size={32} />
                </div>
                <div className="text-[11px] md:text-sm font-black uppercase italic tracking-tighter text-left md:text-center truncate flex-1 md:w-full h-5" style={{ color: teamA?.color }}>
                  {teamA?.name || 'TIME A'}
                </div>
              </div>

              {/* Score Display */}
              <div className="flex items-center gap-4 md:gap-6 px-6 md:px-12 py-3 md:py-6 bg-gray-50 rounded-2xl md:rounded-[2rem] border border-gray-100 shrink-0 shadow-inner relative group">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-yellow text-primary-blue text-[8px] md:text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-sm">
                  PLACAR
                </div>
                <div className="text-4xl md:text-8xl font-black tabular-nums text-primary-blue drop-shadow-sm select-none">{sA}</div>
                <div className="text-lg md:text-2xl font-black text-primary-yellow italic opacity-50 select-none">VS</div>
                <div className="text-4xl md:text-8xl font-black tabular-nums text-primary-blue drop-shadow-sm select-none">{sB}</div>
              </div>

              {/* Team B */}
              <div className="flex flex-row-reverse md:flex-col items-center gap-4 md:gap-0 flex-1 min-w-0 z-10 w-full md:w-auto">
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-gray-50 flex items-center justify-center md:mb-4 border border-gray-100 shadow-inner flex-shrink-0">
                  <SoccerJersey color={teamB?.color || '#555'} size={32} />
                </div>
                <div className="text-[11px] md:text-sm font-black uppercase italic tracking-tighter text-right md:text-center truncate flex-1 md:w-full h-5" style={{ color: teamB?.color }}>
                  {teamB?.name || 'TIME B'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              {/* Team A Logging */}
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase italic tracking-widest text-primary-blue flex items-center gap-2 px-2">
                  <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: teamA?.color }} />
                  Inscrições {teamA?.name}
                </h4>
                <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-2">
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
                      <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50/50 rounded-2xl border border-gray-100 transition-all hover:border-blue-200 group">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative">
                            <SoccerJersey color={teamColor || '#555'} size={20} />
                            {isGoalkeeper && (
                              <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-sm">
                                <GoalkeeperGlove size={10} className="text-primary-blue" />
                              </div>
                            )}
                          </div>
                          <span className={`text-[12px] font-black uppercase tracking-tight truncate ${isGoalkeeper ? 'text-primary-blue' : 'text-gray-600'}`}>
                            {p.nickname || p.name}
                          </span>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button 
                            type="button"
                            onClick={() => addEvent(p.id, 'goal')} 
                            className="relative w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all active:scale-90"
                          >
                            {pGoals > 0 && (
                              <span className="absolute -top-2 -right-1 w-5 h-5 bg-primary-yellow text-primary-blue text-[10px] font-black rounded-full flex items-center justify-center shadow-md border-2 border-white">
                                {pGoals}
                              </span>
                            )}
                            <SoccerBall size={16} />
                          </button>

                          <button 
                            type="button"
                            onClick={() => addEvent(p.id, 'assist')} 
                            className="relative w-10 h-10 flex items-center justify-center bg-yellow-50 text-yellow-600 rounded-xl hover:bg-yellow-100 transition-all active:scale-90"
                          >
                            {pAssists > 0 && (
                              <span className="absolute -top-2 -right-1 w-5 h-5 bg-primary-blue text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md border-2 border-white">
                                {pAssists}
                              </span>
                            )}
                            <SoccerCleat size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team B Logging */}
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase italic tracking-widest text-primary-blue flex items-center gap-2 px-2">
                  <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: teamB?.color }} />
                  Inscrições {teamB?.name}
                </h4>
                <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm space-y-2">
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
                      <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50/50 rounded-2xl border border-gray-100 transition-all hover:border-blue-200 group">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative">
                            <SoccerJersey color={teamColor || '#555'} size={20} />
                            {isGoalkeeper && (
                              <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-sm">
                                <GoalkeeperGlove size={10} className="text-primary-blue" />
                              </div>
                            )}
                          </div>
                          <span className={`text-[12px] font-black uppercase tracking-tight truncate ${isGoalkeeper ? 'text-primary-blue' : 'text-gray-600'}`}>
                            {p.nickname || p.name}
                          </span>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button 
                            type="button"
                            onClick={() => addEvent(p.id, 'goal')} 
                            className="relative w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all active:scale-90"
                          >
                            {pGoals > 0 && (
                              <span className="absolute -top-2 -right-1 w-5 h-5 bg-primary-yellow text-primary-blue text-[10px] font-black rounded-full flex items-center justify-center shadow-md border-2 border-white">
                                {pGoals}
                              </span>
                            )}
                            <SoccerBall size={16} />
                          </button>

                          <button 
                            type="button"
                            onClick={() => addEvent(p.id, 'assist')} 
                            className="relative w-10 h-10 flex items-center justify-center bg-yellow-50 text-yellow-600 rounded-xl hover:bg-yellow-100 transition-all active:scale-90"
                          >
                            {pAssists > 0 && (
                              <span className="absolute -top-2 -right-1 w-5 h-5 bg-primary-blue text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md border-2 border-white">
                                {pAssists}
                              </span>
                            )}
                            <SoccerCleat size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Event Timeline */}
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase italic tracking-widest text-primary-blue flex items-center justify-between px-2">
                Linha do Tempo ({events.length} Eventos)
                <span className="text-[10px] font-bold text-gray-300 italic">Clique no 'X' para remover</span>
              </h4>
              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 min-h-[120px] flex flex-wrap gap-3 items-start content-start">
                {events.length === 0 && (
                  <div className="w-full flex flex-col items-center justify-center py-4 opacity-20">
                    <SoccerBall size={32} className="mb-2 text-gray-300 animate-bounce" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Aguardando lances...</p>
                  </div>
                )}
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
                    <motion.div 
                      key={i} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-3 pr-2 pl-3 py-2 bg-gray-50 border border-gray-100 rounded-2xl hover:border-red-200 transition-all group shrink-0"
                    >
                      <div className="flex items-center gap-2">
                        {e.type === 'goal' ? (
                          <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                            <SoccerBall size={14} />
                          </div>
                        ) : (
                          <div className="w-6 h-6 bg-yellow-100 text-yellow-600 rounded-lg flex items-center justify-center">
                            <SoccerCleat size={14} />
                          </div>
                        )}
                        <span className="text-[10px] font-black uppercase tracking-tight text-primary-blue max-w-[120px] truncate">
                          {p.nickname || p.name}
                        </span>
                      </div>
                      <button 
                        onClick={() => removeEvent(i)} 
                        className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        <X size={12} />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div>
            <h2 className="text-3xl font-black uppercase italic tracking-tighter text-primary-blue">Gestão de Partidas</h2>
            <p className="text-gray-500 text-sm font-medium">Agende jogos e registre resultados.</p>
          </div>
          
          {adminData?.role === 'master' && (
            <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
              <MapPin className="w-4 h-4 text-primary-yellow ml-3" />
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="bg-transparent text-primary-blue text-[10px] font-black uppercase tracking-widest py-3 px-4 outline-none border-none focus:ring-0 cursor-pointer"
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
          className="bg-primary-blue text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95"
        >
          <Plus className="w-5 h-5 text-primary-yellow" /> Nova Partida
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {matches
          .filter(m => selectedLocationId === 'all' || m.locationId === selectedLocationId)
          .length === 0 ? (
            <div className="py-20 bg-white rounded-3xl border border-gray-50 text-center shadow-sm">
              <Calendar className="w-16 h-16 text-gray-100 mx-auto mb-4" />
              <p className="text-gray-400 font-medium italic">Nenhuma partida registrada.</p>
            </div>
          ) : (
          matches
            .filter(m => selectedLocationId === 'all' || m.locationId === selectedLocationId)
            .map((match) => {
              const matchLocation = locations.find(l => l.id === match.locationId);
              return (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                key={match.id} 
                className={`${
                  match.status === 'finished' ? 'bg-white border-gray-100 grayscale-[0.3]' : 
                  match.status === 'live' ? 'bg-white border-green-200' : 
                  'bg-white border-primary-blue/5'
                } rounded-3xl border-2 p-6 md:p-8 flex flex-col gap-6 transition-all hover:shadow-xl shadow-sm relative overflow-hidden`}
              >
                {match.status === 'live' && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-red-500 text-white px-4 py-1.5 font-black uppercase italic text-[10px] tracking-widest flex items-center gap-2 animate-pulse rounded-bl-2xl">
                      <div className="w-2 h-2 rounded-full bg-white" /> AO VIVO
                    </div>
                  </div>
                )}

                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                  <div className="flex items-start md:items-center gap-4 md:gap-8 w-full">
                    <div className="relative group/logo flex-shrink-0">
                      {matchLocation?.logoUrl && (
                        <div className="absolute -top-2 -left-2 md:-top-3 md:-left-3 w-10 h-10 md:w-14 md:h-14 bg-white rounded-xl md:rounded-2xl border-2 border-gray-100 flex items-center justify-center shadow-xl z-20 p-1 md:p-2 transition-transform group-hover/logo:scale-110 drop-shadow-sm">
                          <img src={matchLocation.logoUrl} alt={matchLocation.name} className="w-full h-full object-contain" />
                        </div>
                      )}
                      <div className={`${match.status === 'finished' ? 'bg-white' : 'bg-blue-50/50'} p-3 md:p-5 rounded-2xl md:rounded-3xl text-center min-w-[70px] md:min-w-[110px] shadow-sm border border-gray-100/50 relative z-10`}>
                        <div className={`text-xl md:text-3xl font-black italic leading-none ${match.status === 'finished' ? 'text-gray-400' : 'text-primary-blue'}`}>
                          {format(new Date(match.date + 'T00:00:00'), 'dd')}
                        </div>
                        <div className="text-[9px] md:text-[11px] uppercase font-black text-gray-400 mt-1 md:mt-2 tracking-widest">
                          {format(new Date(match.date + 'T00:00:00'), 'MMM', { locale: ptBR })}
                        </div>
                      </div>
                    </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base md:text-xl font-black flex items-center gap-2 uppercase italic tracking-tighter text-primary-blue mb-2 truncate">
                      <MapPin className="w-3 h-3 md:w-4 md:h-4 text-primary-yellow flex-shrink-0" /> {getLocationName(match.locationId)}
                    </h3>
                    
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 md:gap-3 min-w-0">
                        <div className="flex-shrink-0">
                          <SoccerJersey color={teams.find(t => t.id === match.teamAId)?.color || '#555'} size={16} />
                        </div>
                        <span className="text-xs md:text-sm font-black uppercase italic tracking-tight text-gray-600 truncate">
                          {teams.find(t => t.id === match.teamAId)?.name || 'Time não definido'}
                        </span>
                        {match.goalkeeperAId && (
                          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-lg text-[9px] font-bold text-gray-400 border border-gray-100 truncate flex-shrink">
                            <ShieldCheck className="w-3 h-3 text-primary-yellow flex-shrink-0" /> {players.find(p => p.id === match.goalkeeperAId)?.nickname || players.find(p => p.id === match.goalkeeperAId)?.name}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 md:gap-3 min-w-0">
                        <div className="flex-shrink-0">
                          <SoccerJersey color={teams.find(t => t.id === match.teamBId)?.color || '#555'} size={16} />
                        </div>
                        <span className="text-xs md:text-sm font-black uppercase italic tracking-tight text-gray-600 truncate">
                          {teams.find(t => t.id === match.teamBId)?.name || 'Time não definido'}
                        </span>
                        {match.goalkeeperBId && (
                          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-lg text-[9px] font-bold text-gray-400 border border-gray-100 truncate flex-shrink">
                            <ShieldCheck className="w-3 h-3 text-primary-yellow flex-shrink-0" /> {players.find(p => p.id === match.goalkeeperBId)?.nickname || players.find(p => p.id === match.goalkeeperBId)?.name}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-[9px] md:text-[10px] text-gray-400 mt-3 font-black uppercase tracking-widest">
                      <span className="flex items-center gap-1.5"><Clock className="w-3 h-3 md:w-3.5 md:h-3.5 text-primary-yellow" /> {match.time}</span>
                      <span className="hidden xs:block w-1 h-1 bg-gray-200 rounded-full" />
                      {match.confirmedPlayers && match.confirmedPlayers.length > (match.teamA.length + match.teamB.length) ? (
                        <>
                          <span className="flex items-center gap-1.5"><Users className="w-3 h-3 md:w-3.5 md:h-3.5 text-orange-400" /> {match.confirmedPlayers.length} Selec.</span>
                          <span className="hidden xs:block w-1 h-1 bg-gray-200 rounded-full" />
                          <span className="flex items-center gap-1.5"><Users className="w-3 h-3 md:w-3.5 md:h-3.5 text-primary-blue" /> {match.teamA.length + match.teamB.length} Campo</span>
                        </>
                      ) : (
                        <span className="flex items-center gap-1.5"><Users className="w-3 h-3 md:w-3.5 md:h-3.5 text-primary-blue" /> {match.confirmedPlayers?.length || match.teamA.length + match.teamB.length} Atletas</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-row md:flex-row items-center gap-3 w-full lg:w-auto mt-2 lg:mt-0">
                  {match.status === 'finished' ? (
                    <div className="flex items-center gap-3 md:gap-4 bg-white/50 px-5 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl border border-gray-100 shadow-sm">
                      <div className="text-3xl md:text-5xl font-black italic tracking-tighter text-primary-blue tabular-nums">{match.scoreA}</div>
                      <div className="text-[10px] font-black text-primary-yellow uppercase tracking-tight opacity-30 italic">X</div>
                      <div className="text-3xl md:text-5xl font-black italic tracking-tighter text-primary-blue tabular-nums">{match.scoreB}</div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => startMatch(match)}
                      className="flex-1 lg:flex-none justify-center bg-primary-yellow text-primary-blue px-5 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black uppercase tracking-widest flex items-center gap-2 md:gap-3 hover:bg-yellow-400 transition-all shadow-xl shadow-yellow-100 active:scale-95 text-[10px] md:text-sm"
                    >
                      {match.status === 'live' ? 'Continuar Live' : 'Iniciar'} <SoccerBall className="w-4 h-4 md:w-5 md:h-5 fill-current" />
                    </button>
                  )}

                  <div className="flex items-center gap-2">
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
                      className="p-3 md:p-4 bg-white/80 hover:bg-white text-primary-blue rounded-xl md:rounded-2xl border border-gray-100 shadow-sm transition-all"
                      title="Editar Partida"
                    >
                      <Pencil className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                    <button 
                      onClick={() => setMatchToDelete(match)}
                      className="p-3 md:p-4 bg-red-50/50 hover:bg-red-100 text-red-500 rounded-xl md:rounded-2xl border border-red-100/50 shadow-sm transition-all"
                      title="Excluir Partida"
                    >
                      <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {match.status === 'finished' && match.events && match.events.length > 0 && (
                <div className="border-t border-gray-50 pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-2 pl-1">
                      <SoccerBall size={10} className="text-primary-yellow" /> Gols Marcados
                    </h4>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {Object.entries(
                        match.events.filter(e => e.type === 'goal').reduce((acc, e) => {
                          acc[e.playerId] = (acc[e.playerId] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      ).map(([pid, count]) => {
                        const p = pid.startsWith('unidentified_') ? { nickname: 'Gol Não Identificado', name: 'Gol Não Identificado' } : players.find(x => x.id === pid);
                        return (
                          <span key={pid} className="bg-gray-50 text-gray-500 font-bold px-3 py-1.5 rounded-xl border border-gray-100">
                            {p ? (p.nickname || p.name) : 'Jogador'} <span className="text-primary-blue ml-1 opacity-50">{count}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-2 pl-1">
                      <SoccerCleat size={10} className="text-primary-blue" /> Assistências
                    </h4>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {Object.entries(
                        match.events.filter(e => e.type === 'assist').reduce((acc, e) => {
                          acc[e.playerId] = (acc[e.playerId] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      ).map(([pid, count]) => {
                        const p = pid.startsWith('unidentified_') ? { nickname: 'Assist. Não Identificada', name: 'Assist. Não Identificada' } : players.find(x => x.id === pid);
                        return (
                          <span key={pid} className="bg-gray-50 text-gray-500 font-bold px-3 py-1.5 rounded-xl border border-gray-100">
                            {p ? (p.nickname || p.name) : 'Jogador'} <span className="text-primary-blue ml-1 opacity-50">{count}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
              );
            })
          )}
        </div>

      {/* New Match Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsModalOpen(false);
                setEditingMatch(null);
                setCreationStep(1);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
            >
              {/* Stepper Header */}
              <div className="px-8 pt-8 pb-4 flex items-center justify-between border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black italic shadow-inner ${creationStep >= 1 ? 'bg-primary-blue text-white' : 'bg-white text-gray-300 border border-gray-200'}`}>1</div>
                  <div className={`w-10 h-1.5 bg-gray-200 rounded-full overflow-hidden shadow-inner`}>
                    <motion.div 
                      className="h-full bg-primary-blue" 
                      initial={{ width: 0 }}
                      animate={{ width: creationStep >= 2 ? '100%' : '0%' }}
                    />
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black italic shadow-inner ${creationStep >= 2 ? 'bg-primary-blue text-white' : 'bg-white text-gray-300 border border-gray-200'}`}>2</div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-[10px] font-black uppercase tracking-widest text-primary-yellow italic bg-primary-blue px-3 py-1 rounded-lg">
                    Passo {creationStep} de 2
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-10 overflow-y-auto theme-scrollbar">
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
                      className="space-y-8"
                    >
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                          <Calendar className="w-8 h-8 text-primary-blue" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black uppercase italic tracking-tighter text-primary-blue">
                            {editingMatch ? 'Ajustar Partida' : 'Nova Partida'}
                          </h3>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Configure os detalhes básicos do jogo</p>
                        </div>
                      </div>
                      
                      <div className="space-y-8">
                        <div className="space-y-4">
                          <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center justify-between pl-1">
                            Local da Partida
                            {adminData?.role === 'master' && (
                              <Link to="/admin/locations" className="text-primary-blue hover:text-blue-700 normal-case font-black flex items-center gap-1.5 bg-primary-yellow/20 px-3 py-1 rounded-lg transition-colors">
                                <Plus size={10} className="font-bold" /> Novo Local
                              </Link>
                            )}
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {locations.map(loc => (
                              <button
                                key={loc.id}
                                type="button"
                                onClick={() => setLocationId(loc.id)}
                                className={`p-4 rounded-2xl border-2 text-xs font-black uppercase tracking-widest transition-all text-center shadow-sm ${locationId === loc.id ? 'bg-primary-blue border-primary-blue text-white' : 'bg-gray-50 border-gray-100 text-gray-400 hover:border-gray-200'}`}
                              >
                                {loc.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-3">
                            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1">Data do Jogo</label>
                            <div className="relative">
                              <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-5 focus:border-primary-blue outline-none text-primary-gray font-medium text-sm transition-all shadow-inner" />
                              <Calendar className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 w-5 h-5 pointer-events-none" />
                            </div>
                          </div>
                          <div className="space-y-3">
                            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1">Horário</label>
                            <div className="relative">
                              <input required type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-5 focus:border-primary-blue outline-none text-primary-gray font-medium text-sm transition-all shadow-inner" />
                              <Clock className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 w-5 h-5 pointer-events-none" />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-3">
                            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center justify-between pl-1">
                              Time A
                              {teamAIdInput && <SoccerJersey color={teams.find(t => t.id === teamAIdInput)?.color || '#eee'} size={14} />}
                            </label>
                            <div className="relative">
                              <select
                                required
                                value={teamAIdInput}
                                onChange={(e) => setTeamAIdInput(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-5 focus:border-primary-blue outline-none text-primary-gray font-medium text-sm appearance-none cursor-pointer transition-all shadow-inner"
                              >
                                <option value="">Automático</option>
                                {teams.filter(t => t.locationId === locationId || !locationId).map(team => (
                                  <option key={team.id} value={team.id} disabled={team.id === teamBIdInput}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                              <Users className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4 pointer-events-none" />
                            </div>
                          </div>
                          <div className="space-y-3">
                            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest flex items-center justify-between pl-1">
                              Time B
                              {teamBIdInput && <SoccerJersey color={teams.find(t => t.id === teamBIdInput)?.color || '#eee'} size={14} />}
                            </label>
                            <div className="relative">
                              <select
                                required
                                value={teamBIdInput}
                                onChange={(e) => setTeamBIdInput(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-5 focus:border-primary-blue outline-none text-primary-gray font-medium text-sm appearance-none cursor-pointer transition-all shadow-inner"
                              >
                                <option value="">Automático</option>
                                {teams.filter(t => t.locationId === locationId || !locationId).map(team => (
                                  <option key={team.id} value={team.id} disabled={team.id === teamAIdInput}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                              <Users className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4 pointer-events-none" />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6 pt-6 border-t border-gray-100">
                          <div className="flex items-center justify-between px-1">
                            <div>
                              <h4 className="text-sm font-black uppercase tracking-tight text-primary-blue">Suplentes</h4>
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Vagas de reserva por equipe</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-2xl font-black italic text-primary-blue tabular-nums">{matchSubstitutesCount}</div>
                            </div>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="20" 
                            value={matchSubstitutesCount}
                            onChange={(e) => setMatchSubstitutesCount(parseInt(e.target.value))}
                            className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-primary-blue shadow-inner"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-4 pt-6">
                        <button 
                          type="submit" 
                          disabled={!locationId} 
                          className="w-full bg-primary-blue text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:opacity-20 active:scale-95 flex items-center justify-center gap-3"
                        >
                          Continuar <Layout className="w-5 h-5 text-primary-yellow" />
                        </button>
                        <div className="flex gap-4">
                          <button 
                            type="button"
                            onClick={() => {
                              setIsModalOpen(false);
                              setEditingMatch(null);
                            }}
                            className="flex-1 bg-gray-50 border border-gray-100 text-gray-400 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-gray-100 transition-all text-[10px]"
                          >
                            Cancelar
                          </button>
                          <button 
                            type="button"
                            onClick={handleSaveDraft}
                            disabled={!locationId || !isDirty}
                            className="flex-1 bg-white border-2 border-orange-100 text-orange-500 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-orange-50 transition-colors text-[10px] disabled:opacity-50"
                          >
                            {editingMatch ? (isDirty ? 'Salvar Alterações' : 'Salvo') : 'Salvar Draft'}
                          </button>
                        </div>
                      </div>
                    </motion.form>
                  ) : (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-8"
                    >
                      <div className="flex flex-col items-center gap-4 text-center">
                        <div className="p-4 bg-blue-50 rounded-3xl border border-blue-100 shadow-inner">
                          <Users className="w-10 h-10 text-primary-blue" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black uppercase italic tracking-tighter text-primary-blue">Atletas Confirmados</h3>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">Como deseja definir as equipes?</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setMatchChoiceType('random')}
                          className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-4 shadow-sm ${matchChoiceType === 'random' ? 'bg-primary-blue border-primary-blue text-white' : 'bg-gray-50 border-gray-100 text-gray-400 hover:border-gray-200'}`}
                        >
                          <Users className={`w-8 h-8 ${matchChoiceType === 'random' ? 'text-primary-yellow' : 'text-gray-300'}`} />
                          <span className="font-black uppercase tracking-widest text-xs">Sorteio Aleatório</span>
                        </button>
                        <button
                          onClick={() => setMatchChoiceType('manual')}
                          className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-4 shadow-sm ${matchChoiceType === 'manual' ? 'bg-primary-blue border-primary-blue text-white' : 'bg-gray-50 border-gray-100 text-gray-400 hover:border-gray-200'}`}
                        >
                          <Layout className={`w-8 h-8 ${matchChoiceType === 'manual' ? 'text-primary-yellow' : 'text-gray-300'}`} />
                          <span className="font-black uppercase tracking-widest text-xs">Escalação Manual</span>
                        </button>
                      </div>

                      <div className="space-y-6">
                        <div className="relative group">
                          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 w-5 h-5 group-focus-within:text-primary-blue transition-colors" />
                          <input 
                            type="text" 
                            placeholder="Buscar atleta pela alcunha..."
                            value={creationSearchTerm}
                            onChange={(e) => setCreationSearchTerm(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 pl-14 pr-6 text-sm focus:border-primary-blue outline-none transition-all text-primary-gray font-medium shadow-inner"
                          />
                        </div>

                        <div className="bg-primary-blue/5 rounded-2xl p-4 flex items-center justify-between border border-primary-blue/10">
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary-blue">
                             {confirmedPlayersForCreation.length} Selecionados
                          </span>
                          <button 
                            onClick={() => setConfirmedPlayersForCreation([])}
                            className="text-[9px] font-black uppercase tracking-tight text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Limpar Tudo
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[35vh] overflow-y-auto pr-2 theme-scrollbar pb-2">
                          {players
                            .filter(p => !locationId || p.locationId === locationId)
                            .filter(p => (p.nickname || p.name).toLowerCase().includes(creationSearchTerm.toLowerCase()))
                            .sort((a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name))
                            .map(p => {
                              const isSelected = confirmedPlayersForCreation.includes(p.id);
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setConfirmedPlayersForCreation(prev => prev.filter(id => id !== p.id));
                                    } else {
                                      setConfirmedPlayersForCreation(prev => [...prev, p.id]);
                                    }
                                  }}
                                  className={`p-4 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 relative shadow-sm ${
                                    isSelected 
                                      ? 'bg-primary-blue border-primary-blue text-white shadow-xl shadow-blue-100' 
                                      : 'bg-gray-50 border-gray-100 text-gray-400 hover:border-gray-200 opacity-60 hover:opacity-100'
                                  }`}
                                >
                                  {isSelected && (
                                    <div className="absolute top-3 right-3">
                                      <CheckCircle2 className="w-4 h-4 text-primary-yellow" />
                                    </div>
                                  )}
                                  <div className={`w-14 h-14 rounded-full border-2 ${isSelected ? 'border-primary-yellow' : 'border-gray-200'} p-0.5 overflow-hidden transition-all group-hover:scale-105`}>
                                    {p.photoUrl ? (
                                      <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover rounded-full" />
                                    ) : (
                                      <div className="w-full h-full bg-white flex items-center justify-center rounded-full">
                                        <Users className="w-6 h-6 text-gray-100" />
                                      </div>
                                    )}
                                  </div>
                                  <span className={`text-[10px] font-black uppercase tracking-tighter truncate w-full text-center ${isSelected ? 'text-white' : 'text-gray-500'}`}>
                                    {p.nickname || p.name.split(' ')[0]}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      </div>

                      <div className="flex flex-col gap-4">
                        <button 
                          onClick={goToPlayerSelection}
                          disabled={confirmedPlayersForCreation.length === 0}
                          className="w-full bg-primary-blue text-white py-5 rounded-3xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:opacity-20 active:scale-95 flex items-center justify-center gap-3"
                        >
                          Ir para Escalação <Layout className="w-5 h-5 text-primary-yellow" />
                        </button>
                        <div className="flex gap-4">
                          <button 
                            onClick={() => setCreationStep(1)}
                            className="flex-1 bg-gray-50 border border-gray-100 text-gray-400 py-4 rounded-[2rem] font-black uppercase tracking-widest hover:bg-gray-100 transition-all text-xs"
                          >
                            Voltar
                          </button>
                          <button 
                            type="button"
                            onClick={handleSaveDraft}
                            disabled={!isDirty}
                            className="flex-1 bg-white border-2 border-orange-100 text-orange-500 py-4 rounded-[2rem] font-black uppercase tracking-widest hover:bg-orange-50 transition-colors text-xs disabled:opacity-50"
                          >
                            {editingMatch ? (isDirty ? 'Salvar' : 'Salvo') : 'Salvar Draft'}
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
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMatchForLineup(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-8 flex items-center justify-between border-b border-gray-100 bg-gray-50/50">
                <div>
                  <h3 className="text-2xl font-black uppercase italic tracking-tighter text-primary-blue">Escalação Oficial</h3>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] font-black text-primary-blue uppercase tracking-widest bg-primary-yellow px-3 py-1 rounded-lg">
                      {getLocationName(matchForLineup.locationId)}
                    </span>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> {format(new Date(matchForLineup.date + 'T00:00:00'), 'dd/MM/yyyy')}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setMatchForLineup(null)}
                  className="bg-gray-100 hover:bg-gray-200 p-3 rounded-full transition-all active:scale-95"
                >
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              {/* Soccer Field Vector Visualization */}
              <div className="flex-1 p-8 bg-gray-50">
                <div className="relative aspect-[2/3] w-full bg-[#2e7d32] rounded-[2.5rem] border-8 border-white/30 overflow-hidden shadow-2xl flex flex-col">
                  {/* Grass Pattern */}
                  <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.05) 40px, rgba(255,255,255,0.05) 80px)'
                  }} />
                  
                  {/* Field Lines */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 border-4 border-white/20 rounded-full pointer-events-none" />
                  <div className="absolute top-1/2 left-0 right-0 h-1 bg-white/20 pointer-events-none" />
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-24 border-b-4 border-x-4 border-white/20 pointer-events-none" />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64 h-24 border-t-4 border-x-4 border-white/20 pointer-events-none" />

                  {/* Goalkeepers in Goal Area */}
                  {(() => {
                    const tPlayersB = matchForLineup.teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
                    const gkB = tPlayersB.find(p => p.id === matchForLineup.goalkeeperBId);
                    const tPlayersA = matchForLineup.teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
                    const gkA = tPlayersA.find(p => p.id === matchForLineup.goalkeeperAId);
                    
                    return (
                      <>
                        {gkB && (
                          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center w-16 h-16 transition-transform hover:scale-110 drop-shadow-2xl">
                            <SoccerJersey color="#111" size={64} />
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                              {gkB.nickname || gkB.name.split(' ')[0]}
                            </span>
                          </div>
                        )}
                        {gkA && (
                          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center w-16 h-16 transition-transform hover:scale-110 drop-shadow-2xl">
                            <SoccerJersey color="#111" size={64} />
                            <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                              {gkA.nickname || gkA.name.split(' ')[0]}
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Match Info Overlay - BOTTOM LEFT */}
                  <div className="absolute bottom-6 left-6 z-20 text-left">
                    <div className="inline-block bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/20 shadow-xl">
                      <p className="text-[10px] font-black text-white/80 uppercase tracking-widest">
                        {format(new Date(matchForLineup.date + 'T00:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })} • {matchForLineup.time}
                      </p>
                    </div>
                  </div>

                  {/* Top Team (B) */}
                  <div className="relative flex-1 flex flex-col justify-start pt-24 gap-6 z-10">
                    {/* Team B Layout (Flipped) */}
                    {(() => {
                      const tPlayers = matchForLineup.teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
                      const others = tPlayers.filter(p => p.id !== matchForLineup.goalkeeperBId);
                      const teamColor = teams.find(t => t.id === matchForLineup.teamBId)?.color || '#555';

                      // Sort by position
                      const zag = others.filter(p => p.position === 'zagueiro');
                      const lat = others.filter(p => p.position === 'lateral');
                      
                      // Example layout: 3 rows
                      const row1 = others.slice(0, 3);
                      const row2 = others.slice(3, 5);
                      const row3 = others.slice(5, 6);

                      return (
                        <>
                          <div className="flex justify-center gap-10 h-16">
                            {row1.map(p => (
                              <div key={p.id} className="relative flex items-center justify-center w-16 h-16 transition-transform hover:scale-110 drop-shadow-xl">
                                <SoccerJersey color={teamColor} size={60} />
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                                  {p.nickname || p.name.split(' ')[0]}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-center gap-12 h-16">
                            {row2.map(p => (
                              <div key={p.id} className="relative flex items-center justify-center w-16 h-16 transition-transform hover:scale-110 drop-shadow-xl">
                                <SoccerJersey color={teamColor} size={60} />
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                                  {p.nickname || p.name.split(' ')[0]}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-center h-16">
                            {row3.map(p => (
                              <div key={p.id} className="relative flex items-center justify-center w-16 h-16 transition-transform hover:scale-110 drop-shadow-xl">
                                <SoccerJersey color={teamColor} size={60} />
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                                  {p.nickname || p.name.split(' ')[0]}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Bottom Team (A) */}
                  <div className="relative flex-1 flex flex-col-reverse justify-start pb-24 gap-6 z-10">
                    {/* Team A Layout */}
                    {(() => {
                      const tPlayers = matchForLineup.teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
                      const others = tPlayers.filter(p => p.id !== matchForLineup.goalkeeperAId);
                      const teamColor = teams.find(t => t.id === matchForLineup.teamAId)?.color || '#555';

                      const row1 = others.slice(0, 3);
                      const row2 = others.slice(3, 5);
                      const row3 = others.slice(5, 6);

                      return (
                        <>
                          <div className="flex justify-center gap-10 h-16">
                            {row1.map(p => (
                              <div key={p.id} className="relative flex items-center justify-center w-16 h-16 transition-transform hover:scale-110 drop-shadow-xl">
                                <SoccerJersey color={teamColor} size={60} />
                                <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                                  {p.nickname || p.name.split(' ')[0]}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-center gap-12 h-16">
                            {row2.map(p => (
                              <div key={p.id} className="relative flex items-center justify-center w-16 h-16 transition-transform hover:scale-110 drop-shadow-xl">
                                <SoccerJersey color={teamColor} size={60} />
                                <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                                  {p.nickname || p.name.split(' ')[0]}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-center h-16">
                            {row3.map(p => (
                              <div key={p.id} className="relative flex items-center justify-center w-16 h-16 transition-transform hover:scale-110 drop-shadow-xl">
                                <SoccerJersey color={teamColor} size={60} />
                                <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-md whitespace-nowrap z-40 border border-white/10">
                                  {p.nickname || p.name.split(' ')[0]}
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
              <div className="p-8 bg-gray-50 border-t border-gray-100 flex flex-col gap-6">
                <button 
                  onClick={() => setMatchForLineup(null)}
                  className="w-full bg-primary-blue text-white py-5 rounded-3xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95"
                >
                  OK, FECHAR
                </button>
                <div className="flex items-center justify-center gap-3 opacity-30">
                  <SoccerBall size={12} className="text-primary-blue" />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-blue italic">Visualização Tática</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {matchToDelete && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMatchToDelete(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-10 text-center flex flex-col items-center"
            >
              <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mb-8 shadow-inner border border-red-100">
                <Trash2 className="w-12 h-12 text-red-500" />
              </div>
              <h3 className="text-3xl font-black uppercase italic tracking-tighter text-primary-blue mb-4">Excluir Partida?</h3>
              <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest leading-relaxed mb-10 max-w-[280px]">
                Esta ação é irreversível e removerá todos os dados desta partida permanentemente. 
                {matchToDelete.status === 'finished' && ' ATENÇÃO: As pontuações atletas NÃO serão removidas automaticamente.'}
              </p>
              
              <div className="flex flex-col w-full gap-4">
                <button 
                  onClick={handleDeleteMatch}
                  className="w-full bg-red-500 text-white py-5 rounded-3xl font-black uppercase tracking-widest hover:bg-red-600 transition-all shadow-xl shadow-red-100 active:scale-95"
                >
                  SIM, EXCLUIR
                </button>
                <button 
                  onClick={() => setMatchToDelete(null)}
                  className="w-full bg-gray-50 text-gray-400 py-4 rounded-3xl font-black uppercase tracking-widest hover:bg-gray-100 transition-all text-sm"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
