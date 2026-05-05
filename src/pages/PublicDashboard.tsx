import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, writeBatch, getDoc } from 'firebase/firestore';
import { Player, Match, Location, Team, AdminData, ScoringRules } from '../types';
import { getPositionAbbr, getPositionColor } from '../utils/playerUtils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Trophy, Star, MapPin, Calendar as CalendarIcon, ChevronRight, TrendingUp, User, X, Goal, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SoccerJersey } from '../components/SoccerJersey';
import { SoccerBall, SoccerCleat } from '../components/Icons';
import { handleFirestoreError, OperationType } from '../App';
import { calculateMatchPoints } from '../utils/scoringEngine';

interface PublicDashboardProps {
  adminData?: AdminData | null;
}

function MatchDetailsModal({ match, players, teams, locations, isAdmin, onClose }: { 
  match: Match, 
  players: Player[], 
  teams: Team[],
  locations: Location[],
  isAdmin: boolean,
  onClose: () => void 
}) {
  // Substitutions management state
  const [teamA, setTeamA] = useState(match.teamA || []);
  const [teamB, setTeamB] = useState(match.teamB || []);
  const [substitutesA, setSubstitutesA] = useState(match.substitutesA || []);
  const [substitutesB, setSubstitutesB] = useState(match.substitutesB || []);
  const [isEditingLineup, setIsEditingLineup] = useState(false);

  const [events, setEvents] = useState(match.events || []);
  const [isSaving, setIsSaving] = useState(false);

  const [scoringRules, setScoringRules] = useState<ScoringRules | null>(null);

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

  const handleSaveEvents = async () => {
    setIsSaving(true);
    console.log('Saving events:', events, 'GoalsA:', goalsA, 'GoalsB:', goalsB);
    const batch = writeBatch(db);

    try {
        // 1. Recalculate OLD points (to subtract)
        const oldResults = calculateMatchPoints(match, match.scoreA, match.scoreB, match.events || [], match.mvpId || null, players, scoringRules);

        // 2. Recalculate NEW points (to add)
        const newResults = calculateMatchPoints(match, goalsA, goalsB, events, match.mvpId || null, players, scoringRules);

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
            const newWinner = goalsA > goalsB ? 'A' : goalsB > goalsA ? 'B' : 'draw';
            
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
          scoreA: goalsA,
          scoreB: goalsB,
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
        className="absolute inset-0 bg-black/90 backdrop-blur-md" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative bg-[#1a1a1a] w-full max-w-2xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black uppercase italic tracking-tight">Resumo da Partida</h3>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 flex items-center gap-2">
              <MapPin className="w-3 h-3 text-[#00ff00]" /> {location?.name} • <CalendarIcon className="w-3 h-3 text-[#00ff00]" /> {format(new Date(match.date + 'T00:00:00'), 'dd MMM yyyy', { locale: ptBR })}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-8">
          {/* Scoreboard */}
          <div className="flex items-center justify-between bg-black/40 p-6 rounded-3xl border border-white/5">
            <div className="flex-1 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setIsEditingLineup(!isEditingLineup)}>
              <div className="flex flex-col items-center gap-2 mb-2">
                <SoccerJersey color={teamAEntity?.color || '#555'} size={32} />
                <div className="font-black uppercase tracking-tight text-sm" style={{ color: teamAEntity?.color }}>{teamAEntity?.name}</div>
              </div>
              <div className="text-4xl font-black italic">{goalsA}</div>
            </div>
            
            <div className="px-6">
              <div className="text-xl font-black text-[#00ff00] italic opacity-50">X</div>
            </div>

            <div className="flex-1 text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setIsEditingLineup(!isEditingLineup)}>
              <div className="flex flex-col items-center gap-2 mb-2">
                <SoccerJersey color={teamBEntity?.color || '#555'} size={32} />
                <div className="font-black uppercase tracking-tight text-sm" style={{ color: teamBEntity?.color }}>{teamBEntity?.name}</div>
              </div>
              <div className="text-4xl font-black italic">{goalsB}</div>
            </div>
          </div>

          {/* Events Section */}
          {/* Content Section: Events or Lineup */}
          {isEditingLineup ? (
            <div className="space-y-6">
              <h4 className="font-black uppercase tracking-widest text-center">Editar Escalação</h4>
              <div className="grid grid-cols-2 gap-4">
                {/* Team A Lineup Editor */}
                <div className="space-y-4">
                  <h5 className="text-xs font-black uppercase text-center">{teamAEntity?.name}</h5>
                  <div className="bg-black/40 p-4 rounded-xl space-y-2">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Titulares</p>
                    {teamA.map(pid => {
                      const p = players.find(x => x.id === pid);
                      return (
                        <div key={pid} className="flex justify-between text-xs p-2 bg-white/5 rounded">
                          {p?.nickname || p?.name}
                          <button onClick={() => { setTeamA(teamA.filter(id => id !== pid)); setSubstitutesA([...substitutesA, pid]); }} className="text-yellow-500">Substituir</button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-black/40 p-4 rounded-xl space-y-2">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Reservas</p>
                    {substitutesA.map(pid => {
                      const p = players.find(x => x.id === pid);
                      return (
                        <div key={pid} className="flex justify-between text-xs p-2 bg-white/5 rounded">
                          {p?.nickname || p?.name}
                          <button onClick={() => { setSubstitutesA(substitutesA.filter(id => id !== pid)); setTeamA([...teamA, pid]); }} className="text-[#00ff00]">Entrar</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Team B Lineup Editor */}
                <div className="space-y-4">
                  <h5 className="text-xs font-black uppercase text-center">{teamBEntity?.name}</h5>
                  <div className="bg-black/40 p-4 rounded-xl space-y-2">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Titulares</p>
                    {teamB.map(pid => {
                      const p = players.find(x => x.id === pid);
                      return (
                        <div key={pid} className="flex justify-between text-xs p-2 bg-white/5 rounded">
                          {p?.nickname || p?.name}
                          <button onClick={() => { setTeamB(teamB.filter(id => id !== pid)); setSubstitutesB([...substitutesB, pid]); }} className="text-yellow-500">Substituir</button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-black/40 p-4 rounded-xl space-y-2">
                    <p className="text-[10px] uppercase font-bold text-gray-500">Reservas</p>
                    {substitutesB.map(pid => {
                      const p = players.find(x => x.id === pid);
                      return (
                        <div key={pid} className="flex justify-between text-xs p-2 bg-white/5 rounded">
                          {p?.nickname || p?.name}
                          <button onClick={() => { setSubstitutesB(substitutesB.filter(id => id !== pid)); setTeamB([...teamB, pid]); }} className="text-[#00ff00]">Entrar</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Team A Events */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                  <SoccerJersey color={teamAEntity?.color || '#555'} size={16} />
                  <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">{teamAEntity?.name}</h4>
                </div>
                <div className="space-y-2">
                  {events.filter(e => teamA.includes(e.playerId) || e.playerId === 'unidentified_A').map((e, idx) => (
                    <div key={idx} className="flex justify-between text-xs p-2 bg-white/5 rounded">
                      <span className="capitalize">{e.type}</span>
                      <button onClick={() => removeEvent(events.indexOf(e))} className="text-red-500">Remover</button>
                    </div>
                  ))}
                </div>
              </div>
              {/* Team B Events */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                  <SoccerJersey color={teamBEntity?.color || '#555'} size={16} />
                  <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">{teamBEntity?.name}</h4>
                </div>
                {/* Events list for Team B */}
                <div className="space-y-2">
                  {events.filter(e => teamB.includes(e.playerId) || e.playerId === 'unidentified_B').map((e, idx) => (
                    <div key={idx} className="flex justify-between text-xs p-2 bg-white/5 rounded">
                      <span className="capitalize">{e.type}</span>
                      <button onClick={() => removeEvent(events.indexOf(e))} className="text-red-500">Remover</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* MVP Section */}
          {mvp && (
            <div className="bg-[#00ff00]/5 border border-[#00ff00]/20 p-4 rounded-2xl flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border border-[#00ff00]/30 overflow-hidden">
                  {mvp.photoUrl ? (
                    <img src={mvp.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center">
                      <User className="text-gray-600" size={24} />
                    </div>
                  )}
                </div>
                <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-1 shadow-lg">
                  <Star size={10} className="text-black fill-black" />
                </div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#00ff00] italic">Craque da Partida</div>
                <div className="text-lg font-black uppercase italic leading-none">{mvp.nickname || mvp.name}</div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {isAdmin && (
          <div className="p-6 bg-black/20 border-t border-white/5 flex items-center justify-end">
            <button
              type="button"
              onClick={handleSaveEvents}
              disabled={isSaving}
              className="bg-[#00ff00] text-black px-6 py-3 rounded-xl font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#00cc00] transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(0,255,0,0.2)]"
            >
              {isSaving ? <X className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function PublicDashboard({ adminData }: PublicDashboardProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showAllPoints, setShowAllPoints] = useState(false);
  const [showAllScorers, setShowAllScorers] = useState(false);

  useEffect(() => {
    const qMatches = query(collection(db, 'matches'), orderBy('date', 'desc'), orderBy('time', 'desc'));
    const unsubscribeMatches = onSnapshot(qMatches, (snapshot) => {
      let matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        matchesData = matchesData.filter(m => m.locationId === adminData.locationId);
      }
      
      setMatches(matchesData);
      
      // Update selected match if it exists in the new list to reflect changes
      if (selectedMatch) {
        const updated = matchesData.find(m => m.id === selectedMatch.id);
        if (updated) setSelectedMatch(updated);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'matches'));

    const qPlayers = query(collection(db, 'players'));
    const unsubscribePlayers = onSnapshot(qPlayers, (snapshot) => {
      let playersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        playersData = playersData.filter(p => p.locationId === adminData.locationId);
      }
      
      setPlayers(playersData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'players'));

    const unsubscribeLocations = onSnapshot(collection(db, 'locations'), (snapshot) => {
      setLocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'locations'));

    const unsubscribeTeams = onSnapshot(collection(db, 'teams'), (snapshot) => {
      let teamsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
      
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        teamsData = teamsData.filter(t => t.locationId === adminData.locationId);
      }
      
      setTeams(teamsData);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'teams'));

    return () => {
      unsubscribeMatches();
      unsubscribePlayers();
      unsubscribeLocations();
      unsubscribeTeams();
    };
  }, [adminData]);

  const getAveragePoints = (p: Player) => {
    if (!p.stats.matches || p.stats.matches === 0) return 0;
    return (p.stats.points || 0) / p.stats.matches;
  };

  const topScorers = [...players].sort((a, b) => b.stats.goals - a.stats.goals).slice(0, 5);
  const topPoints = [...players]
    .filter(p => p.stats.matches > 0)
    .sort((a, b) => getAveragePoints(b) - getAveragePoints(a))
    .slice(0, 5);

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

  if (loading) return null;

  const allPoints = [...players]
    .filter(p => p.stats.matches > 0)
    .sort((a, b) => getAveragePoints(b) - getAveragePoints(a));

  const allScorers = [...players]
    .filter(p => p.stats.goals > 0)
    .sort((a, b) => b.stats.goals - a.stats.goals);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Main Content: Match Results */}
      <div className="lg:col-span-8 space-y-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex flex-col">
            <h2 className="text-2xl font-black uppercase italic tracking-tight flex items-center gap-2">
              <TrendingUp className="text-[#00ff00]" /> Últimos Resultados
            </h2>
            {adminData && adminData.role !== 'master' && adminData.locationId && (
              <div className="flex items-center gap-1 text-gray-500 text-[10px] uppercase font-bold tracking-widest mt-1">
                <MapPin className="w-3 h-3 text-[#00ff00]" />
                Restrito a: {getLocationName(adminData.locationId)}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {matches.length === 0 ? (
            <div className="bg-[#1a1a1a] p-12 rounded-2xl border border-white/5 text-center">
              <CalendarIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Nenhuma partida registrada ainda.</p>
            </div>
          ) : (
            matches.map((match, idx) => (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                key={match.id} 
                className={`${
                  match.status === 'finished' ? 'bg-[#0f0f0f]' : 
                  match.status === 'scheduled' ? 'bg-blue-600/10' :
                  'bg-[#1a1a1a]'
                } rounded-xl border ${match.status === 'scheduled' ? 'border-blue-500/20' : 'border-white/5'} overflow-hidden hover:border-[#00ff00]/30 transition-colors group`}
              >
                {/* Match Header */}
                <div className={`${
                  match.status === 'finished' ? 'bg-[#141414]' : 
                  match.status === 'scheduled' ? 'bg-blue-900/30' :
                  'bg-[#222]'
                } px-4 py-2 flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-gray-400 border-b border-white/5`}>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#00ff00]" /> 
                      {getLocationName(match.locationId)}
                    </span>
                    <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3 text-[#00ff00]" /> {format(new Date(match.date + 'T00:00:00'), 'dd MMM yyyy', { locale: ptBR })}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded ${
                    match.status === 'finished' ? 'bg-gray-800 text-gray-400' : 
                    match.status === 'live' ? 'bg-[#00ff00] text-black animate-pulse font-black' : 
                    'bg-[#00ff00]/10 text-[#00ff00]'
                  }`}>
                    {match.status === 'finished' ? 'Encerrado' : match.status === 'live' ? 'AO VIVO' : 'Agendado'}
                  </span>
                </div>

                {/* Scoreboard Area */}
                <div className="p-6 flex items-center justify-between">
                  <div className="flex-1 text-center">
                    <div className="flex flex-col items-center gap-2 mb-1">
                      <SoccerJersey color={teams.find(t => t.id === match.teamAId)?.color || '#555'} size={32} />
                      <div className="text-sm md:text-lg font-black uppercase tracking-tight">
                        {teams.find(t => t.id === match.teamAId)?.name || 'Time não definido'}
                      </div>
                    </div>
                    {/* Removed athlete and goalkeeper info per user request */}
                  </div>

                  <div className="flex items-center gap-4 md:gap-6 px-4 md:px-8">
                    <div className="text-3xl md:text-5xl font-black italic text-white tabular-nums">{match.scoreA}</div>
                    <div className="text-lg md:text-xl font-black text-[#00ff00] opacity-50">X</div>
                    <div className="text-3xl md:text-5xl font-black italic text-white tabular-nums">{match.scoreB}</div>
                  </div>

                  <div className="flex-1 text-center">
                    <div className="flex flex-col items-center gap-2 mb-1">
                      <SoccerJersey color={teams.find(t => t.id === match.teamBId)?.color || '#555'} size={32} />
                      <div className="text-sm md:text-lg font-black uppercase tracking-tight">
                        {teams.find(t => t.id === match.teamBId)?.name || 'Time não definido'}
                      </div>
                    </div>
                    {/* Removed athlete and goalkeeper info per user request */}
                  </div>
                </div>

                {/* Match Footer / Action */}
                <div 
                  onClick={() => setSelectedMatch(match)}
                  className={`${
                    match.status === 'finished' ? 'bg-[#0a0a0a]' : 
                    match.status === 'scheduled' ? 'bg-blue-900/20' :
                    'bg-[#111]'
                  } px-4 py-3 flex items-center justify-center border-t border-white/5 group-hover:bg-[#00ff00]/5 transition-colors cursor-pointer`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#00ff00] flex items-center gap-1">
                    Ver Detalhes da Partida <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Match Details Modal */}
      <AnimatePresence>
        {selectedMatch && (
          <MatchDetailsModal 
            match={selectedMatch} 
            players={players}
            teams={teams}
            locations={locations}
            isAdmin={!!adminData}
            onClose={() => setSelectedMatch(null)}
          />
        )}
      </AnimatePresence>

      {/* Sidebars: Leaderboards */}
      <div className="lg:col-span-4 space-y-8">
        {/* Top Points */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="bg-[#00ff00] p-1 rounded">
                <Star className="w-4 h-4 text-black" />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest italic">Top 5 Pontuadores</h3>
            </div>
            <button 
              onClick={() => setShowAllPoints(true)}
              className="text-[10px] font-black uppercase tracking-widest text-[#00ff00] hover:underline"
            >
              Ver Tudo
            </button>
          </div>
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
            {topPoints.map((player, i) => (
              <div key={player.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-gray-600 w-4">{i + 1}</span>
                  <div className="relative">
                    {player.photoUrl ? (
                      <img src={player.photoUrl} alt="" className="w-10 h-10 rounded-full border border-white/10 object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center">
                        <User size={20} className="text-gray-600" />
                      </div>
                    )}
                    {i === 0 && <Trophy className="w-4 h-4 text-yellow-500 absolute -top-1 -right-1 drop-shadow-lg" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold leading-tight">{player.nickname || player.name}</div>
                    </div>
                    <div className={`text-[10px] uppercase font-bold tracking-tighter ${getPositionColor(player.position)}`}>
                      {getPositionAbbr(player.position)} • <span className="text-gray-500">{player.stats.matches} Partidas</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-[#00ff00] italic leading-none">{getAveragePoints(player).toFixed(1)}</div>
                  <div className="text-[8px] uppercase font-black text-gray-600 tracking-widest">Média</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Top Scorers */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="bg-[#00ff00] p-1 rounded">
                <SoccerBall size={16} className="text-black" />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest italic">Top 5 Artilheiros</h3>
            </div>
            <button 
              onClick={() => setShowAllScorers(true)}
              className="text-[10px] font-black uppercase tracking-widest text-[#00ff00] hover:underline"
            >
              Ver Tudo
            </button>
          </div>
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
            {topScorers.map((player, i) => (
              <div key={player.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-gray-600 w-4">{i + 1}</span>
                  {player.photoUrl ? (
                    <img src={player.photoUrl} alt="" className="w-10 h-10 rounded-full border border-white/10 object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center">
                      <User size={20} className="text-gray-600" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold leading-tight">{player.nickname || player.name}</div>
                    </div>
                    <div className="text-[10px] uppercase text-gray-500 font-bold tracking-tighter">{player.stats.matches} Partidas</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-white italic leading-none">{player.stats.goals}</div>
                  <div className="text-[8px] uppercase font-black text-gray-600 tracking-widest">Gols</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Stats Banner */}
        <div className="bg-gradient-to-br from-[#00ff00] to-[#00cc00] p-6 rounded-2xl text-black">
          <h4 className="font-black uppercase italic text-xl leading-tight mb-2">Estatísticas em Tempo Real</h4>
          <p className="text-xs font-bold opacity-80 mb-4">Acompanhe o desempenho individual de cada atleta da nossa arena.</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/10 p-3 rounded-xl">
              <div className="text-2xl font-black italic">{players.length}</div>
              <div className="text-[10px] uppercase font-bold opacity-60">Atletas</div>
            </div>
            <div className="bg-black/10 p-3 rounded-xl">
              <div className="text-2xl font-black italic">{matches.length}</div>
              <div className="text-[10px] uppercase font-bold opacity-60">Partidas</div>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard Modal */}
      <AnimatePresence>
        {(showAllPoints || showAllScorers) && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md" 
              onClick={() => { setShowAllPoints(false); setShowAllScorers(false); }} 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-[#1a1a1a] w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tight">
                    {showAllPoints ? 'Ranking de Pontuadores' : 'Ranking de Artilheiros'}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
                    {adminData?.locationId ? `Arena: ${getLocationName(adminData.locationId)}` : 'Todas as Arenas'}
                  </p>
                </div>
                <button type="button" onClick={() => { setShowAllPoints(false); setShowAllScorers(false); }} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="overflow-y-auto p-4 space-y-2">
                {(showAllPoints ? allPoints : allScorers).map((player, i) => (
                  <div key={player.id} className="flex items-center justify-between p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors border border-transparent hover:border-white/5">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-gray-600 w-5">{i + 1}º</span>
                      <div className="relative">
                        {player.photoUrl ? (
                          <img src={player.photoUrl} alt="" className="w-10 h-10 rounded-full border border-white/10 object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center">
                            <User size={20} className="text-gray-600" />
                          </div>
                        )}
                        {i < 3 && (
                          <div className={`absolute -top-1 -right-1 rounded-full p-0.5 shadow-lg ${i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-300' : 'bg-amber-600'}`}>
                            {i === 0 ? <Trophy size={8} className="text-black" /> : <Star size={8} className="text-black" />}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold leading-tight">{player.nickname || player.name}</div>
                        <div className={`text-[10px] uppercase font-bold tracking-tighter ${getPositionColor(player.position)}`}>
                          {getPositionAbbr(player.position)} • <span className="text-gray-500">{player.stats.matches} jogos</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-black italic leading-none ${showAllPoints ? 'text-[#00ff00]' : 'text-white'}`}>
                        {showAllPoints ? getAveragePoints(player).toFixed(1) : player.stats.goals}
                      </div>
                      <div className="text-[8px] uppercase font-black text-gray-600 tracking-widest">
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
