import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Tournament, Location, Player, TournamentTeam, TournamentMatch } from '../types';
import { 
  Trophy, 
  Shield, 
  Calendar, 
  Users, 
  Swords, 
  Medal, 
  Star, 
  Clock, 
  CheckCircle2, 
  MapPin, 
  ChevronRight, 
  Flame, 
  Zap, 
  Award,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../App';

export default function PublicTournament() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  
  const [activeTab, setActiveTab] = useState<'standings' | 'playoffs' | 'matches' | 'teams' | 'scorers'>('standings');
  const [matchFilterStatus, setMatchFilterStatus] = useState<'all' | 'scheduled' | 'finished'>('all');
  const [teamSearchTerm, setTeamSearchTerm] = useState<string>('');

  // 1. Listen to Locations
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'locations'), (snapshot) => {
      const locList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Location));
      setLocations(locList);
      if (locList.length > 0 && !selectedLocationId) {
        setSelectedLocationId(locList[0].id);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'locations'));
    return () => unsubscribe();
  }, []);

  // 2. Listen to Tournaments
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'tournaments'), (snapshot) => {
      const tList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
      tList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setTournaments(tList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tournaments'));
    return () => unsubscribe();
  }, []);

  // 3. Listen to Players (for rosters & names)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'players'), (snapshot) => {
      const pList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Player));
      setPlayers(pList);
    }, (err) => console.error("Error fetching players:", err));
    return () => unsubscribe();
  }, []);

  // Filter tournaments for selected location
  const locationTournaments = tournaments.filter(t => !selectedLocationId || t.locationId === selectedLocationId);

  // Determine active tournament (either manually selected or first active/in-progress)
  const activeTournament = locationTournaments.find(t => t.id === selectedTournamentId) 
    || locationTournaments.find(t => t.status === 'em_andamento') 
    || locationTournaments[0] 
    || null;

  // Selected Location object
  const activeLocation = locations.find(l => l.id === (activeTournament?.locationId || selectedLocationId));

  // Helper to get player by ID
  const getPlayer = (id: string) => players.find(p => p.id === id);

  // Group Standings Calculation
  const calculateGroupStandings = (tournament: Tournament, groupId: string) => {
    const groupTeams = tournament.teams.filter(t => t.groupId === groupId);
    const standings = groupTeams.map(team => {
      let points = 0;
      let played = 0;
      let wins = 0;
      let draws = 0;
      let losses = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;

      tournament.matches
        .filter(m => m.stage === 'group' && m.groupId === groupId && m.status === 'finished')
        .forEach(m => {
          if (m.teamAId === team.id || m.teamBId === team.id) {
            played++;
            const isTeamA = m.teamAId === team.id;
            const teamGoals = isTeamA ? (m.scoreA || 0) : (m.scoreB || 0);
            const oppGoals = isTeamA ? (m.scoreB || 0) : (m.scoreA || 0);

            goalsFor += teamGoals;
            goalsAgainst += oppGoals;

            if (teamGoals > oppGoals) {
              wins++;
              points += 3;
            } else if (teamGoals === oppGoals) {
              draws++;
              points += 1;
            } else {
              losses++;
            }
          }
        });

      const goalDiff = goalsFor - goalsAgainst;

      return {
        team,
        points,
        played,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        goalDiff
      };
    });

    standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      return b.goalsFor - a.goalsFor;
    });

    return standings;
  };

  // Compute Tournament Statistics (Goals, Assists, MVPs from match events)
  const computeTournamentStats = (tournament: Tournament) => {
    const playerStatsMap: Record<string, { playerId: string; goals: number; assists: number; mvps: number }> = {};
    let totalGoalsScored = 0;
    let finishedMatchesCount = 0;

    tournament.matches.forEach(m => {
      if (m.status === 'finished') {
        finishedMatchesCount++;
        if (m.scoreA !== undefined) totalGoalsScored += m.scoreA;
        if (m.scoreB !== undefined) totalGoalsScored += m.scoreB;

        if (m.mvpId) {
          if (!playerStatsMap[m.mvpId]) {
            playerStatsMap[m.mvpId] = { playerId: m.mvpId, goals: 0, assists: 0, mvps: 0 };
          }
          playerStatsMap[m.mvpId].mvps += 1;
        }

        m.events?.forEach(evt => {
          if (!evt.playerId) return;
          if (!playerStatsMap[evt.playerId]) {
            playerStatsMap[evt.playerId] = { playerId: evt.playerId, goals: 0, assists: 0, mvps: 0 };
          }
          if (evt.type === 'goal') {
            playerStatsMap[evt.playerId].goals += 1;
          } else if (evt.type === 'assist') {
            playerStatsMap[evt.playerId].assists += 1;
          }
        });
      }
    });

    const statsList = Object.values(playerStatsMap);
    
    // Top Scorers
    const topScorers = [...statsList]
      .filter(s => s.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists);

    // Top Assists
    const topAssists = [...statsList]
      .filter(s => s.assists > 0)
      .sort((a, b) => b.assists - a.assists || b.goals - a.goals);

    // Top MVPs
    const topMvps = [...statsList]
      .filter(s => s.mvps > 0)
      .sort((a, b) => b.mvps - a.mvps || b.goals - a.goals);

    return {
      totalGoalsScored,
      finishedMatchesCount,
      topScorers,
      topAssists,
      topMvps
    };
  };

  const tournamentStats = activeTournament ? computeTournamentStats(activeTournament) : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Top Banner & Selector */}
      <div className="bg-gradient-to-r from-slate-900 via-primary-blue to-slate-950 p-6 md:p-8 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden border border-white/10">
        <div className="absolute right-0 top-0 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="bg-amber-400 p-3 rounded-2xl text-slate-950 shadow-lg shadow-amber-400/20">
                <Trophy className="w-8 h-8 stroke-[2.5]" />
              </div>
              <div>
                <span className="text-amber-400 text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
                  <Flame className="w-4 h-4 fill-amber-400" /> Tabela Oficial do Campeonato
                </span>
                <h1 className="text-2xl md:text-4xl font-black uppercase italic tracking-tight text-white">
                  {activeTournament ? activeTournament.name : 'Campeonatos da Arena'}
                </h1>
              </div>
            </div>
            {activeLocation && (
              <p className="text-xs font-bold text-gray-300 flex items-center gap-1.5 pt-1">
                <MapPin className="w-4 h-4 text-amber-400" /> Arena: <span className="text-white font-black uppercase italic">{activeLocation.name}</span>
              </p>
            )}
          </div>

          {/* Location & Tournament Pickers */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Location Selector */}
            <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20 flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <select
                value={selectedLocationId}
                onChange={(e) => {
                  setSelectedLocationId(e.target.value);
                  setSelectedTournamentId('');
                }}
                className="bg-transparent text-white font-black text-xs uppercase tracking-wider focus:outline-none cursor-pointer"
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id} className="text-slate-900">
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tournament Selector */}
            {locationTournaments.length > 0 && (
              <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <select
                  value={activeTournament?.id || ''}
                  onChange={(e) => setSelectedTournamentId(e.target.value)}
                  className="bg-transparent text-white font-black text-xs uppercase tracking-wider focus:outline-none cursor-pointer max-w-[200px] truncate"
                >
                  {locationTournaments.map(t => (
                    <option key={t.id} value={t.id} className="text-slate-900">
                      {t.name} ({t.status === 'em_andamento' ? 'Ativo' : t.status === 'finalizado' ? 'Finalizado' : 'Planejado'})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Quick Tournament Overview Badges */}
        {activeTournament && (
          <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4 relative z-10">
            <div className="bg-white/5 backdrop-blur-sm p-3.5 rounded-2xl border border-white/10">
              <span className="text-[10px] uppercase font-black tracking-widest text-gray-400 block">Formato</span>
              <span className="text-sm font-black uppercase italic text-amber-400">{activeTournament.format.replace('_', ' ')}</span>
            </div>

            <div className="bg-white/5 backdrop-blur-sm p-3.5 rounded-2xl border border-white/10">
              <span className="text-[10px] uppercase font-black tracking-widest text-gray-400 block">Equipes</span>
              <span className="text-sm font-black text-white">{activeTournament.teams?.length || 0} Times</span>
            </div>

            <div className="bg-white/5 backdrop-blur-sm p-3.5 rounded-2xl border border-white/10">
              <span className="text-[10px] uppercase font-black tracking-widest text-gray-400 block">Jogos Realizados</span>
              <span className="text-sm font-black text-emerald-400">
                {tournamentStats?.finishedMatchesCount || 0} de {activeTournament.matches?.length || 0}
              </span>
            </div>

            <div className="bg-white/5 backdrop-blur-sm p-3.5 rounded-2xl border border-white/10">
              <span className="text-[10px] uppercase font-black tracking-widest text-gray-400 block">Gols Marcados</span>
              <span className="text-sm font-black text-amber-300">{tournamentStats?.totalGoalsScored || 0} Gols</span>
            </div>
          </div>
        )}
      </div>

      {!activeTournament ? (
        <div className="bg-white p-16 rounded-[2.5rem] border-2 border-dashed border-gray-100 text-center space-y-4">
          <Trophy className="w-16 h-16 text-gray-300 mx-auto" />
          <h3 className="text-xl font-black uppercase text-gray-500 italic">Nenhum campeonato ativo encontrado</h3>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Selecione outro local acima ou aguarde o lançamento do próximo torneio pela administração da arena.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Navigation Tabs */}
          <div className="flex border-b border-gray-200 overflow-x-auto gap-2 pb-2 scrollbar-none">
            <button
              onClick={() => setActiveTab('standings')}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'standings'
                  ? 'bg-primary-blue text-white shadow-md shadow-blue-200'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-400" /> Tabela de Grupos
            </button>

            <button
              onClick={() => setActiveTab('playoffs')}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'playoffs'
                  ? 'bg-primary-blue text-white shadow-md shadow-blue-200'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Swords className="w-4 h-4 text-amber-400" /> Mata-Mata / Playoffs
            </button>

            <button
              onClick={() => setActiveTab('matches')}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'matches'
                  ? 'bg-primary-blue text-white shadow-md shadow-blue-200'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Calendar className="w-4 h-4 text-amber-400" /> Jogos ({activeTournament.matches?.length || 0})
            </button>

            <button
              onClick={() => setActiveTab('scorers')}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'scorers'
                  ? 'bg-primary-blue text-white shadow-md shadow-blue-200'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Flame className="w-4 h-4 text-amber-400" /> Artilharia & Destaques
            </button>

            <button
              onClick={() => setActiveTab('teams')}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'teams'
                  ? 'bg-primary-blue text-white shadow-md shadow-blue-200'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Users className="w-4 h-4 text-amber-400" /> Equipes ({activeTournament.teams?.length || 0})
            </button>
          </div>

          {/* TAB 1: STANDINGS */}
          {activeTab === 'standings' && (
            <div className="space-y-8">
              {activeTournament.groups.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-3xl border border-gray-100 shadow-sm">
                  <p className="text-gray-400 text-xs font-black uppercase italic">
                    Este torneio é disputado em formato de eliminatória direta (mata-mata). Consulte a aba "Mata-Mata / Playoffs".
                  </p>
                </div>
              ) : (
                activeTournament.groups.map((group) => {
                  const standings = calculateGroupStandings(activeTournament, group.id);
                  return (
                    <div key={group.id} className="bg-white rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden">
                      <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between border-b border-gray-800">
                        <h4 className="text-lg font-black uppercase italic text-amber-400 flex items-center gap-2">
                          <Shield className="w-5 h-5 fill-amber-400 text-slate-900" /> {group.name}
                        </h4>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 px-3 py-1 rounded-full border border-amber-400/30">
                          Classificam os {activeTournament.qualifiersPerGroup} primeiros
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-bold">
                          <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-widest border-b border-gray-100">
                            <tr>
                              <th className="py-3.5 px-4">#</th>
                              <th className="py-3.5 px-4">Time</th>
                              <th className="py-3.5 px-3 text-center text-primary-blue font-black">P</th>
                              <th className="py-3.5 px-3 text-center">J</th>
                              <th className="py-3.5 px-3 text-center">V</th>
                              <th className="py-3.5 px-3 text-center">E</th>
                              <th className="py-3.5 px-3 text-center">D</th>
                              <th className="py-3.5 px-3 text-center">GP</th>
                              <th className="py-3.5 px-3 text-center">GC</th>
                              <th className="py-3.5 px-3 text-center">SG</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {standings.map((st, idx) => {
                              const isQualifying = idx < (activeTournament.qualifiersPerGroup || 2);
                              return (
                                <tr 
                                  key={st.team.id} 
                                  className={`transition-colors ${isQualifying ? 'bg-amber-400/5 hover:bg-amber-400/10' : 'hover:bg-gray-50'}`}
                                >
                                  <td className="py-4 px-4 font-black">
                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${
                                      isQualifying ? 'bg-amber-400 text-slate-950 shadow-sm' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                      {idx + 1}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 font-black text-slate-900 text-sm italic uppercase flex items-center gap-2">
                                    {st.team.name}
                                    {isQualifying && (
                                      <span className="text-[9px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md uppercase">
                                        Zona de Classificação
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-4 px-3 text-center text-base font-black text-primary-blue">
                                    {st.points}
                                  </td>
                                  <td className="py-4 px-3 text-center text-gray-600">{st.played}</td>
                                  <td className="py-4 px-3 text-center text-green-600 font-bold">{st.wins}</td>
                                  <td className="py-4 px-3 text-center text-gray-500">{st.draws}</td>
                                  <td className="py-4 px-3 text-center text-red-500">{st.losses}</td>
                                  <td className="py-4 px-3 text-center text-gray-600">{st.goalsFor}</td>
                                  <td className="py-4 px-3 text-center text-gray-600">{st.goalsAgainst}</td>
                                  <td className="py-4 px-3 text-center font-black text-slate-800">
                                    {st.goalDiff > 0 ? `+${st.goalDiff}` : st.goalDiff}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: PLAYOFFS */}
          {activeTab === 'playoffs' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-black uppercase text-slate-900 italic flex items-center gap-2">
                    <Swords className="w-5 h-5 text-amber-500" /> Chaves do Mata-Mata
                  </h4>
                  <p className="text-xs text-gray-400 font-bold mt-1">
                    Confrontos eliminatórios diretos até a grande final do campeonato.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeTournament.matches.filter(m => m.stage === 'playoff').length === 0 ? (
                  <div className="col-span-2 bg-white p-12 text-center rounded-3xl border border-gray-100">
                    <p className="text-gray-400 text-xs font-bold uppercase italic">
                      Os confrontos dos playoffs ainda não foram definidos ou iniciados.
                    </p>
                  </div>
                ) : (
                  activeTournament.matches.filter(m => m.stage === 'playoff').map(match => {
                    const teamA = activeTournament.teams.find(t => t.id === match.teamAId);
                    const teamB = activeTournament.teams.find(t => t.id === match.teamBId);
                    const mvpPlayer = match.mvpId ? getPlayer(match.mvpId) : null;

                    return (
                      <div key={match.id} className="bg-white p-6 rounded-3xl border-2 border-amber-400/30 shadow-md space-y-4 relative overflow-hidden">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-3 py-1 rounded-lg">
                            {match.roundName || 'Playoff'}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {match.date} às {match.time}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-4 py-2">
                          <div className={`flex-1 text-center space-y-1 ${match.winnerTeamId === teamA?.id ? 'text-amber-500 font-black' : ''}`}>
                            <p className="text-base font-black text-slate-900 uppercase italic">{teamA?.name || 'Time A'}</p>
                            <p className="text-3xl font-black text-primary-blue">{match.scoreA ?? '-'}</p>
                          </div>

                          <span className="text-xs font-black text-amber-500 italic bg-amber-50 p-2 rounded-full">VS</span>

                          <div className={`flex-1 text-center space-y-1 ${match.winnerTeamId === teamB?.id ? 'text-amber-500 font-black' : ''}`}>
                            <p className="text-base font-black text-slate-900 uppercase italic">{teamB?.name || 'Time B'}</p>
                            <p className="text-3xl font-black text-primary-blue">{match.scoreB ?? '-'}</p>
                          </div>
                        </div>

                        {mvpPlayer && (
                          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 p-3 rounded-2xl border border-amber-200/50 flex items-center gap-3">
                            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                            <div className="text-xs">
                              <span className="text-[9px] font-black uppercase text-amber-800 tracking-wider block">Craque do Jogo</span>
                              <span className="font-black text-slate-900">{mvpPlayer.nickname || mvpPlayer.name}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: MATCHES / SCHEDULE */}
          {activeTab === 'matches' && (
            <div className="space-y-6">
              {/* Filter */}
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-black uppercase text-gray-500">Filtrar:</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMatchFilterStatus('all')}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                        matchFilterStatus === 'all' ? 'bg-primary-blue text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setMatchFilterStatus('scheduled')}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                        matchFilterStatus === 'scheduled' ? 'bg-primary-blue text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      Agendados
                    </button>
                    <button
                      onClick={() => setMatchFilterStatus('finished')}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                        matchFilterStatus === 'finished' ? 'bg-primary-blue text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      Finalizados
                    </button>
                  </div>
                </div>
              </div>

              {/* Matches List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeTournament.matches
                  .filter(m => matchFilterStatus === 'all' || m.status === matchFilterStatus)
                  .map(match => {
                    const teamA = activeTournament.teams.find(t => t.id === match.teamAId);
                    const teamB = activeTournament.teams.find(t => t.id === match.teamBId);
                    const mvpPlayer = match.mvpId ? getPlayer(match.mvpId) : null;

                    return (
                      <div key={match.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary-blue bg-blue-50 px-2.5 py-1 rounded-md">
                            {match.groupName || match.roundName || 'Fase de Grupos'}
                          </span>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                            match.status === 'finished' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {match.status === 'finished' ? 'Finalizada' : 'Agendada'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 text-center">
                            <p className="text-sm font-black text-slate-900 uppercase italic">{teamA?.name || 'Time A'}</p>
                            <p className="text-2xl font-black text-primary-blue mt-1">{match.scoreA ?? '-'}</p>
                          </div>

                          <span className="text-xs font-black text-gray-300 italic">X</span>

                          <div className="flex-1 text-center">
                            <p className="text-sm font-black text-slate-900 uppercase italic">{teamB?.name || 'Time B'}</p>
                            <p className="text-2xl font-black text-primary-blue mt-1">{match.scoreB ?? '-'}</p>
                          </div>
                        </div>

                        {/* Match MVP & Scorers if finished */}
                        {match.status === 'finished' && (
                          <div className="pt-2 border-t border-gray-100 space-y-2 text-xs">
                            {mvpPlayer && (
                              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl font-bold">
                                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                                <span>Craque do Jogo: <strong className="text-slate-900">{mvpPlayer.nickname || mvpPlayer.name}</strong></span>
                              </div>
                            )}

                            {/* Goals */}
                            {match.events && match.events.filter(e => e.type === 'goal').length > 0 && (
                              <div className="bg-gray-50 p-2.5 rounded-xl space-y-1">
                                <span className="text-[9px] font-black uppercase text-gray-400 block tracking-wider">Gols da Partida:</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {match.events.filter(e => e.type === 'goal').map((evt, idx) => {
                                    const p = getPlayer(evt.playerId);
                                    return (
                                      <span key={idx} className="bg-white border border-gray-200 px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-800">
                                        ⚽ {p ? (p.nickname || p.name) : 'Atleta'}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="text-[10px] text-gray-400 font-bold text-right pt-1">
                          {match.date} às {match.time}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* TAB 4: SCORERS & HIGHLIGHTS */}
          {activeTab === 'scorers' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Artilharia (Top Scorers) */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                  <div className="bg-amber-400 p-2 rounded-xl text-slate-950">
                    <Flame className="w-5 h-5 fill-slate-950" />
                  </div>
                  <div>
                    <h4 className="text-base font-black uppercase italic text-slate-900">Artilharia do Torneio</h4>
                    <p className="text-[10px] font-bold text-gray-400">Gols marcados nas partidas oficiais do campeonato</p>
                  </div>
                </div>

                {!tournamentStats?.topScorers || tournamentStats.topScorers.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-6 text-center">Nenhum gol registrado ainda neste torneio.</p>
                ) : (
                  <div className="space-y-2">
                    {tournamentStats.topScorers.slice(0, 10).map((st, idx) => {
                      const p = getPlayer(st.playerId);
                      return (
                        <div key={st.playerId} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl hover:bg-amber-400/10 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                              idx === 0 ? 'bg-amber-400 text-slate-950' : 'bg-gray-200 text-gray-600'
                            }`}>
                              {idx + 1}
                            </span>
                            <div>
                              <span className="font-black text-slate-900 text-sm uppercase italic block">
                                {p ? (p.nickname || p.name) : 'Atleta'}
                              </span>
                              <span className="text-[10px] font-bold text-gray-400">
                                {p?.position || 'Atleta'}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-lg font-black text-primary-blue">{st.goals}</span>
                            <span className="text-[10px] font-bold text-gray-400 block">Gols</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Assistências e MVPs */}
              <div className="space-y-6">
                {/* Assistências */}
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                  <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                    <div className="bg-primary-blue p-2 rounded-xl text-white">
                      <Zap className="w-5 h-5 fill-white" />
                    </div>
                    <div>
                      <h4 className="text-base font-black uppercase italic text-slate-900">Líderes de Assistências</h4>
                      <p className="text-[10px] font-bold text-gray-400">Passes decisivos para gol</p>
                    </div>
                  </div>

                  {!tournamentStats?.topAssists || tournamentStats.topAssists.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-4 text-center">Nenhuma assistência registrada ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {tournamentStats.topAssists.slice(0, 5).map((st, idx) => {
                        const p = getPlayer(st.playerId);
                        return (
                          <div key={st.playerId} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full bg-blue-100 text-primary-blue flex items-center justify-center text-xs font-black">
                                {idx + 1}
                              </span>
                              <span className="font-black text-slate-900 text-sm uppercase italic">
                                {p ? (p.nickname || p.name) : 'Atleta'}
                              </span>
                            </div>

                            <div className="text-right">
                              <span className="text-lg font-black text-primary-blue">{st.assists}</span>
                              <span className="text-[10px] font-bold text-gray-400 block">Passes</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* MVPs */}
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                  <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                    <div className="bg-amber-500 p-2 rounded-xl text-white">
                      <Star className="w-5 h-5 fill-white" />
                    </div>
                    <div>
                      <h4 className="text-base font-black uppercase italic text-slate-900">Craques do Torneio (MVP)</h4>
                      <p className="text-[10px] font-bold text-gray-400">Eleitos melhor jogador em campo</p>
                    </div>
                  </div>

                  {!tournamentStats?.topMvps || tournamentStats.topMvps.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-4 text-center">Nenhum MVP eleito ainda neste torneio.</p>
                  ) : (
                    <div className="space-y-2">
                      {tournamentStats.topMvps.slice(0, 5).map((st, idx) => {
                        const p = getPlayer(st.playerId);
                        return (
                          <div key={st.playerId} className="flex items-center justify-between p-3 bg-amber-50 rounded-2xl border border-amber-200/40">
                            <div className="flex items-center gap-3">
                              <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                              <span className="font-black text-slate-900 text-sm uppercase italic">
                                {p ? (p.nickname || p.name) : 'Atleta'}
                              </span>
                            </div>

                            <div className="text-right">
                              <span className="text-lg font-black text-amber-600">{st.mvps}</span>
                              <span className="text-[10px] font-bold text-amber-800 block">Vezes MVP</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: TEAMS & ROSTERS */}
          {activeTab === 'teams' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeTournament.teams.map(team => (
                <div key={team.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <h4 className="text-lg font-black uppercase italic text-slate-900">{team.name}</h4>
                    {team.groupId && (
                      <span className="text-[10px] font-black uppercase bg-amber-400 text-slate-950 px-2.5 py-1 rounded-md">
                        Grupo {team.groupId}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                      Atletas Escalados ({team.playerIds.length}):
                    </p>

                    {team.playerIds.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-2">Nenhum atleta atribuído a este elenco.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {team.playerIds.map(pId => {
                          const pl = getPlayer(pId);
                          return (
                            <li key={pId} className="text-xs font-bold text-slate-800 flex items-center justify-between bg-gray-50 px-3 py-2 rounded-xl">
                              <div className="flex items-center gap-2">
                                {pl?.photoUrl ? (
                                  <img src={pl.photoUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                                ) : (
                                  <div className="w-2 h-2 rounded-full bg-primary-blue" />
                                )}
                                <span>{pl ? (pl.nickname || pl.name) : pId}</span>
                              </div>
                              <span className="text-[9px] uppercase font-bold text-gray-400">{pl?.position || 'Atleta'}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
