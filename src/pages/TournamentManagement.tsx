import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  writeBatch, 
  getDoc,
  getDocs
} from 'firebase/firestore';
import { 
  Location, 
  Player, 
  Tournament, 
  TournamentTeam, 
  TournamentGroup, 
  TournamentMatch, 
  AdminData,
  ScoringRules
} from '../types';
import { 
  Trophy, 
  Plus, 
  Trash2, 
  Edit2, 
  Search, 
  X, 
  Users, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Shield, 
  ChevronRight, 
  ArrowRight,
  Sparkles,
  Zap,
  Swords,
  Medal,
  Play,
  RotateCcw,
  Star,
  Check,
  UserPlus,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../App';
import { cleanUndefinedFields } from '../utils/firestoreUtils';
import { SoccerBall, SoccerCleat } from '../components/Icons';
import { calculateMatchPoints } from '../utils/scoringEngine';
import { compressFileToDataUrl } from '../utils/imageUtils';
import { TeamSquadModal } from '../components/TeamSquadModal';
import { sortPlayersByPosition, getPositionLabel, formatDateBR } from '../utils/playerUtils';

const DEFAULT_RULES: ScoringRules = {
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

interface TournamentManagementProps {
  adminData?: AdminData | null;
  initialLocationId?: string;
}

export default function TournamentManagement({ adminData, initialLocationId }: TournamentManagementProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>(initialLocationId || '');
  const [locationPlayers, setLocationPlayers] = useState<Player[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [scoringRules, setScoringRules] = useState<ScoringRules>(DEFAULT_RULES);

  // Modal / Active Tournament State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'teams' | 'matches' | 'standings' | 'playoffs'>('standings');
  const [squadModalTeam, setSquadModalTeam] = useState<TournamentTeam | null>(null);

  // Form State for New/Edit Tournament
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'GRUPOS' | 'PLAYOFFS' | 'GRUPOS_E_PLAYOFFS'>('GRUPOS_E_PLAYOFFS');
  const [groupMatchFormat, setGroupMatchFormat] = useState<'NORMAL' | 'CRUZADO'>('NORMAL');
  const [groupsCount, setGroupsCount] = useState<number>(2);
  const [qualifiersPerGroup, setQualifiersPerGroup] = useState<number>(2);
  const [teamsCount, setTeamsCount] = useState<number>(4);
  const [formTeams, setFormTeams] = useState<TournamentTeam[]>([]);

  // Match Editing Modal
  const [editingMatch, setEditingMatch] = useState<TournamentMatch | null>(null);
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);
  const [penaltiesA, setPenaltiesA] = useState<number>(0);
  const [penaltiesB, setPenaltiesB] = useState<number>(0);
  const [matchDate, setMatchDate] = useState<string>('');
  const [matchTime, setMatchTime] = useState<string>('19:00');
  const [matchMvpId, setMatchMvpId] = useState<string>('');
  const [matchEvents, setMatchEvents] = useState<{ playerId: string; teamId?: string; type: 'goal' | 'assist' | 'own_goal' | 'penalty_save' | 'penalty_miss' }[]>([]);

  // Player selection modal for team roster
  const [selectingPlayersForTeamId, setSelectingPlayersForTeamId] = useState<string | null>(null);
  const [playerSearchTerm, setPlayerSearchTerm] = useState('');

  // Fetch Scoring Rules
  useEffect(() => {
    const fetchRules = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'scoring'));
        if (snap.exists()) {
          setScoringRules(snap.data() as ScoringRules);
        }
      } catch (err) {
        console.error("Error fetching scoring rules:", err);
      }
    };
    fetchRules();
  }, []);

  // Fetch Locations
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'locations'), (snapshot) => {
      let locList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Location));
      if (adminData && adminData.role !== 'master' && adminData.locationId) {
        locList = locList.filter(l => l.id === adminData.locationId);
      }
      setLocations(locList);
      if (locList.length > 0 && !selectedLocationId) {
        setSelectedLocationId(initialLocationId || locList[0].id);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'locations'));
    return () => unsubscribe();
  }, [adminData, initialLocationId]);

  // Fetch Location Players when selectedLocationId changes
  useEffect(() => {
    if (!selectedLocationId) {
      setLocationPlayers([]);
      return;
    }
    const q = query(collection(db, 'players'), where('locationId', '==', selectedLocationId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const plist = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Player));
      setLocationPlayers(plist);
    }, (err) => console.error("Error fetching location players:", err));
    return () => unsubscribe();
  }, [selectedLocationId]);

  // Fetch Tournaments for Selected Location
  useEffect(() => {
    if (!selectedLocationId) {
      setTournaments([]);
      return;
    }
    const q = query(collection(db, 'tournaments'), where('locationId', '==', selectedLocationId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tlist = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
      tlist.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setTournaments(tlist);
      // Keep active tournament synced if opened
      setActiveTournament(prev => {
        if (!prev) return null;
        const updated = tlist.find(t => t.id === prev.id);
        return updated || prev;
      });
    }, (err) => console.error("Error fetching tournaments:", err));
    return () => unsubscribe();
  }, [selectedLocationId]);

  // Initialize Teams array when count or format changes in form
  const handleTeamsCountChange = (count: number) => {
    setTeamsCount(count);
    const existing = [...formTeams];
    const newTeams: TournamentTeam[] = [];
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (let i = 0; i < count; i++) {
      if (existing[i]) {
        newTeams.push(existing[i]);
      } else {
        const groupIdx = groupsCount > 0 ? i % groupsCount : 0;
        const groupId = alphabet[groupIdx] || 'A';
        newTeams.push({
          id: `team_${Date.now()}_${i}`,
          name: `Time ${i + 1}`,
          groupId,
          playerIds: []
        });
      }
    }
    setFormTeams(newTeams);
  };

  const handleOpenCreateModal = () => {
    setEditingTournamentId(null);
    setName('');
    setFormat('GRUPOS_E_PLAYOFFS');
    setGroupMatchFormat('NORMAL');
    setGroupsCount(2);
    setQualifiersPerGroup(2);
    setTeamsCount(4);
    
    // Create 4 initial teams
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const initTeams: TournamentTeam[] = [];
    for (let i = 0; i < 4; i++) {
      const gId = alphabet[i % 2];
      initTeams.push({
        id: `team_${Date.now()}_${i}`,
        name: `Time ${i + 1}`,
        groupId: gId,
        playerIds: []
      });
    }
    setFormTeams(initTeams);
    setIsCreateModalOpen(true);
  };

  const handleOpenEditModal = (t: Tournament) => {
    setEditingTournamentId(t.id);
    setName(t.name);
    setFormat(t.format);
    setGroupMatchFormat(t.groupMatchFormat || 'NORMAL');
    setGroupsCount(t.groupsCount || 1);
    setQualifiersPerGroup(t.qualifiersPerGroup || 2);
    setTeamsCount(t.teams.length);
    setFormTeams(t.teams);
    setIsCreateModalOpen(true);
  };

  const handleSaveTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocationId) {
      alert("Selecione um local válido.");
      return;
    }
    if (!name.trim()) {
      alert("Insira o nome do campeonato.");
      return;
    }

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const groupsList: TournamentGroup[] = [];
    const numG = (format === 'PLAYOFFS') ? 0 : groupsCount;
    for (let i = 0; i < numG; i++) {
      const gLetter = alphabet[i] || `${i + 1}`;
      groupsList.push({
        id: gLetter,
        name: `Grupo ${gLetter}`
      });
    }

    const tournamentData: Omit<Tournament, 'id'> = {
      name,
      locationId: selectedLocationId,
      status: 'em_andamento',
      format,
      groupMatchFormat: (format === 'PLAYOFFS') ? 'NORMAL' : groupMatchFormat,
      groupsCount: numG,
      qualifiersPerGroup: (format === 'GRUPOS') ? 0 : qualifiersPerGroup,
      teams: formTeams,
      groups: groupsList,
      matches: editingTournamentId ? (tournaments.find(t => t.id === editingTournamentId)?.matches || []) : [],
      createdAt: Date.now()
    };

    try {
      if (editingTournamentId) {
        await updateDoc(doc(db, 'tournaments', editingTournamentId), cleanUndefinedFields(tournamentData as any));
      } else {
        const docRef = await addDoc(collection(db, 'tournaments'), cleanUndefinedFields(tournamentData as any));
        // Auto generate initial group matches if format includes groups
        if (format === 'GRUPOS' || format === 'GRUPOS_E_PLAYOFFS') {
          const { newGroupMatches, safeGroups, safeTeams } = await generateGroupMatchesForTournament(docRef.id, formTeams, groupsList, groupMatchFormat);
          await updateDoc(doc(db, 'tournaments', docRef.id), cleanUndefinedFields({
            matches: newGroupMatches,
            groups: safeGroups,
            teams: safeTeams
          }));
        }
      }
      setIsCreateModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, editingTournamentId ? OperationType.UPDATE : OperationType.CREATE, 'tournaments');
    }
  };

  // Auto Generate Group Matches (NORMAL or CRUZADO)
  const generateGroupMatchesForTournament = async (
    tId: string, 
    teams: TournamentTeam[], 
    groups: TournamentGroup[],
    matchFormat: 'NORMAL' | 'CRUZADO' = 'NORMAL'
  ) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    // 1. Ensure groups list is valid
    let safeGroups = [...(groups || [])];
    if (safeGroups.length === 0) {
      const numG = activeTournament?.groupsCount || 2;
      for (let i = 0; i < numG; i++) {
        const gLetter = alphabet[i] || `${i + 1}`;
        safeGroups.push({ id: gLetter, name: `Grupo ${gLetter}` });
      }
    }

    // 2. Ensure every team has a valid groupId
    const safeTeams = (teams || []).map((t, idx) => ({
      ...t,
      groupId: t.groupId || safeGroups[idx % safeGroups.length]?.id || 'A'
    }));

    const newGroupMatches: TournamentMatch[] = [];
    const today = new Date().toISOString().split('T')[0];

    if (matchFormat === 'CRUZADO' && safeGroups.length >= 2) {
      // Cruzado: Teams in Group A play against Teams in Group B
      const groupPairs: [TournamentGroup, TournamentGroup][] = [];
      if (safeGroups.length === 2) {
        groupPairs.push([safeGroups[0], safeGroups[1]]);
      } else {
        for (let g = 0; g < safeGroups.length; g += 2) {
          const g1 = safeGroups[g];
          const g2 = safeGroups[g + 1] || safeGroups[0];
          groupPairs.push([g1, g2]);
        }
      }

      groupPairs.forEach(([g1, g2]) => {
        const g1Teams = safeTeams.filter(t => t.groupId === g1.id);
        const g2Teams = safeTeams.filter(t => t.groupId === g2.id);

        for (let i = 0; i < g1Teams.length; i++) {
          for (let j = 0; j < g2Teams.length; j++) {
            newGroupMatches.push({
              id: `m_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              stage: 'group',
              groupId: `${g1.id}x${g2.id}`,
              groupName: `Chave Cruzada (${g1.name} x ${g2.name})`,
              teamAId: g1Teams[i].id,
              teamBId: g2Teams[j].id,
              date: today,
              time: '19:00',
              status: 'scheduled',
              events: []
            });
          }
        }
      });
    } else {
      // Normal: Round-robin inside own group
      safeGroups.forEach(group => {
        const groupTeams = safeTeams.filter(t => t.groupId === group.id);
        for (let i = 0; i < groupTeams.length; i++) {
          for (let j = i + 1; j < groupTeams.length; j++) {
            newGroupMatches.push({
              id: `m_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              stage: 'group',
              groupId: group.id,
              groupName: group.name,
              teamAId: groupTeams[i].id,
              teamBId: groupTeams[j].id,
              date: today,
              time: '19:00',
              status: 'scheduled',
              events: []
            });
          }
        }
      });
    }

    return { newGroupMatches, safeGroups, safeTeams };
  };

  const handleRegenerateGroupMatches = async () => {
    if (!activeTournament) return;
    const formatText = activeTournament.groupMatchFormat === 'CRUZADO' 
      ? 'CRUZADO (Grupo A x Grupo B)' 
      : 'NORMAL (Interno no Grupo)';

    if (!window.confirm(`Deseja regerar a tabela de jogos dos grupos no formato ${formatText}? Os jogos de grupo atuais serão atualizados.`)) return;

    try {
      const playoffMatches = (activeTournament.matches || []).filter(m => m.stage === 'playoff');

      const { newGroupMatches, safeGroups, safeTeams } = await generateGroupMatchesForTournament(
        activeTournament.id,
        activeTournament.teams,
        activeTournament.groups,
        activeTournament.groupMatchFormat || 'NORMAL'
      );

      const combinedMatches = [...newGroupMatches, ...playoffMatches];

      await updateDoc(doc(db, 'tournaments', activeTournament.id), cleanUndefinedFields({
        matches: combinedMatches,
        groups: safeGroups,
        teams: safeTeams
      }));

      setActiveTournament(prev => prev ? {
        ...prev,
        matches: combinedMatches,
        groups: safeGroups,
        teams: safeTeams
      } : null);

      alert(`Tabela de jogos regerada com sucesso! (${newGroupMatches.length} partidas de grupo geradas)`);
    } catch (err) {
      console.error("Erro ao regerar jogos do grupo:", err);
      alert("Erro ao regerar tabela de jogos do grupo. Tente novamente.");
    }
  };

  const handleDeleteTournament = async (tId: string) => {
    if (window.confirm("Tem certeza que deseja excluir este campeonato? Esta ação não pode ser desfeita.")) {
      try {
        await deleteDoc(doc(db, 'tournaments', tId));
        if (activeTournament?.id === tId) setActiveTournament(null);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'tournaments');
      }
    }
  };

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
        .filter(m => m.stage === 'group' && (m.teamAId === team.id || m.teamBId === team.id) && m.status === 'finished')
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

    // Sort by Points > Wins > Goal Difference > Goals For
    standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      return b.goalsFor - a.goalsFor;
    });

    return standings;
  };

  // Generate Playoff Stage from Group Standings (1º de um grupo vs 2º do outro)
  const handleGeneratePlayoffs = async () => {
    if (!activeTournament) return;
    if (activeTournament.groups.length === 0) return;

    const qualifiersPerGroup = activeTournament.qualifiersPerGroup || 2;
    const groupQualifiers: {
      groupId: string;
      groupName: string;
      standings: { team: TournamentTeam; rank: number }[];
    }[] = [];

    activeTournament.groups.forEach(group => {
      const standings = calculateGroupStandings(activeTournament, group.id);
      const qualifiers = standings.slice(0, qualifiersPerGroup).map((q, idx) => ({
        team: q.team,
        rank: idx + 1
      }));
      groupQualifiers.push({
        groupId: group.id,
        groupName: group.name,
        standings: qualifiers
      });
    });

    let totalQualifiedCount = 0;
    groupQualifiers.forEach(g => { totalQualifiedCount += g.standings.length; });

    if (totalQualifiedCount < 2) {
      alert("É necessário ter pelo menos 2 times classificados para gerar os playoffs.");
      return;
    }

    const playoffMatches: TournamentMatch[] = [];
    const today = new Date().toISOString().split('T')[0];

    let roundName = 'Playoffs';
    if (totalQualifiedCount === 2) roundName = 'Grande Final';
    else if (totalQualifiedCount <= 4) roundName = 'Semifinal';
    else if (totalQualifiedCount <= 8) roundName = 'Quartas de Final';
    else if (totalQualifiedCount <= 16) roundName = 'Oitavas de Final';

    const formatTime = (idx: number) => {
      const startHour = 19;
      const hour = startHour + idx;
      return `${hour.toString().padStart(2, '0')}:00`;
    };

    // Pair 1st place of a group against 2nd place of another group
    if (groupQualifiers.length >= 2 && qualifiersPerGroup >= 2) {
      const numGroups = groupQualifiers.length;

      if (numGroups % 2 === 0) {
        // Even number of groups (2, 4, 6...): pair adjacent groups (A x B, C x D...)
        for (let g = 0; g < numGroups; g += 2) {
          const g1 = groupQualifiers[g];
          const g2 = groupQualifiers[g + 1];

          const g1_1st = g1.standings.find(s => s.rank === 1)?.team;
          const g1_2nd = g1.standings.find(s => s.rank === 2)?.team;
          const g2_1st = g2.standings.find(s => s.rank === 1)?.team;
          const g2_2nd = g2.standings.find(s => s.rank === 2)?.team;

          // Match 1: 1º do Grupo 1 vs 2º do Grupo 2
          if (g1_1st && g2_2nd) {
            playoffMatches.push({
              id: `playoff_${Date.now()}_${playoffMatches.length}`,
              stage: 'playoff',
              roundName,
              roundIndex: 1,
              teamAId: g1_1st.id,
              teamBId: g2_2nd.id,
              date: today,
              time: formatTime(playoffMatches.length),
              status: 'scheduled',
              events: []
            });
          }

          // Match 2: 1º do Grupo 2 vs 2º do Grupo 1
          if (g2_1st && g1_2nd) {
            playoffMatches.push({
              id: `playoff_${Date.now()}_${playoffMatches.length}`,
              stage: 'playoff',
              roundName,
              roundIndex: 1,
              teamAId: g2_1st.id,
              teamBId: g1_2nd.id,
              date: today,
              time: formatTime(playoffMatches.length),
              status: 'scheduled',
              events: []
            });
          }
        }
      } else {
        // Odd number of groups (3, 5...): 1º do Grupo i vs 2º do Grupo (i+1)%N
        for (let g = 0; g < numGroups; g++) {
          const gCurr = groupQualifiers[g];
          const gNext = groupQualifiers[(g + 1) % numGroups];

          const curr1st = gCurr.standings.find(s => s.rank === 1)?.team;
          const next2nd = gNext.standings.find(s => s.rank === 2)?.team;

          if (curr1st && next2nd) {
            playoffMatches.push({
              id: `playoff_${Date.now()}_${playoffMatches.length}`,
              stage: 'playoff',
              roundName,
              roundIndex: 1,
              teamAId: curr1st.id,
              teamBId: next2nd.id,
              date: today,
              time: formatTime(playoffMatches.length),
              status: 'scheduled',
              events: []
            });
          }
        }
      }
    } else {
      // Fallback for single group or single qualifier per group
      const allQualified: TournamentTeam[] = [];
      groupQualifiers.forEach(g => {
        g.standings.forEach(s => allQualified.push(s.team));
      });

      for (let i = 0; i < allQualified.length; i += 2) {
        if (i + 1 < allQualified.length) {
          playoffMatches.push({
            id: `playoff_${Date.now()}_${playoffMatches.length}`,
            stage: 'playoff',
            roundName,
            roundIndex: 1,
            teamAId: allQualified[i].id,
            teamBId: allQualified[i + 1].id,
            date: today,
            time: formatTime(playoffMatches.length),
            status: 'scheduled',
            events: []
          });
        }
      }
    }

    const updatedMatches = [
      ...activeTournament.matches.filter(m => m.stage !== 'playoff'),
      ...playoffMatches
    ];

    try {
      await updateDoc(doc(db, 'tournaments', activeTournament.id), cleanUndefinedFields({
        matches: updatedMatches
      }));
      alert(`Fase de Playoffs (${roundName}) com confrontos cruzados (1º x 2º) gerada com sucesso!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'tournaments');
    }
  };

  // Open match score editor
  const handleOpenMatchEditor = (match: TournamentMatch) => {
    setEditingMatch(match);
    setScoreA(match.scoreA || 0);
    setScoreB(match.scoreB || 0);
    setPenaltiesA(match.penaltiesA || 0);
    setPenaltiesB(match.penaltiesB || 0);
    setMatchDate(match.date || new Date().toISOString().split('T')[0]);
    setMatchTime(match.time || '19:00');
    setMatchMvpId(match.mvpId || '');
    setMatchEvents(match.events || []);
  };

  // Save Match Result & Update Player Stats in Firestore
  const handleSaveMatchResult = async () => {
    if (!activeTournament || !editingMatch) return;

    const teamA = activeTournament.teams.find(t => t.id === editingMatch.teamAId);
    const teamB = activeTournament.teams.find(t => t.id === editingMatch.teamBId);

    if (!teamA || !teamB) {
      alert("Times não encontrados.");
      return;
    }

    let winnerTeamId: string | undefined = undefined;
    if (scoreA > scoreB) winnerTeamId = teamA.id;
    else if (scoreB > scoreA) winnerTeamId = teamB.id;
    else if (penaltiesA > penaltiesB) winnerTeamId = teamA.id;
    else if (penaltiesB > penaltiesA) winnerTeamId = teamB.id;

    const updatedMatch: TournamentMatch = cleanUndefinedFields({
      ...editingMatch,
      date: matchDate,
      time: matchTime,
      scoreA,
      scoreB,
      penaltiesA,
      penaltiesB,
      status: 'finished',
      mvpId: matchMvpId || undefined,
      events: matchEvents || [],
      winnerTeamId
    });

    const updatedMatches = activeTournament.matches.map(m => m.id === editingMatch.id ? updatedMatch : m);

    try {
      // 1. Update tournament match in Firestore
      await updateDoc(doc(db, 'tournaments', activeTournament.id), cleanUndefinedFields({
        matches: updatedMatches
      }));

      // 2. CRITICAL: Update player stats in Firestore for players in teamA and teamB!
      await updatePlayerStatsFromTournamentMatch(teamA, teamB, updatedMatch);

      setEditingMatch(null);
      alert("Resultado salvo e estatísticas dos atletas atualizadas com sucesso!");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'tournaments');
    }
  };

  // Function to credit goals, assists, wins, matches, MVP, and points to players in Firestore
  const updatePlayerStatsFromTournamentMatch = async (
    teamA: TournamentTeam, 
    teamB: TournamentTeam, 
    match: TournamentMatch
  ) => {
    const allMatchPlayerIds = Array.from(new Set([...teamA.playerIds, ...teamB.playerIds]));
    if (allMatchPlayerIds.length === 0) return;

    const batch = writeBatch(db);

    for (const playerId of allMatchPlayerIds) {
      const playerRef = doc(db, 'players', playerId);
      const playerSnap = await getDoc(playerRef);

      if (playerSnap.exists()) {
        const pData = playerSnap.data() as Player;
        const currentStats = pData.stats || { wins: 0, goals: 0, assists: 0, matches: 0, points: 0 };

        const isTeamA = teamA.playerIds.includes(playerId);

        // Player match goals and assists from events
        const playerGoals = match.events?.filter(e => e.playerId === playerId && e.type === 'goal').length || 0;
        const playerAssists = match.events?.filter(e => e.playerId === playerId && e.type === 'assist').length || 0;
        const isMvp = match.mvpId === playerId;

        // Determine if player's team won
        let isWin = false;
        if (isTeamA && match.winnerTeamId === teamA.id) isWin = true;
        if (!isTeamA && match.winnerTeamId === teamB.id) isWin = true;

        // Calculate points gained from scoring rules
        let matchPoints = 0;
        if (isWin) matchPoints += scoringRules.win;
        else if (match.scoreA === match.scoreB) matchPoints += scoringRules.draw;

        matchPoints += playerGoals * scoringRules.goal;
        matchPoints += playerAssists * scoringRules.assist;
        if (isMvp) matchPoints += scoringRules.mvp;

        const newStats = {
          wins: currentStats.wins + (isWin ? 1 : 0),
          goals: currentStats.goals + playerGoals,
          assists: currentStats.assists + playerAssists,
          matches: currentStats.matches + 1,
          points: currentStats.points + matchPoints
        };

        batch.update(playerRef, { stats: newStats });
      }
    }

    await batch.commit();
  };

  const activeLocation = locations.find(l => l.id === selectedLocationId);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-r from-slate-900 via-primary-blue to-slate-950 p-6 md:p-8 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-3">
            <div className="bg-amber-400/20 p-2.5 rounded-2xl border border-amber-400/30">
              <Trophy className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <h2 className="text-2xl md:text-4xl font-black uppercase italic tracking-tight">Campeonatos da Arena</h2>
              <p className="text-amber-300/80 text-xs font-bold uppercase tracking-widest">Torneios, Grupos e Mata-Mata</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 relative z-10">
          {/* Location Selector */}
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20">
            <Shield className="w-4 h-4 text-amber-400" />
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="bg-transparent text-white font-black text-xs uppercase tracking-wider focus:outline-none cursor-pointer"
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id} className="text-slate-900">
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleOpenCreateModal}
            className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 text-slate-950 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" /> Novo Campeonato
          </button>
        </div>
      </div>

      {/* Main Content */}
      {activeTournament ? (
        /* Single Tournament View */
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
            <button
              onClick={() => setActiveTournament(null)}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500 hover:text-primary-blue bg-gray-50 hover:bg-gray-100 px-4 py-2 rounded-xl transition-all"
            >
              <RotateCcw className="w-4 h-4" /> Voltar para Lista
            </button>

            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-black uppercase italic text-primary-blue">{activeTournament.name}</h3>
              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-md bg-amber-400 text-slate-950">
                {activeTournament.format}
              </span>
              {activeTournament.format !== 'PLAYOFFS' && (
                <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-md bg-slate-900 text-amber-400">
                  {activeTournament.groupMatchFormat === 'CRUZADO' ? 'Chave Cruzada' : 'Chave Normal'}
                </span>
              )}
            </div>

            <button
              onClick={() => handleOpenEditModal(activeTournament)}
              className="p-2 bg-gray-50 hover:bg-primary-blue hover:text-white rounded-xl text-gray-600 transition-all"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-gray-200 overflow-x-auto gap-2 pb-1">
            <button
              onClick={() => setActiveTab('standings')}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'standings'
                  ? 'bg-primary-blue text-white shadow-md'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-400" /> Tabela de Grupos
            </button>

            <button
              onClick={() => setActiveTab('playoffs')}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'playoffs'
                  ? 'bg-primary-blue text-white shadow-md'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Swords className="w-4 h-4 text-amber-400" /> Mata-Mata / Playoffs
            </button>

            <button
              onClick={() => setActiveTab('matches')}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'matches'
                  ? 'bg-primary-blue text-white shadow-md'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Calendar className="w-4 h-4 text-amber-400" /> Jogos do Torneio
            </button>

            <button
              onClick={() => setActiveTab('teams')}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'teams'
                  ? 'bg-primary-blue text-white shadow-md'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Users className="w-4 h-4 text-amber-400" /> Times e Elencos
            </button>
          </div>

          {/* TAB CONTENT: STANDINGS */}
          {activeTab === 'standings' && (
            <div className="space-y-8">
              {activeTournament.groups.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-3xl border border-gray-100">
                  <p className="text-gray-400 text-sm font-bold uppercase">Este torneio não possui fase de grupos.</p>
                </div>
              ) : (
                activeTournament.groups.map((group) => {
                  const standings = calculateGroupStandings(activeTournament, group.id);
                  return (
                    <div key={group.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
                        <h4 className="text-lg font-black uppercase italic text-amber-400 flex items-center gap-2">
                          <Shield className="w-5 h-5 fill-amber-400" /> {group.name}
                        </h4>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          Classificam os {activeTournament.qualifiersPerGroup} primeiros
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-bold">
                          <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-widest border-b border-gray-100">
                            <tr>
                              <th className="py-3 pl-3 pr-0.5 text-center w-8">#</th>
                              <th className="py-3 pl-0.5 pr-4">Time</th>
                              <th className="py-3 px-3 text-center text-primary-blue">P</th>
                              <th className="py-3 px-3 text-center">J</th>
                              <th className="py-3 px-3 text-center">V</th>
                              <th className="py-3 px-3 text-center">E</th>
                              <th className="py-3 px-3 text-center">D</th>
                              <th className="py-3 px-3 text-center">GP</th>
                              <th className="py-3 px-3 text-center">GC</th>
                              <th className="py-3 px-3 text-center">SG</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {standings.map((st, idx) => {
                              const isQualifying = idx < (activeTournament.qualifiersPerGroup || 2);
                              return (
                                <tr key={st.team.id} className={isQualifying ? 'bg-amber-400/5' : ''}>
                                  <td className="py-3.5 pl-3 pr-0.5 font-black text-center w-8">
                                    <div className="flex items-center justify-center">
                                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${
                                        isQualifying ? 'bg-amber-400 text-slate-950' : 'bg-gray-100 text-gray-500'
                                      }`}>
                                        {idx + 1}
                                      </span>
                                    </div>
                                  </td>
                                  <td 
                                    onClick={() => setSquadModalTeam(st.team)}
                                    className="py-3.5 pl-0.5 pr-4 font-black text-slate-900 text-sm italic uppercase cursor-pointer hover:bg-slate-100/80 transition-colors group/teamname"
                                    title="Clique para ver elenco e campo tático"
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-12 h-12 flex items-center justify-center shrink-0">
                                        {st.team.logoUrl ? (
                                          <img src={st.team.logoUrl} alt={st.team.name} className="w-full h-full object-contain filter drop-shadow-sm transition-transform group-hover/teamname:scale-110" />
                                        ) : (
                                          <Shield className="w-8 h-8 text-slate-400 group-hover/teamname:text-primary-blue transition-colors" />
                                        )}
                                      </div>
                                      <span className="truncate group-hover/teamname:text-primary-blue transition-colors underline-offset-2 group-hover/teamname:underline">{st.team.name}</span>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-3 text-center text-base font-black text-primary-blue">
                                    {st.points}
                                  </td>
                                  <td className="py-3.5 px-3 text-center text-gray-600">{st.played}</td>
                                  <td className="py-3.5 px-3 text-center text-green-600 font-bold">{st.wins}</td>
                                  <td className="py-3.5 px-3 text-center text-gray-500">{st.draws}</td>
                                  <td className="py-3.5 px-3 text-center text-red-500">{st.losses}</td>
                                  <td className="py-3.5 px-3 text-center text-gray-600">{st.goalsFor}</td>
                                  <td className="py-3.5 px-3 text-center text-gray-600">{st.goalsAgainst}</td>
                                  <td className="py-3.5 px-3 text-center font-black text-slate-800">
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

          {/* TAB CONTENT: PLAYOFFS */}
          {activeTab === 'playoffs' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <div>
                  <h4 className="text-base font-black uppercase text-slate-900 flex items-center gap-2">
                    <Swords className="w-5 h-5 text-amber-500" /> Mata-Mata & Eliminatórias
                  </h4>
                  <p className="text-xs text-gray-400 font-bold mt-1">
                    Classificação direta ou chave gerada a partir da fase de grupos.
                  </p>
                </div>

                <button
                  onClick={handleGeneratePlayoffs}
                  className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl transition-all shadow-md active:scale-95 flex items-center gap-2"
                >
                  <Zap className="w-4 h-4 fill-slate-950" /> Gerar Fase de Playoffs
                </button>
              </div>

              {/* Playoff Matches List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeTournament.matches.filter(m => m.stage === 'playoff').length === 0 ? (
                  <div className="col-span-2 bg-white p-12 text-center rounded-3xl border border-gray-100">
                    <p className="text-gray-400 text-xs font-bold uppercase italic">
                      Nenhum jogo de playoffs gerado ainda. Clique no botão acima para gerar os confrontos dos classificados.
                    </p>
                  </div>
                ) : (
                  [...activeTournament.matches.filter(m => m.stage === 'playoff')]
                    .sort((a, b) => {
                      const dateA = a.date || '';
                      const dateB = b.date || '';
                      if (dateA !== dateB) return dateA.localeCompare(dateB);
                      const timeA = (a.time || '99:99').trim().padStart(5, '0');
                      const timeB = (b.time || '99:99').trim().padStart(5, '0');
                      return timeA.localeCompare(timeB);
                    })
                    .map(match => {
                    const teamA = activeTournament.teams.find(t => t.id === match.teamAId);
                    const teamB = activeTournament.teams.find(t => t.id === match.teamBId);
                    return (
                      <div key={match.id} className="bg-white p-5 rounded-3xl border border-amber-400/40 shadow-md space-y-3">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md">
                            {match.roundName || 'Playoff'}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400">
                            {formatDateBR(match.date)} às {match.time}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 text-center space-y-1">
                            <p className="text-sm font-black text-slate-900 uppercase italic">{teamA?.name || 'Time A'}</p>
                            <p className="text-2xl font-black text-primary-blue">{match.scoreA ?? '-'}</p>
                          </div>

                          <span className="text-xs font-black text-amber-500 italic">VS</span>

                          <div className="flex-1 text-center space-y-1">
                            <p className="text-sm font-black text-slate-900 uppercase italic">{teamB?.name || 'Time B'}</p>
                            <p className="text-2xl font-black text-primary-blue">{match.scoreB ?? '-'}</p>
                          </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                          <button
                            onClick={() => handleOpenMatchEditor(match)}
                            className="bg-primary-blue text-white text-[10px] font-black uppercase tracking-wider px-4 py-2 rounded-xl hover:bg-blue-800 transition-all"
                          >
                            Lançar Resultado
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT: MATCHES */}
          {activeTab === 'matches' && (
            <div className="space-y-6">
              {activeTournament.groups.length > 0 && (
                <div className="bg-white p-4 rounded-3xl border border-gray-100 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">Formato dos Grupos:</span>
                    <span className="bg-amber-400 text-slate-950 font-black text-xs uppercase px-3 py-1 rounded-xl shadow-sm">
                      {activeTournament.groupMatchFormat === 'CRUZADO' ? 'CRUZADO (Grupo A x Grupo B)' : 'NORMAL (Interno no Grupo)'}
                    </span>
                  </div>
                  <button
                    onClick={handleRegenerateGroupMatches}
                    className="bg-slate-900 hover:bg-slate-800 text-amber-400 font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-2xl transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Regerar Jogos dos Grupos
                  </button>
                </div>
              )}

              {(() => {
                const normalizeTimeStr = (t?: string) => {
                  if (!t) return '99:99';
                  const trimmed = t.trim();
                  const parts = trimmed.split(':');
                  if (parts.length === 2) {
                    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
                  }
                  return trimmed;
                };

                if (activeTournament.matches.length === 0) {
                  return (
                    <div className="bg-white p-12 text-center rounded-3xl border border-gray-100 shadow-sm">
                      <p className="text-gray-400 text-xs font-bold uppercase italic">Nenhuma partida agendada neste campeonato.</p>
                    </div>
                  );
                }

                // Group matches
                const groupMap = new Map<string, TournamentMatch[]>();

                activeTournament.matches.forEach(match => {
                  let groupTitle = 'Fase de Grupos';

                  if (match.groupName) {
                    groupTitle = match.groupName;
                  } else if (match.groupId) {
                    const g = activeTournament.groups?.find(x => x.id === match.groupId);
                    groupTitle = g ? g.name : `Grupo ${match.groupId}`;
                  } else if (match.stage === 'playoff') {
                    groupTitle = match.roundName || 'Mata-Mata / Playoffs';
                  } else {
                    const teamA = activeTournament.teams?.find(t => t.id === match.teamAId);
                    const g = teamA?.groupId ? activeTournament.groups?.find(x => x.id === teamA.groupId) : null;
                    if (g) {
                      groupTitle = g.name;
                    }
                  }

                  if (!groupMap.has(groupTitle)) {
                    groupMap.set(groupTitle, []);
                  }
                  groupMap.get(groupTitle)!.push(match);
                });

                // Sort matches in each group chronologically (ascending date & time)
                groupMap.forEach((mList) => {
                  mList.sort((a, b) => {
                    const dateA = a.date || '';
                    const dateB = b.date || '';
                    if (dateA !== dateB) return dateA.localeCompare(dateB);
                    return normalizeTimeStr(a.time).localeCompare(normalizeTimeStr(b.time));
                  });
                });

                // Order sections by defined groups order, then remaining
                const sections: { title: string; matches: TournamentMatch[] }[] = [];

                activeTournament.groups?.forEach(g => {
                  if (groupMap.has(g.name)) {
                    sections.push({ title: g.name, matches: groupMap.get(g.name)! });
                    groupMap.delete(g.name);
                  }
                });

                groupMap.forEach((mList, title) => {
                  sections.push({ title, matches: mList });
                });

                return (
                  <div className="space-y-8">
                    {sections.map(section => (
                      <div key={section.title} className="space-y-4">
                        {/* Group Header Banner */}
                        <div className="flex items-center justify-between bg-slate-900 text-white p-3.5 px-6 rounded-2xl shadow-sm border border-slate-800">
                          <div className="flex items-center gap-2.5">
                            <Shield className="w-4 h-4 text-amber-400 fill-amber-400" />
                            <h4 className="text-sm font-black uppercase italic tracking-tight text-amber-400">
                              {section.title}
                            </h4>
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 px-3 py-1 rounded-full border border-amber-400/30">
                            {section.matches.length} {section.matches.length === 1 ? 'Jogo' : 'Jogos'}
                          </span>
                        </div>

                        {/* Grid of Matches in ascending order of time */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {section.matches.map(match => {
                            const teamA = activeTournament.teams.find(t => t.id === match.teamAId);
                            const teamB = activeTournament.teams.find(t => t.id === match.teamBId);
                            return (
                              <div key={match.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-3">
                                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                  <span className="text-xs font-black uppercase tracking-widest text-slate-950 bg-amber-400 px-2.5 py-1 rounded-md shadow-xs flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5 text-slate-950" />
                                    {match.time || 'A definir'}
                                  </span>
                                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                                    match.status === 'finished' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {match.status === 'finished' ? 'Finalizada' : 'Agendada'}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1 text-center flex flex-col items-center">
                                    <div className="w-20 h-20 mb-1 flex items-center justify-center shrink-0">
                                      {teamA?.logoUrl ? (
                                        <img src={teamA.logoUrl} alt={teamA.name} className="w-full h-full object-contain filter drop-shadow-md" />
                                      ) : (
                                        <Shield className="w-12 h-12 text-slate-300" />
                                      )}
                                    </div>
                                    <p className="text-sm font-black text-slate-900 uppercase italic line-clamp-1">{teamA?.name || 'Time A'}</p>
                                    <p className="text-2xl font-black text-primary-blue mt-1">{match.scoreA ?? '-'}</p>
                                  </div>

                                  <span className="text-xs font-black text-gray-300 italic">X</span>

                                  <div className="flex-1 text-center flex flex-col items-center">
                                    <div className="w-20 h-20 mb-1 flex items-center justify-center shrink-0">
                                      {teamB?.logoUrl ? (
                                        <img src={teamB.logoUrl} alt={teamB.name} className="w-full h-full object-contain filter drop-shadow-md" />
                                      ) : (
                                        <Shield className="w-12 h-12 text-slate-300" />
                                      )}
                                    </div>
                                    <p className="text-sm font-black text-slate-900 uppercase italic line-clamp-1">{teamB?.name || 'Time B'}</p>
                                    <p className="text-2xl font-black text-primary-blue mt-1">{match.scoreB ?? '-'}</p>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                                  <span className="text-xs text-slate-900 font-black flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5 text-primary-blue" />
                                    {match.date ? `${formatDateBR(match.date)} às ` : ''}{match.time || 'A definir'}
                                  </span>
                                  <button
                                    onClick={() => handleOpenMatchEditor(match)}
                                    className="bg-primary-blue text-white text-[10px] font-black uppercase tracking-wider px-3.5 py-1.5 rounded-xl hover:bg-blue-800 transition-all"
                                  >
                                    {match.status === 'finished' ? 'Editar Resultado' : 'Lançar Placar'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB CONTENT: TEAMS */}
          {activeTab === 'teams' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeTournament.teams.map(team => (
                <div key={team.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                  <div className="flex items-center gap-3.5 border-b border-gray-100 pb-3">
                    <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                      {team.logoUrl ? (
                        <img src={team.logoUrl} alt={team.name} className="w-full h-full object-contain filter drop-shadow-md" />
                      ) : (
                        <Shield className="w-14 h-14 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-lg font-black uppercase italic text-slate-900 truncate">{team.name}</h4>
                        {team.groupId && (
                          <span className="text-[10px] font-black uppercase bg-amber-400 text-slate-950 px-2 py-0.5 rounded-md shrink-0">
                            Grupo {team.groupId}
                          </span>
                        )}
                      </div>

                      {/* Escudo actions */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <label className="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white text-[9px] font-black uppercase px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all shadow-xs">
                          <Upload className="w-3 h-3 text-amber-400" />
                          {team.logoUrl ? 'Alterar' : 'Carregar Escudo'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file && activeTournament) {
                                try {
                                  const compressed = await compressFileToDataUrl(file, 200, 60);
                                  const updatedTeams = activeTournament.teams.map(t => 
                                    t.id === team.id ? { ...t, logoUrl: compressed } : t
                                  );
                                  await updateDoc(doc(db, 'tournaments', activeTournament.id), { teams: updatedTeams });
                                } catch (err) {
                                  alert("Erro ao processar imagem do escudo.");
                                }
                              }
                            }}
                          />
                        </label>

                        {team.logoUrl && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (confirm(`Deseja remover o escudo do time ${team.name}?`)) {
                                const updatedTeams = activeTournament.teams.map(t => {
                                  if (t.id === team.id) {
                                    const { logoUrl, ...rest } = t;
                                    return rest;
                                  }
                                  return t;
                                });
                                await updateDoc(doc(db, 'tournaments', activeTournament.id), { teams: updatedTeams });
                              }
                            }}
                            className="bg-red-50 hover:bg-red-100 text-red-600 text-[9px] font-black uppercase px-2 py-1 rounded-lg flex items-center gap-1 transition-all"
                            title="Excluir Escudo"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Atletas do Elenco ({team.playerIds.length}):</p>
                    {team.playerIds.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Nenhum atleta atribuído a este time.</p>
                    ) : (
                      <ul className="space-y-1">
                        {(() => {
                          const rawList: Player[] = team.playerIds
                            .map(pId => locationPlayers.find(p => p.id === pId) || { id: pId, name: pId, nickname: pId, position: '' as any, locationId: '', stats: { wins: 0, goals: 0, assists: 0, matches: 0, points: 0 } })
                            .filter(Boolean);
                          const sortedList = sortPlayersByPosition(rawList);
                          return sortedList.map(pl => (
                            <li key={pl.id} className="text-xs font-bold text-slate-800 flex items-center justify-between bg-gray-50 px-3 py-1.5 rounded-xl">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-primary-blue" />
                                <span>{pl.nickname || pl.name}</span>
                              </div>
                              <span className="text-[9px] uppercase font-bold text-gray-500 bg-gray-200/60 px-2 py-0.5 rounded">
                                {getPositionLabel(pl.position)}
                              </span>
                            </li>
                          ));
                        })()}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Tournaments List for Location */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.length === 0 ? (
            <div className="col-span-full py-20 bg-white rounded-[2.5rem] border-2 border-dashed border-gray-100 text-center flex flex-col items-center opacity-60">
              <Trophy className="w-16 h-16 text-gray-300 mb-4" />
              <p className="text-gray-500 font-black uppercase tracking-widest italic text-sm">
                Nenhum campeonato cadastrado para este local
              </p>
              <button
                onClick={handleOpenCreateModal}
                className="mt-4 bg-primary-blue text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-blue-800 transition-all"
              >
                Criar Primeiro Campeonato
              </button>
            </div>
          ) : (
            tournaments.map(t => (
              <div
                key={t.id}
                className="bg-white rounded-3xl border-2 border-gray-100 hover:border-primary-blue/30 p-6 space-y-5 transition-all hover:shadow-xl group relative"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-md">
                      {t.format}
                    </span>
                    <h3 className="text-xl font-black uppercase italic text-slate-900 group-hover:text-primary-blue transition-colors pt-1">
                      {t.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditModal(t)}
                      className="p-2 text-gray-400 hover:text-primary-blue rounded-lg hover:bg-gray-50 transition-all"
                      title="Editar Campeonato"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTournament(t.id)}
                      className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                      title="Excluir Campeonato"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-bold text-gray-500 bg-gray-50 p-3 rounded-2xl">
                  <div>
                    <span className="text-[9px] uppercase font-black text-gray-400 block">Times</span>
                    <span className="text-slate-900 font-black">{t.teams?.length || 0} Equipes</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-black text-gray-400 block">Grupos</span>
                    <span className="text-slate-900 font-black">{t.groups?.length || 0} Grupos</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setActiveTournament(t);
                    setActiveTab('standings');
                  }}
                  className="w-full bg-slate-900 hover:bg-primary-blue text-white font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md active:scale-95"
                >
                  Abrir Tabela e Jogos <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* CREATE / EDIT TOURNAMENT MODAL */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="bg-slate-900 p-6 flex items-center justify-between text-white border-b border-gray-800">
                <div>
                  <h3 className="text-xl font-black uppercase italic text-amber-400 flex items-center gap-2">
                    <Trophy className="w-5 h-5 fill-amber-400" />
                    {editingTournamentId ? 'Editar Campeonato' : 'Novo Campeonato'}
                  </h3>
                  <p className="text-xs text-gray-400 font-bold">
                    Configuração de times, grupos e formato para {activeLocation?.name || 'Local'}
                  </p>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSaveTournament} className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1">
                {/* Name */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Nome do Campeonato</label>
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="EX: COPA ARENA COXIM 2026"
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 px-4 text-sm font-black text-slate-900 uppercase italic outline-none focus:border-primary-blue"
                  />
                </div>

                {/* Formats and Groups count */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Formato</label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as any)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 px-4 text-xs font-black text-slate-900 uppercase italic outline-none focus:border-primary-blue"
                    >
                      <option value="GRUPOS_E_PLAYOFFS">GRUPOS + PLAYOFFS</option>
                      <option value="GRUPOS">APENAS GRUPOS</option>
                      <option value="PLAYOFFS">APENAS MATA-MATA</option>
                    </select>
                  </div>

                  {format !== 'PLAYOFFS' && (
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Qtd de Grupos</label>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={groupsCount}
                        onChange={(e) => setGroupsCount(parseInt(e.target.value) || 1)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 px-4 text-sm font-black text-slate-900 outline-none focus:border-primary-blue"
                      />
                    </div>
                  )}

                  {format !== 'GRUPOS' && (
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Classificados p/ Grupo</label>
                      <input
                        type="number"
                        min={1}
                        max={4}
                        value={qualifiersPerGroup}
                        onChange={(e) => setQualifiersPerGroup(parseInt(e.target.value) || 1)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 px-4 text-sm font-black text-slate-900 outline-none focus:border-primary-blue"
                      />
                    </div>
                  )}
                </div>

                {/* Formato de Confrontos na Fase de Grupos */}
                {format !== 'PLAYOFFS' && (
                  <div className="space-y-2 bg-amber-50/70 p-4 rounded-2xl border border-amber-200/80">
                    <label className="text-[10px] uppercase font-black text-amber-900 tracking-widest block">
                      Formato de Confrontos (Fase de Grupos)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setGroupMatchFormat('NORMAL')}
                        className={`p-3.5 rounded-2xl border text-left flex flex-col transition-all cursor-pointer ${
                          groupMatchFormat === 'NORMAL'
                            ? 'bg-amber-400 border-amber-500 text-slate-950 font-black shadow-md ring-2 ring-amber-400/50'
                            : 'bg-white border-amber-200 text-slate-700 font-bold hover:bg-amber-100/50'
                        }`}
                      >
                        <span className="text-xs uppercase italic font-black flex items-center justify-between">
                          <span>NORMAL</span>
                          {groupMatchFormat === 'NORMAL' && <Check className="w-4 h-4 stroke-[3]" />}
                        </span>
                        <span className="text-[11px] opacity-85 font-medium mt-1">
                          Os times se enfrentam dentro do seu próprio grupo.
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setGroupMatchFormat('CRUZADO')}
                        className={`p-3.5 rounded-2xl border text-left flex flex-col transition-all cursor-pointer ${
                          groupMatchFormat === 'CRUZADO'
                            ? 'bg-amber-400 border-amber-500 text-slate-950 font-black shadow-md ring-2 ring-amber-400/50'
                            : 'bg-white border-amber-200 text-slate-700 font-bold hover:bg-amber-100/50'
                        }`}
                      >
                        <span className="text-xs uppercase italic font-black flex items-center justify-between">
                          <span>CRUZADO</span>
                          {groupMatchFormat === 'CRUZADO' && <Check className="w-4 h-4 stroke-[3]" />}
                        </span>
                        <span className="text-[11px] opacity-85 font-medium mt-1">
                          Os times de um grupo enfrentam todos os times do outro grupo (Ex: Grupo A vs Grupo B).
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Number of Teams */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Quantidade de Times</label>
                    <span className="text-xs font-black text-primary-blue">{formTeams.length} Times</span>
                  </div>
                  <input
                    type="number"
                    min={2}
                    max={16}
                    value={teamsCount}
                    onChange={(e) => handleTeamsCountChange(parseInt(e.target.value) || 2)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 px-4 text-sm font-black text-slate-900 outline-none focus:border-primary-blue"
                  />
                </div>

                {/* Teams List Configuration */}
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">Edição dos Times & Elenco ({locationPlayers.length} Atletas disponíveis no local)</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {formTeams.map((team, idx) => (
                      <div key={team.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={team.name}
                            onChange={(e) => {
                              const updated = [...formTeams];
                              updated[idx].name = e.target.value;
                              setFormTeams(updated);
                            }}
                            className="bg-white border border-gray-300 rounded-xl px-3 py-1.5 text-xs font-black text-slate-900 uppercase italic w-full"
                          />

                          {format !== 'PLAYOFFS' && (
                            <select
                              value={team.groupId || 'A'}
                              onChange={(e) => {
                                const updated = [...formTeams];
                                updated[idx].groupId = e.target.value;
                                setFormTeams(updated);
                              }}
                              className="bg-amber-400 text-slate-950 font-black text-xs uppercase px-2 py-1.5 rounded-xl shrink-0"
                            >
                              {Array.from({ length: groupsCount }).map((_, gIdx) => {
                                const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                                const gId = alphabet[gIdx] || 'A';
                                return (
                                  <option key={gId} value={gId}>
                                    Grupo {gId}
                                  </option>
                                );
                              })}
                            </select>
                          )}
                        </div>

                        {/* Escudo Management Block */}
                        <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-gray-200">
                          <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                            {team.logoUrl ? (
                              <img src={team.logoUrl} alt={team.name} className="w-full h-full object-contain filter drop-shadow-sm" />
                            ) : (
                              <Shield className="w-12 h-12 text-slate-300" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                              Escudo do Time
                            </span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <label className="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white text-[9px] font-black uppercase px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all shadow-xs">
                                <Upload className="w-3 h-3 text-amber-400" />
                                {team.logoUrl ? 'Alterar' : 'Carregar'}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      try {
                                        const compressed = await compressFileToDataUrl(file, 200, 60);
                                        const updated = [...formTeams];
                                        updated[idx].logoUrl = compressed;
                                        setFormTeams(updated);
                                      } catch (err) {
                                        alert("Erro ao processar imagem do escudo.");
                                      }
                                    }
                                  }}
                                />
                              </label>

                              {team.logoUrl && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...formTeams];
                                    updated[idx].logoUrl = undefined;
                                    setFormTeams(updated);
                                  }}
                                  className="bg-red-50 hover:bg-red-100 text-red-600 text-[9px] font-black uppercase px-2 py-1 rounded-lg flex items-center gap-1 transition-all"
                                  title="Excluir Escudo"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Excluir
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Player Selection button for team */}
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => setSelectingPlayersForTeamId(team.id)}
                            className="w-full bg-white border border-gray-300 text-slate-900 hover:bg-gray-100 font-bold text-[10px] uppercase py-2 rounded-xl flex items-center justify-center gap-1.5"
                          >
                            <UserPlus className="w-3.5 h-3.5 text-primary-blue" />
                            Escalar Atletas ({team.playerIds.length})
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-6 py-3 rounded-2xl text-xs font-black uppercase text-gray-500 hover:bg-gray-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-primary-blue text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-blue-800 transition-all shadow-lg active:scale-95"
                  >
                    Salvar Campeonato
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MATCH SCORE EDITOR MODAL */}
      <AnimatePresence>
        {editingMatch && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingMatch(null)}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="bg-slate-900 p-6 flex items-center justify-between text-white border-b border-gray-800">
                <h3 className="text-lg font-black uppercase italic text-amber-400">Lançar Resultado de Jogo</h3>
                <button onClick={() => setEditingMatch(null)} className="p-2 text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto flex-1">
                {/* Score Input */}
                <div className="flex items-center justify-around bg-gray-50 p-6 rounded-3xl border border-gray-200">
                  <div className="text-center space-y-2">
                    <p className="text-xs font-black uppercase text-slate-900 italic">
                      {activeTournament?.teams.find(t => t.id === editingMatch.teamAId)?.name || 'Time A'}
                    </p>
                    <input
                      type="number"
                      min={0}
                      value={scoreA}
                      onChange={(e) => setScoreA(parseInt(e.target.value) || 0)}
                      className="w-20 text-center bg-white border-2 border-primary-blue/30 rounded-2xl py-3 text-3xl font-black text-primary-blue outline-none"
                    />
                  </div>

                  <span className="text-2xl font-black text-amber-500 italic">X</span>

                  <div className="text-center space-y-2">
                    <p className="text-xs font-black uppercase text-slate-900 italic">
                      {activeTournament?.teams.find(t => t.id === editingMatch.teamBId)?.name || 'Time B'}
                    </p>
                    <input
                      type="number"
                      min={0}
                      value={scoreB}
                      onChange={(e) => setScoreB(parseInt(e.target.value) || 0)}
                      className="w-20 text-center bg-white border-2 border-primary-blue/30 rounded-2xl py-3 text-3xl font-black text-primary-blue outline-none"
                    />
                  </div>
                </div>

                {/* Match Date and Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-gray-400">Data do Jogo</label>
                    <input
                      type="date"
                      value={matchDate}
                      onChange={(e) => setMatchDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-black"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-gray-400">Horário</label>
                    <input
                      type="time"
                      value={matchTime}
                      onChange={(e) => setMatchTime(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-black"
                    />
                  </div>
                </div>

                {/* MVP Selection */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-gray-400 tracking-wider flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> Craque da Partida (MVP)
                  </label>
                  <select
                    value={matchMvpId}
                    onChange={(e) => setMatchMvpId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-3 text-xs font-black text-slate-900"
                  >
                    <option value="">Nenhum Craque selecionado</option>
                    {locationPlayers.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingMatch(null)}
                    className="px-5 py-2.5 rounded-xl text-xs font-black uppercase text-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveMatchResult}
                    className="bg-primary-blue text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-blue-800 transition-all shadow-md active:scale-95"
                  >
                    Salvar Resultado
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PLAYER SELECTION FOR TEAM MODAL */}
      <AnimatePresence>
        {selectingPlayersForTeamId && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectingPlayersForTeamId(null)}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
            >
              <div className="bg-slate-900 p-5 flex items-center justify-between text-white">
                <h4 className="text-sm font-black uppercase italic text-amber-400">Escalar Atletas do Local</h4>
                <button onClick={() => setSelectingPlayersForTeamId(null)} className="p-1 text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-3 flex-1 overflow-y-auto">
                <input
                  type="text"
                  value={playerSearchTerm}
                  onChange={(e) => setPlayerSearchTerm(e.target.value)}
                  placeholder="Pesquisar atleta pelo nome..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-black text-slate-900 outline-none"
                />

                <div className="space-y-1">
                  {sortPlayersByPosition(
                    locationPlayers.filter(p => p.name.toLowerCase().includes(playerSearchTerm.toLowerCase()) || p.nickname?.toLowerCase().includes(playerSearchTerm.toLowerCase()))
                  ).map(player => {
                    const currentTeam = formTeams.find(t => t.id === selectingPlayersForTeamId);
                    const isSelected = currentTeam?.playerIds.includes(player.id);

                    return (
                      <div
                        key={player.id}
                        onClick={() => {
                          if (!currentTeam) return;
                          const updated = [...formTeams];
                          const tIdx = updated.findIndex(t => t.id === selectingPlayersForTeamId);
                          if (tIdx !== -1) {
                            if (isSelected) {
                              updated[tIdx].playerIds = updated[tIdx].playerIds.filter(id => id !== player.id);
                            } else {
                              updated[tIdx].playerIds.push(player.id);
                            }
                            setFormTeams(updated);
                          }
                        }}
                        className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-amber-400/10 border-amber-400 text-slate-900 font-black'
                            : 'bg-white border-gray-100 hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase">{player.nickname || player.name}</span>
                          <span className="text-[9px] uppercase font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {getPositionLabel(player.position)}
                          </span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-amber-500 stroke-[3]" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectingPlayersForTeamId(null)}
                  className="bg-slate-900 text-white font-black text-xs uppercase px-6 py-2.5 rounded-xl"
                >
                  Concluir Escalação
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Team Squad Tactical Pitch Modal */}
      <TeamSquadModal
        team={squadModalTeam}
        players={locationPlayers}
        onClose={() => setSquadModalTeam(null)}
      />
    </div>
  );
}
