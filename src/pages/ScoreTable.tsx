import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Player, AdminData, Location, ScoringRules, Match } from '../types';
import { getPositionAbbr, getPositionColor } from '../utils/playerUtils';
import { Trophy, Users, Search, MapPin, Award, Loader2, ArrowUpDown, PlaySquare, Calendar, Star, Shield, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { SoccerBall, SoccerCleat } from '../components/Icons';
import { handleFirestoreError, OperationType } from '../App';
import { calculateMatchPoints } from '../utils/scoringEngine';
import ShopeeBanner from '../components/ShopeeBanner';

const LOCAL_DEFAULT_RULES: ScoringRules = {
  id: 'scoring',
  win: 3,
  draw: 1,
  goal: 5,
  assist: 3,
  cleanSheet: 5,
  mvp: 10,
  penaltySave: 5,
  penaltyMiss: 5,
  updatedAt: Date.now()
};

const formatMonthYearStr = (yearMonth: string) => {
  if (!yearMonth || yearMonth === 'all') return 'Geral';
  const parts = yearMonth.split('-');
  if (parts.length < 2) return yearMonth;
  const year = parts[0];
  const month = parts[1];
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const monthIndex = parseInt(month, 10) - 1;
  return `${monthNames[monthIndex] || month} de ${year}`;
};

interface ScoreTableProps {
  adminData?: AdminData | null;
  sharedLocations: Location[];
  sharedScoringRules: ScoringRules | null;
}

type SortField = 'points' | 'matches' | 'wins' | 'goals' | 'assists' | 'name' | 'gp' | 'gc' | 'avgConceded' | 'sg' | 'mvps';
type SortOrder = 'asc' | 'desc';

export default function ScoreTable({ adminData, sharedLocations, sharedScoringRules }: ScoreTableProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerTeamStats, setPlayerTeamStats] = useState<Record<string, { gp: number; gc: number; sg: number }>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Set initial location based on admin profile or default to 'all'
  const isMaster = adminData?.role === 'master';
  const adminLocationId = adminData?.locationId;
  const initialLocation = (!isMaster && adminLocationId) ? adminLocationId : 'all';
  const [selectedLocationId, setSelectedLocationId] = useState<string>(initialLocation);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('points');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Month filter states
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  useEffect(() => {
    // If admin is restricted to a location, overwrite selection
    if (!isMaster && adminLocationId) {
      setSelectedLocationId(adminLocationId);
    }
  }, [adminData, isMaster, adminLocationId]);

  useEffect(() => {
    // Reset selected month when selected location changes
    setSelectedMonth('all');
  }, [selectedLocationId]);

  useEffect(() => {
    const fetchPlayers = async () => {
      setLoading(true);
      try {
        let q = query(collection(db, 'players'), orderBy('stats.points', 'desc'));
        
        // If filtering by specific location
        if (selectedLocationId !== 'all') {
          q = query(
            collection(db, 'players'), 
            where('locationId', '==', selectedLocationId)
          );
        }

        const [querySnapshot, matchesSnapshot] = await Promise.all([
          getDocs(q),
          getDocs(query(collection(db, 'matches'), where('status', '==', 'finished')))
        ]);

        const playersList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Player));

        const matchesList = matchesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Match));

        setAllMatches(matchesList);

        // Calculate team stats (GP, GC, SG) for each player
        const statsMap: Record<string, { gp: number; gc: number; sg: number }> = {};
        playersList.forEach(p => {
          statsMap[p.id] = { gp: 0, gc: 0, sg: 0 };
        });

        const activeLocationMatches = selectedLocationId === 'all'
          ? matchesList
          : matchesList.filter(m => m.locationId === selectedLocationId);

        activeLocationMatches.forEach(match => {
          const scoreA = match.scoreA ?? 0;
          const scoreB = match.scoreB ?? 0;

          (match.teamA || []).forEach(pid => {
            if (!statsMap[pid]) {
              statsMap[pid] = { gp: 0, gc: 0, sg: 0 };
            }
            statsMap[pid].gp += scoreA;
            statsMap[pid].gc += scoreB;
          });

          (match.teamB || []).forEach(pid => {
            if (!statsMap[pid]) {
              statsMap[pid] = { gp: 0, gc: 0, sg: 0 };
            }
            statsMap[pid].gp += scoreB;
            statsMap[pid].gc += scoreA;
          });
        });

        Object.keys(statsMap).forEach(pid => {
          statsMap[pid].sg = statsMap[pid].gp - statsMap[pid].gc;
        });

        // Set available months
        const months = Array.from(
          new Set(
            activeLocationMatches
              .filter(m => m.date)
              .map(m => m.date.substring(0, 7))
          )
        ).sort((a, b) => b.localeCompare(a));

        setAvailableMonths(months);
        setPlayerTeamStats(statsMap);
        setPlayers(playersList);
      } catch (error) {
        console.error("Erro ao buscar jogadores para tabela geral:", error);
        // Fallback search
        try {
          const [snapshot, matchesSnapshot] = await Promise.all([
            getDocs(collection(db, 'players')),
            getDocs(query(collection(db, 'matches'), where('status', '==', 'finished')))
          ]);

          let list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Player));
          let matchesList = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));

          if (selectedLocationId !== 'all') {
            list = list.filter(p => p.locationId === selectedLocationId);
            matchesList = matchesList.filter(m => m.locationId === selectedLocationId);
          }

          setAllMatches(matchesList);

          const statsMap: Record<string, { gp: number; gc: number; sg: number }> = {};
          list.forEach(p => {
            statsMap[p.id] = { gp: 0, gc: 0, sg: 0 };
          });

          matchesList.forEach(match => {
            const scoreA = match.scoreA ?? 0;
            const scoreB = match.scoreB ?? 0;

            (match.teamA || []).forEach(pid => {
              if (!statsMap[pid]) {
                statsMap[pid] = { gp: 0, gc: 0, sg: 0 };
              }
              statsMap[pid].gp += scoreA;
              statsMap[pid].gc += scoreB;
            });

            (match.teamB || []).forEach(pid => {
              if (!statsMap[pid]) {
                statsMap[pid] = { gp: 0, gc: 0, sg: 0 };
              }
              statsMap[pid].gp += scoreB;
              statsMap[pid].gc += scoreA;
            });
          });

          Object.keys(statsMap).forEach(pid => {
            statsMap[pid].sg = statsMap[pid].gp - statsMap[pid].gc;
          });

          const months = Array.from(
            new Set(
              matchesList
                .filter(m => m.date)
                .map(m => m.date.substring(0, 7))
            )
          ).sort((a, b) => b.localeCompare(a));

          setAvailableMonths(months);
          setPlayerTeamStats(statsMap);
          setPlayers(list);
        } catch (fallbackError) {
          handleFirestoreError(fallbackError, OperationType.LIST, 'players-score-table');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPlayers();
  }, [selectedLocationId]);

  // Compute processed players' stats dynamically for month filtering
  const processedPlayers = useMemo(() => {
    const activeRules = sharedScoringRules || LOCAL_DEFAULT_RULES;

    // Filter matches list based on selected location
    let locMatches = allMatches;
    if (selectedLocationId !== 'all') {
      locMatches = allMatches.filter(m => m.locationId === selectedLocationId);
    }

    if (selectedMonth === 'all') {
      // Map players with their standard baseline database stats
      return players.map(player => ({
        ...player,
        computedStats: {
          matches: player.stats?.matches || 0,
          wins: player.stats?.wins || 0,
          goals: player.stats?.goals || 0,
          assists: player.stats?.assists || 0,
          points: player.stats?.points || 0,
          mvps: locMatches.filter(m => m.mvpId === player.id).length,
        },
        computedTeamStats: playerTeamStats[player.id] || { gp: 0, gc: 0, sg: 0 }
      }));
    } else {
      // Dynamic computation for a specific month
      const matchesInMonth = locMatches.filter(m => m.date && m.date.substring(0, 7) === selectedMonth);

      const monthlyStatsMap: Record<string, { wins: number; goals: number; assists: number; matches: number; points: number; gp: number; gc: number; sg: number; mvps: number }> = {};
      players.forEach(p => {
        monthlyStatsMap[p.id] = { wins: 0, goals: 0, assists: 0, matches: 0, points: 0, gp: 0, gc: 0, sg: 0, mvps: 0 };
      });

      matchesInMonth.forEach(match => {
        const scoreA = match.scoreA ?? 0;
        const scoreB = match.scoreB ?? 0;

        (match.teamA || []).forEach(pid => {
          if (!monthlyStatsMap[pid]) {
            monthlyStatsMap[pid] = { wins: 0, goals: 0, assists: 0, matches: 0, points: 0, gp: 0, gc: 0, sg: 0, mvps: 0 };
          }
          monthlyStatsMap[pid].gp += scoreA;
          monthlyStatsMap[pid].gc += scoreB;
        });

        (match.teamB || []).forEach(pid => {
          if (!monthlyStatsMap[pid]) {
            monthlyStatsMap[pid] = { wins: 0, goals: 0, assists: 0, matches: 0, points: 0, gp: 0, gc: 0, sg: 0, mvps: 0 };
          }
          monthlyStatsMap[pid].gp += scoreB;
          monthlyStatsMap[pid].gc += scoreA;
        });

        const results = calculateMatchPoints(
          match,
          scoreA,
          scoreB,
          match.events || [],
          match.mvpId || null,
          players,
          activeRules
        );

        results.forEach(res => {
          if (res.playerId.startsWith('unidentified_')) return;
          if (!monthlyStatsMap[res.playerId]) {
            monthlyStatsMap[res.playerId] = { wins: 0, goals: 0, assists: 0, matches: 0, points: 0, gp: 0, gc: 0, sg: 0, mvps: 0 };
          }

          const acc = monthlyStatsMap[res.playerId];
          acc.matches += 1;
          acc.points += res.points;

          const winner = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'draw';
          const isTeamA = match.teamA.includes(res.playerId);
          const isWin = (winner === 'A' && isTeamA) || (winner === 'B' && !isTeamA);
          if (isWin) acc.wins += 1;

          const pGoals = (match.events || []).filter(e => e.playerId === res.playerId && e.type === 'goal').length;
          const pAssists = (match.events || []).filter(e => e.playerId === res.playerId && e.type === 'assist').length;
          acc.goals += pGoals;
          acc.assists += pAssists;

          if (match.mvpId === res.playerId) {
            acc.mvps += 1;
          }
        });
      });

      // Compute sg (saldo de gols)
      Object.keys(monthlyStatsMap).forEach(pid => {
        monthlyStatsMap[pid].sg = monthlyStatsMap[pid].gp - monthlyStatsMap[pid].gc;
      });

      return players.map(player => {
        const stats = monthlyStatsMap[player.id] || { wins: 0, goals: 0, assists: 0, matches: 0, points: 0, gp: 0, gc: 0, sg: 0, mvps: 0 };
        return {
          ...player,
          computedStats: {
            matches: stats.matches,
            wins: stats.wins,
            goals: stats.goals,
            assists: stats.assists,
            points: stats.points,
            mvps: stats.mvps,
          },
          computedTeamStats: {
            gp: stats.gp,
            gc: stats.gc,
            sg: stats.sg,
          }
        };
      });
    }
  }, [players, allMatches, selectedLocationId, selectedMonth, sharedScoringRules, playerTeamStats]);

  // Handle columns sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc'); // Default to descending on first click
    }
  };

  // Filter and sort players list
  const filteredPlayers = processedPlayers
    .filter(player => {
      const searchLower = searchTerm.toLowerCase();
      const nameMatch = player.name?.toLowerCase().includes(searchLower) || false;
      const nicknameMatch = player.nickname?.toLowerCase().includes(searchLower) || false;
      return nameMatch || nicknameMatch;
    })
    .sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      switch (sortField) {
        case 'points':
          valA = a.computedStats?.points ?? 0;
          valB = b.computedStats?.points ?? 0;
          break;
        case 'matches':
          valA = a.computedStats?.matches ?? 0;
          valB = b.computedStats?.matches ?? 0;
          break;
        case 'wins':
          valA = a.computedStats?.wins ?? 0;
          valB = b.computedStats?.wins ?? 0;
          break;
        case 'goals':
          valA = a.computedStats?.goals ?? 0;
          valB = b.computedStats?.goals ?? 0;
          break;
        case 'assists':
          valA = a.computedStats?.assists ?? 0;
          valB = b.computedStats?.assists ?? 0;
          break;
        case 'mvps':
          valA = a.computedStats?.mvps ?? 0;
          valB = b.computedStats?.mvps ?? 0;
          break;
        case 'name':
          valA = a.nickname || a.name || '';
          valB = b.nickname || b.name || '';
          break;
        case 'gp':
          valA = a.computedTeamStats?.gp ?? 0;
          valB = b.computedTeamStats?.gp ?? 0;
          break;
        case 'gc':
          valA = a.computedTeamStats?.gc ?? 0;
          valB = b.computedTeamStats?.gc ?? 0;
          break;
        case 'avgConceded':
          const isGkA = a.position === 'goleiro';
          const isGkB = b.position === 'goleiro';
          valA = isGkA ? ((a.computedTeamStats?.gc ?? 0) / (a.computedStats?.matches || 1)) : (sortOrder === 'asc' ? 999999 : -999999);
          valB = isGkB ? ((b.computedTeamStats?.gc ?? 0) / (b.computedStats?.matches || 1)) : (sortOrder === 'asc' ? 999999 : -999999);
          break;
        case 'sg':
          valA = a.computedTeamStats?.sg ?? 0;
          valB = b.computedTeamStats?.sg ?? 0;
          break;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else {
        return sortOrder === 'asc' 
          ? (valA as number) - (valB as number) 
          : (valB as number) - (valA as number);
      }
    });

  const getRuleVal = (key: keyof ScoringRules) => {
    return sharedScoringRules ? (sharedScoringRules[key] ?? 0) : 0;
  };

  const activeLocationName = sharedLocations.find(l => l.id === selectedLocationId)?.name || 'Todos os Locais';

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Banner */}
      {!window.location.pathname.startsWith('/admin') && <ShopeeBanner />}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic tracking-tight text-primary-blue">
            Tabela Geral de Pontuação
          </h2>
          <p className="text-gray-500 text-sm font-medium">
            Tabela de classificação detalhada e soma total de pontos obtidos por arena.
          </p>
        </div>

        {/* Info Rules Box */}
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex flex-wrap gap-x-6 gap-y-2 text-xs text-amber-900 justify-center md:justify-start items-center">
          <span className="font-extrabold uppercase italic tracking-wider flex items-center gap-1">
            <Info className="w-4 h-4 text-amber-600" /> Itens de Pontuação:
          </span>
          <div className="flex flex-wrap gap-4 font-bold text-[11px] uppercase">
            <span className="flex items-center gap-1">🏆 Vitória: <strong className="text-amber-700">+{getRuleVal('win') || 3}</strong></span>
            <span className="flex items-center gap-1">⚽ Gol: <strong className="text-amber-700">+{getRuleVal('goal') || 5}</strong></span>
            <span className="flex items-center gap-1">👟 Assistência: <strong className="text-amber-700">+{getRuleVal('assist') || 3}</strong></span>
            <span className="flex items-center gap-1">🛡️ Defesa Invicta: <strong className="text-amber-700">Até +{getRuleVal('cleanSheet') || 7}</strong></span>
            <span className="flex items-center gap-1">⭐ Craque: <strong className="text-amber-700">+{getRuleVal('mvp') || 10}</strong></span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        {/* Search and Month group */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-grow max-w-2xl">
          {/* Search input */}
          <div className="relative flex-grow">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Pesquisar por nome ou apelido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold placeholder-gray-400 focus:outline-none focus:border-primary-blue focus:bg-white transition-all"
            />
          </div>

          {/* Month selector */}
          <div className="relative shrink-0 min-w-[220px]">
            <Calendar className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-primary-blue" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full pl-12 pr-8 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-black uppercase tracking-wider text-primary-gray appearance-none cursor-pointer focus:outline-none focus:border-primary-blue focus:bg-white transition-all"
            >
              <option value="all">Filtro Acumulado (Geral)</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>
                  {formatMonthYearStr(m)}
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">
              ▼
            </div>
          </div>
        </div>

        {/* Location Filters tabs */}
        {isMaster ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
            <button
              onClick={() => setSelectedLocationId('all')}
              className={`px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                selectedLocationId === 'all' 
                  ? 'bg-primary-blue text-white shadow-md' 
                  : 'bg-gray-50 hover:bg-gray-100 text-primary-gray border border-gray-100'
              }`}
            >
              Todos Locais
            </button>
            {sharedLocations.map(loc => (
              <button
                key={loc.id}
                onClick={() => setSelectedLocationId(loc.id)}
                className={`px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                  selectedLocationId === loc.id 
                    ? 'bg-primary-blue text-white shadow-md' 
                    : 'bg-gray-50 hover:bg-gray-100 text-primary-gray border border-gray-100'
                }`}
              >
                {loc.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-2xl text-xs font-bold text-primary-blue uppercase italic">
            <MapPin className="w-4 h-4 text-primary-blue shrink-0" />
            <span>Sede Restrita: {activeLocationName}</span>
          </div>
        )}
      </div>

      {/* Main Table Content */}
      {loading ? (
        <div className="min-h-[40vh] bg-white rounded-[2rem] border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-primary-blue" />
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest animate-pulse">Carregando classificação...</p>
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
          
          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-primary-blue text-white text-[11px] font-black uppercase tracking-widest">
                  <th className="py-5 px-6 shrink-0 w-20 text-center">Pos</th>
                  <th className="py-5 px-6 min-w-[200px] cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('name')}>
                    <div className="flex items-center gap-1.5">
                      Jogador {sortField === 'name' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </div>
                  </th>
                  <th className="py-5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('matches')}>
                    <div className="flex items-center justify-center gap-1.5" title="Partidas Jogadas">
                      <span>JOG</span>
                      <ArrowUpDown className="w-3 h-3 text-white/50" />
                      {sortField === 'matches' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </div>
                  </th>
                  <th className="py-5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('wins')}>
                    <div className="flex items-center justify-center gap-1.5" title="Vitórias">
                      <span>VIT</span>
                      <ArrowUpDown className="w-3 h-3 text-white/50" />
                      {sortField === 'wins' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </div>
                  </th>
                  <th className="py-5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('goals')}>
                    <div className="flex items-center justify-center gap-1.5" title="Gols Marcados">
                      <span>GOLS</span>
                      <ArrowUpDown className="w-3 h-3 text-white/50" />
                      {sortField === 'goals' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </div>
                  </th>
                  <th className="py-5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('assists')}>
                    <div className="flex items-center justify-center gap-1.5" title="Assistências Realizadas">
                      <span>AST</span>
                      <ArrowUpDown className="w-3 h-3 text-white/50" />
                      {sortField === 'assists' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </div>
                  </th>
                  <th className="py-5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('mvps')}>
                    <div className="flex items-center justify-center gap-1.5" title="Melhor da Partida (MVP)">
                      <span>MVP</span>
                      <ArrowUpDown className="w-3 h-3 text-white/50" />
                      {sortField === 'mvps' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </div>
                  </th>
                  <th className="py-5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('gp')}>
                    <div className="flex items-center justify-center gap-1.5" title="Gols Pro (marcados pelo time do atleta)">
                      <span>GP</span>
                      <ArrowUpDown className="w-3 h-3 text-white/50" />
                      {sortField === 'gp' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </div>
                  </th>
                  <th className="py-5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('gc')}>
                    <div className="flex items-center justify-center gap-1.5" title="Gols Contra (sofridos pelo time do atleta)">
                      <span>GC</span>
                      <ArrowUpDown className="w-3 h-3 text-white/50" />
                      {sortField === 'gc' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </div>
                  </th>
                  <th className="py-5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('avgConceded')}>
                    <div className="flex items-center justify-center gap-1.5" title="Média de Gols Sofridos por Partida (Apenas Goleiros)">
                      <span>MÉD GS</span>
                      <ArrowUpDown className="w-3 h-3 text-white/50" />
                      {sortField === 'avgConceded' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </div>
                  </th>
                  <th className="py-5 px-4 text-center cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('sg')}>
                    <div className="flex items-center justify-center gap-1.5" title="Saldo de Gols">
                      <span>SG</span>
                      <ArrowUpDown className="w-3 h-3 text-white/50" />
                      {sortField === 'sg' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </div>
                  </th>
                  <th className="py-5 px-6 text-center cursor-pointer hover:bg-[#ffb300] transition-colors bg-primary-yellow text-primary-blue" onClick={() => handleSort('points')}>
                    <div className="flex items-center justify-center gap-1.5 font-black">
                      <span>PONTOS</span>
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      {sortField === 'points' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-gray-400 font-medium italic text-sm">
                      Nenhum jogador encontrado com as opções fornecidas.
                    </td>
                  </tr>
                ) : (
                  filteredPlayers.map((player, index) => {
                    // Overall rank position in whole selected context
                    const rank = index + 1;
                    
                    return (
                      <motion.tr 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(20, index) * 0.02 }}
                        key={player.id} 
                        className="hover:bg-gray-50 transition-all text-sm font-semibold text-primary-gray group"
                      >
                        {/* Rank position display */}
                        <td className="py-4 px-6 text-center">
                          <div className="flex justify-center">
                            {rank === 1 ? (
                              <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center text-white text-[11px] font-black shadow-md shadow-yellow-100">
                                1º
                              </div>
                            ) : rank === 2 ? (
                              <div className="w-7 h-7 bg-gray-300 rounded-full flex items-center justify-center text-white text-[11px] font-black shadow-md shadow-gray-100">
                                2º
                              </div>
                            ) : rank === 3 ? (
                              <div className="w-7 h-7 bg-amber-600 rounded-full flex items-center justify-center text-white text-[11px] font-black shadow-md shadow-amber-100">
                                3º
                              </div>
                            ) : (
                              <span className="text-gray-400 font-bold font-mono text-xs">{rank}º</span>
                            )}
                          </div>
                        </td>

                        {/* Player name and avatar info */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              {player.photoUrl ? (
                                <img 
                                  src={player.photoUrl} 
                                  alt={player.name} 
                                  className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm ring-2 ring-gray-100 group-hover:scale-105 transition-transform" 
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center border-2 border-white shadow-sm ring-2 ring-gray-100">
                                  <Users className="w-5 h-5 text-gray-300" />
                                </div>
                              )}
                              {/* Position tag over the photo on small display? Or next to nickname */}
                            </div>
                            <div>
                              <div className="font-extrabold text-primary-blue flex items-center gap-1.5 flex-wrap">
                                <span className="group-hover:text-primary-blue transition-colors">
                                  {player.nickname || player.name}
                                </span>
                                {player.nickname && player.name && (
                                  <span className="text-[10px] text-gray-400 font-bold truncate max-w-[120px] hidden sm:inline">
                                    ({player.name})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-[9px] uppercase font-black mt-0.5 tracking-wider">
                                <span className={`px-2 py-0.5 rounded-md ${getPositionColor(player.position)}`}>
                                  {getPositionAbbr(player.position)}
                                </span>
                                <span className="text-gray-400 font-bold">• {sharedLocations.find(l => l.id === player.locationId)?.name || 'Sem local'}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Matches */}
                        <td className="py-4 px-4 text-center font-bold text-gray-700">
                          {player.computedStats?.matches || 0}
                        </td>

                        {/* Wins */}
                        <td className="py-4 px-4 text-center font-bold text-green-600">
                          {player.computedStats?.wins || 0}
                        </td>

                        {/* Goals */}
                        <td className="py-4 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <SoccerBall size={13} />
                            <span className="font-bold text-gray-800">{player.computedStats?.goals || 0}</span>
                          </div>
                        </td>

                        {/* Assists */}
                        <td className="py-4 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <SoccerCleat size={13} />
                            <span className="font-bold text-gray-800">{player.computedStats?.assists || 0}</span>
                          </div>
                        </td>

                        {/* MVPs */}
                        <td className="py-4 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Award className="w-3.5 h-3.5 text-amber-500 fill-amber-50" />
                            <span className="font-bold text-gray-800">{player.computedStats?.mvps || 0}</span>
                          </div>
                        </td>

                        {/* GP (Gols Pró do Time) */}
                        <td className="py-4 px-4 text-center font-bold text-gray-700">
                          {player.computedTeamStats?.gp ?? 0}
                        </td>

                        {/* GC (Gols Contra do Time) */}
                        <td className="py-4 px-4 text-center font-bold text-gray-700">
                          {player.computedTeamStats?.gc ?? 0}
                        </td>

                        {/* Média de Gols Sofridos (Apenas Goleiro) */}
                        <td className="py-4 px-4 text-center">
                          {player.position === 'goleiro' ? (
                            <span className="font-mono text-xs font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                              {((player.computedTeamStats?.gc ?? 0) / (player.computedStats?.matches || 1)).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>

                        {/* SG (Saldo de Gols do Time) */}
                        <td className="py-4 px-4 text-center">
                          <span className={`font-mono font-black ${
                            (player.computedTeamStats?.sg ?? 0) > 0 
                              ? 'text-green-600' 
                              : (player.computedTeamStats?.sg ?? 0) < 0 
                                ? 'text-rose-600' 
                                : 'text-gray-500'
                          }`}>
                            {(player.computedTeamStats?.sg ?? 0) > 0 
                              ? `+${player.computedTeamStats.sg}` 
                              : player.computedTeamStats?.sg ?? 0}
                          </span>
                        </td>

                        {/* Total Score Points */}
                        <td className="py-4 px-6 text-center bg-yellow-50/50 font-black text-sm text-primary-blue border-l border-yellow-100 font-mono">
                          <div className="flex items-center justify-center gap-1">
                            <Trophy className="w-4 h-4 text-primary-yellow animate-none shrink-0" />
                            <span>{player.computedStats?.points || 0}</span>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table summary info */}
          <div className="bg-gray-50/70 p-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400 font-extrabold uppercase tracking-wider">
            <span>Classificação do Local: {activeLocationName}</span>
            <span>Total: {filteredPlayers.length} atletas listados</span>
          </div>
        </div>
      )}

    </div>
  );
}
