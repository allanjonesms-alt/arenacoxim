import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  query,
  orderBy 
} from 'firebase/firestore';
import { Player, Match, AdminData, CartolaSettings, CartolaUserTeam, Position } from '../types';
import { 
  DEFAULT_CARTOLA_SETTINGS, 
  DEFAULT_CARTOLA_SCORING_RULES, 
  calculatePlayerAllCartolaPoints,
  calculatePlayerMatchCartolaPoints,
  calculateTeamPoints 
} from '../utils/cartolaUtils';
import { getPositionAbbr, getPositionColor } from '../utils/playerUtils';
import { handleFirestoreError, OperationType } from '../App';
import { 
  Trophy, 
  Users, 
  CheckCircle2, 
  Lock, 
  Unlock, 
  Play, 
  RefreshCw, 
  Settings, 
  Search, 
  Award, 
  Star, 
  Crown, 
  Zap, 
  TrendingUp, 
  Plus, 
  Trash2, 
  Edit, 
  Eye, 
  Sparkles, 
  Shield, 
  Shirt, 
  UserPlus, 
  X, 
  ChevronRight,
  Info,
  Sliders,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SoccerBall } from '../components/Icons';

interface CartolaAdminProps {
  adminData?: AdminData | null;
}

export default function CartolaAdmin({ adminData }: CartolaAdminProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'teams' | 'scores' | 'ranking' | 'settings'>('overview');
  const [loading, setLoading] = useState(true);
  const [processingSync, setProcessingSync] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  // Firestore state
  const [settings, setSettings] = useState<CartolaSettings>(DEFAULT_CARTOLA_SETTINGS);
  const [userTeams, setUserTeams] = useState<CartolaUserTeam[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeamForModal, setSelectedTeamForModal] = useState<CartolaUserTeam | null>(null);

  // Create / Edit Team Modal State (for Admin simulation / user escalation)
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [formTeamName, setFormTeamName] = useState('');
  const [formUserName, setFormUserName] = useState('');
  const [formSelectedPlayers, setFormSelectedPlayers] = useState<string[]>([]);
  const [formCaptainId, setFormCaptainId] = useState<string>('');
  const [playerSearchText, setPlayerSearchText] = useState('');
  const [posFilter, setPosFilter] = useState<string>('all');

  // Settings Form State
  const [editRules, setEditRules] = useState(DEFAULT_CARTOLA_SCORING_RULES);
  const [editSeason, setEditSeason] = useState('Temporada 2026');
  const [editRound, setEditRound] = useState(1);
  const [editMaxPlayers, setEditMaxPlayers] = useState(8);
  const [editCaptainMult, setEditCaptainMult] = useState(1.5);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // 1. Load data from Firestore
  useEffect(() => {
    setLoading(true);

    // Listen to Settings
    const unsubSettings = onSnapshot(doc(db, 'cartola_settings', 'config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as CartolaSettings;
        setSettings(data);
        setEditRules(data.scoringRules || DEFAULT_CARTOLA_SCORING_RULES);
        setEditSeason(data.seasonName || 'Temporada 2026');
        setEditRound(data.currentRound || 1);
        setEditMaxPlayers(data.maxPlayersPerTeam || 8);
        setEditCaptainMult(data.captainMultiplier || 1.5);
      } else {
        // Initialize if empty
        setDoc(doc(db, 'cartola_settings', 'config'), DEFAULT_CARTOLA_SETTINGS).catch(console.error);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'cartola_settings'));

    // Listen to User Teams
    const qTeams = query(collection(db, 'cartola_teams'), orderBy('totalPoints', 'desc'));
    const unsubTeams = onSnapshot(qTeams, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CartolaUserTeam));
      setUserTeams(list);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'cartola_teams'));

    // Fetch Players
    const unsubPlayers = onSnapshot(collection(db, 'players'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
      setPlayers(list.sort((a, b) => a.name.localeCompare(b.name)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'players'));

    // Fetch Matches
    const unsubMatches = onSnapshot(collection(db, 'matches'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
      setMatches(list);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'matches'));

    return () => {
      unsubSettings();
      unsubTeams();
      unsubPlayers();
      unsubMatches();
    };
  }, []);

  // Map of player fantasy scores
  const playerScoresMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    const rules = settings.scoringRules || DEFAULT_CARTOLA_SCORING_RULES;
    players.forEach(p => {
      const res = calculatePlayerAllCartolaPoints(p, matches, rules);
      map[p.id] = res.totalPoints;
    });
    return map;
  }, [players, matches, settings.scoringRules]);

  // Player Stats breakdown map
  const playerStatsMap = React.useMemo(() => {
    const map: Record<string, ReturnType<typeof calculatePlayerAllCartolaPoints>> = {};
    const rules = settings.scoringRules || DEFAULT_CARTOLA_SCORING_RULES;
    players.forEach(p => {
      map[p.id] = calculatePlayerAllCartolaPoints(p, matches, rules);
    });
    return map;
  }, [players, matches, settings.scoringRules]);

  // Most Picked Player
  const mostPickedPlayer = React.useMemo(() => {
    const countMap: Record<string, number> = {};
    userTeams.forEach(t => {
      (t.playerIds || []).forEach(pId => {
        countMap[pId] = (countMap[pId] || 0) + 1;
      });
    });
    let topId = '';
    let max = 0;
    Object.entries(countMap).forEach(([pId, cnt]) => {
      if (cnt > max) {
        max = cnt;
        topId = pId;
      }
    });
    const playerObj = players.find(p => p.id === topId);
    return { player: playerObj, count: max };
  }, [userTeams, players]);

  // Top Fantasy Player
  const topFantasyPlayer = React.useMemo(() => {
    let topP: Player | null = null;
    let maxPts = -999;
    players.forEach(p => {
      const pts = playerScoresMap[p.id] || 0;
      if (pts > maxPts) {
        maxPts = pts;
        topP = p;
      }
    });
    return { player: topP, points: maxPts > -999 ? maxPts : 0 };
  }, [players, playerScoresMap]);

  // 2. Toggle Market Status (Open / Closed)
  const handleToggleMarket = async () => {
    const newStatus = settings.marketStatus === 'open' ? 'closed' : 'open';
    try {
      await updateDoc(doc(db, 'cartola_settings', 'config'), {
        marketStatus: newStatus,
        updatedAt: Date.now()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'cartola_settings');
    }
  };

  // 3. Process & Recalculate Round Scores for all User Teams
  const handleProcessCartolaScores = async () => {
    setProcessingSync(true);
    setSyncSuccessMsg(null);
    try {
      const rules = settings.scoringRules || DEFAULT_CARTOLA_SCORING_RULES;
      const captainMult = settings.captainMultiplier || 1.5;
      const roundNum = settings.currentRound || 1;

      // 1. Calculate points for all players
      const tempPlayerPtsMap: Record<string, number> = {};
      players.forEach(p => {
        const res = calculatePlayerAllCartolaPoints(p, matches, rules);
        tempPlayerPtsMap[p.id] = res.totalPoints;
      });

      // 2. Update user teams
      let updatedCount = 0;
      for (const team of userTeams) {
        const { totalTeamPoints } = calculateTeamPoints(team, tempPlayerPtsMap, captainMult);
        const roundScores = { ...(team.roundScores || {}), [String(roundNum)]: totalTeamPoints };

        await updateDoc(doc(db, 'cartola_teams', team.id), {
          totalPoints: totalTeamPoints,
          roundScores,
          updatedAt: Date.now()
        });
        updatedCount++;
      }

      setSyncSuccessMsg(`Pontuações do Cartola calculadas com sucesso! ${updatedCount} time(s) atualizado(s).`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'cartola_teams');
    } finally {
      setProcessingSync(false);
    }
  };

  // 4. Save Cartola Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const updated: CartolaSettings = {
        marketStatus: settings.marketStatus,
        currentRound: Number(editRound),
        seasonName: editSeason,
        maxPlayersPerTeam: Number(editMaxPlayers),
        captainMultiplier: Number(editCaptainMult),
        scoringRules: editRules,
        updatedAt: Date.now()
      };
      await setDoc(doc(db, 'cartola_settings', 'config'), updated);
      setSyncSuccessMsg('Configurações do Cartola salvas com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'cartola_settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // 5. Create / Edit Team Submit
  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTeamName.trim()) {
      alert('Por favor, informe o nome do time.');
      return;
    }
    if (formSelectedPlayers.length === 0) {
      alert('Selecione ao menos 1 atleta para o time.');
      return;
    }
    if (formSelectedPlayers.length > (settings.maxPlayersPerTeam || 8)) {
      alert(`Você pode escolher no máximo ${settings.maxPlayersPerTeam || 8} atletas.`);
      return;
    }

    try {
      const captainId = formCaptainId || formSelectedPlayers[0];
      const teamData: Omit<CartolaUserTeam, 'id'> = {
        userId: editingTeamId ? (userTeams.find(t => t.id === editingTeamId)?.userId || 'admin_user') : `user_${Date.now()}`,
        userName: formUserName.trim() || 'Usuário Arena',
        teamName: formTeamName.trim(),
        playerIds: formSelectedPlayers,
        captainId,
        totalPoints: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Calculate initial points
      const { totalTeamPoints } = calculateTeamPoints(
        teamData as CartolaUserTeam, 
        playerScoresMap, 
        settings.captainMultiplier || 1.5
      );
      teamData.totalPoints = totalTeamPoints;

      if (editingTeamId) {
        await updateDoc(doc(db, 'cartola_teams', editingTeamId), teamData as any);
      } else {
        const newRef = doc(collection(db, 'cartola_teams'));
        await setDoc(newRef, teamData);
      }

      setShowTeamModal(false);
      resetTeamForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'cartola_teams');
    }
  };

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (!confirm(`Deseja realmente remover o time "${teamName}" do Cartola Arena?`)) return;
    try {
      await deleteDoc(doc(db, 'cartola_teams', teamId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'cartola_teams');
    }
  };

  const openEditTeam = (team: CartolaUserTeam) => {
    setEditingTeamId(team.id);
    setFormTeamName(team.teamName);
    setFormUserName(team.userName);
    setFormSelectedPlayers(team.playerIds || []);
    setFormCaptainId(team.captainId || (team.playerIds?.[0] || ''));
    setShowTeamModal(true);
  };

  const resetTeamForm = () => {
    setEditingTeamId(null);
    setFormTeamName('');
    setFormUserName('');
    setFormSelectedPlayers([]);
    setFormCaptainId('');
  };

  const togglePlayerSelection = (playerId: string) => {
    if (formSelectedPlayers.includes(playerId)) {
      const updated = formSelectedPlayers.filter(id => id !== playerId);
      setFormSelectedPlayers(updated);
      if (formCaptainId === playerId) {
        setFormCaptainId(updated[0] || '');
      }
    } else {
      if (formSelectedPlayers.length >= (settings.maxPlayersPerTeam || 8)) {
        alert(`O limite é de até ${settings.maxPlayersPerTeam || 8} atletas no time!`);
        return;
      }
      const updated = [...formSelectedPlayers, playerId];
      setFormSelectedPlayers(updated);
      if (!formCaptainId) {
        setFormCaptainId(playerId);
      }
    }
  };

  // Filtered teams list
  const filteredTeams = userTeams.filter(t => 
    t.teamName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.userName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filtered players list in Modal
  const modalPlayers = players.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(playerSearchText.toLowerCase()) ||
                          (p.nickname || '').toLowerCase().includes(playerSearchText.toLowerCase());
    const matchesPos = posFilter === 'all' || p.position === posFilter;
    return matchesSearch && matchesPos;
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Page Header */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 rounded-[2.5rem] p-6 sm:p-8 text-white border border-emerald-500/30 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-gradient-to-br from-amber-400 to-yellow-500 p-2.5 rounded-2xl text-slate-950 shadow-lg">
                <Shirt className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 bg-amber-400/10 px-3 py-1 rounded-full border border-amber-400/20">
                  FERRAMENTA ADMINISTRATIVA
                </span>
                <h1 className="text-3xl sm:text-4xl font-black italic tracking-tight uppercase mt-1">
                  CARTOLA <span className="text-amber-400">ARENA</span>
                </h1>
              </div>
            </div>
            <p className="text-sm text-emerald-100/80 font-medium max-w-xl">
              Gerencie o Fantasy Game oficial da Arena Coxim. Configure rodadas, controle a abertura do mercado, escale times e apure a pontuação dos atletas em tempo real.
            </p>
          </div>

          {/* Market Status Card */}
          <div className={`p-5 rounded-2xl border backdrop-blur-md flex flex-col sm:flex-row items-center gap-4 ${
            settings.marketStatus === 'open'
              ? 'bg-emerald-950/80 border-emerald-400/40 shadow-emerald-900/40 shadow-xl'
              : 'bg-red-950/80 border-red-500/40 shadow-red-900/40 shadow-xl'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${
                settings.marketStatus === 'open' ? 'bg-emerald-500 text-slate-950' : 'bg-red-500 text-white'
              }`}>
                {settings.marketStatus === 'open' ? <Unlock className="w-6 h-6 animate-pulse" /> : <Lock className="w-6 h-6" />}
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-widest text-gray-300">STATUS DO MERCADO</span>
                <span className={`text-lg font-black uppercase tracking-wider ${
                  settings.marketStatus === 'open' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {settings.marketStatus === 'open' ? 'MERCADO ABERTO' : 'MERCADO FECHADO'}
                </span>
                <span className="block text-xs font-semibold text-gray-300">
                  {settings.seasonName} • {settings.currentRound ? `Rodada ${settings.currentRound}` : 'Rodada 1'}
                </span>
              </div>
            </div>

            <button
              onClick={handleToggleMarket}
              className={`px-5 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center gap-2 shrink-0 ${
                settings.marketStatus === 'open'
                  ? 'bg-red-600 hover:bg-red-700 text-white border border-red-400/30'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border border-emerald-300/30'
              }`}
            >
              {settings.marketStatus === 'open' ? (
                <>
                  <Lock className="w-4 h-4" /> Fechar Mercado
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" /> Abrir Mercado
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tab Navigation Buttons */}
        <div className="flex flex-wrap items-center gap-2 mt-8 pt-6 border-t border-emerald-500/20">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'bg-amber-400 text-slate-950 shadow-md font-extrabold'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Zap className="w-4 h-4" /> Visão Geral
          </button>

          <button
            onClick={() => setActiveTab('teams')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'teams'
                ? 'bg-amber-400 text-slate-950 shadow-md font-extrabold'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Shirt className="w-4 h-4" /> Times dos Usuários ({userTeams.length})
          </button>

          <button
            onClick={() => setActiveTab('scores')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'scores'
                ? 'bg-amber-400 text-slate-950 shadow-md font-extrabold'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <RefreshCw className="w-4 h-4" /> Apurar Pontuações
          </button>

          <button
            onClick={() => setActiveTab('ranking')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'ranking'
                ? 'bg-amber-400 text-slate-950 shadow-md font-extrabold'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Trophy className="w-4 h-4" /> Ranking Geral
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'bg-amber-400 text-slate-950 shadow-md font-extrabold'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Settings className="w-4 h-4" /> Regras & Mercado
          </button>
        </div>
      </div>

      {/* Sync Success Feedback Toast */}
      {syncSuccessMsg && (
        <div className="bg-emerald-100 border border-emerald-400 text-emerald-900 px-5 py-3.5 rounded-2xl flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold">{syncSuccessMsg}</span>
          </div>
          <button onClick={() => setSyncSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-950">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* --- TAB 1: VISÃO GERAL --- */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-app-card p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="p-3.5 rounded-2xl bg-amber-50 text-amber-600">
                <Shirt className="w-7 h-7" />
              </div>
              <div>
                <span className="text-2xl font-black italic text-primary-gray">{userTeams.length}</span>
                <span className="block text-[10px] uppercase font-black text-gray-400 tracking-wider">Times Escalados</span>
              </div>
            </div>

            <div className="bg-app-card p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="p-3.5 rounded-2xl bg-blue-50 text-primary-blue">
                <Users className="w-7 h-7" />
              </div>
              <div>
                <span className="text-2xl font-black italic text-primary-gray">{players.length}</span>
                <span className="block text-[10px] uppercase font-black text-gray-400 tracking-wider">Atletas Disponíveis</span>
              </div>
            </div>

            <div className="bg-app-card p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-600">
                <SoccerBall className="w-7 h-7" />
              </div>
              <div>
                <span className="text-2xl font-black italic text-primary-gray">
                  {matches.filter(m => m.status === 'finished').length}
                </span>
                <span className="block text-[10px] uppercase font-black text-gray-400 tracking-wider">Partidas Computadas</span>
              </div>
            </div>

            <div className="bg-app-card p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="p-3.5 rounded-2xl bg-purple-50 text-purple-600">
                <Crown className="w-7 h-7" />
              </div>
              <div>
                <span className="text-2xl font-black italic text-primary-gray">
                  {userTeams.length > 0 ? userTeams[0].totalPoints.toFixed(1) : '0.0'} pts
                </span>
                <span className="block text-[10px] uppercase font-black text-gray-400 tracking-wider">Líder do Ranking</span>
              </div>
            </div>
          </div>

          {/* Quick Action & Highlights */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Top Fantasy Player */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-3xl text-white border border-slate-800 shadow-lg relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-400/10 px-3 py-1 rounded-full border border-amber-400/20 flex items-center gap-1">
                  <Star className="w-3 h-3 fill-amber-400" /> MITO DA TEMPORADA
                </span>
                <Trophy className="w-6 h-6 text-amber-400" />
              </div>

              {topFantasyPlayer.player ? (
                <div className="flex items-center gap-4 my-2">
                  <img 
                    src={topFantasyPlayer.player.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(topFantasyPlayer.player.name)}&background=random`} 
                    alt={topFantasyPlayer.player.name}
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-400 shadow-md shrink-0" 
                  />
                  <div>
                    <h3 className="text-lg font-black uppercase text-white tracking-tight">
                      {topFantasyPlayer.player.nickname || topFantasyPlayer.player.name}
                    </h3>
                    <span className="text-xs font-bold text-gray-400 uppercase">
                      {topFantasyPlayer.player.position}
                    </span>
                    <div className="text-xl font-black text-amber-400 italic mt-1">
                      {topFantasyPlayer.points} <span className="text-xs">pts Cartola</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-4">Nenhum atleta registrado com pontos.</p>
              )}

              <p className="text-[11px] text-gray-400 mt-2 border-t border-slate-800 pt-3">
                Atleta com a maior pontuação acumulada nas partidas computadas.
              </p>
            </div>

            {/* Most Picked Player */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-3xl text-white border border-slate-800 shadow-lg relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20 flex items-center gap-1">
                  <Shirt className="w-3 h-3" /> MAIS ESCALADO
                </span>
                <Users className="w-6 h-6 text-emerald-400" />
              </div>

              {mostPickedPlayer.player ? (
                <div className="flex items-center gap-4 my-2">
                  <img 
                    src={mostPickedPlayer.player.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(mostPickedPlayer.player.name)}&background=random`} 
                    alt={mostPickedPlayer.player.name}
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-400 shadow-md shrink-0" 
                  />
                  <div>
                    <h3 className="text-lg font-black uppercase text-white tracking-tight">
                      {mostPickedPlayer.player.nickname || mostPickedPlayer.player.name}
                    </h3>
                    <span className="text-xs font-bold text-gray-400 uppercase">
                      {mostPickedPlayer.player.position}
                    </span>
                    <div className="text-xl font-black text-emerald-400 italic mt-1">
                      {mostPickedPlayer.count} <span className="text-xs">escalações</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-4">Nenhum time escalado ainda.</p>
              )}

              <p className="text-[11px] text-gray-400 mt-2 border-t border-slate-800 pt-3">
                Atleta presente na maior quantidade de times dos usuários.
              </p>
            </div>

            {/* Process Scores CTA Card */}
            <div className="bg-gradient-to-br from-amber-500 to-yellow-600 p-6 rounded-3xl text-slate-950 shadow-xl flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest bg-slate-950/10 px-3 py-1 rounded-full">
                  AÇÃO RÁPIDA DE APURAÇÃO
                </span>
                <h3 className="text-2xl font-black italic uppercase tracking-tight mt-3">
                  APURAR RODADA
                </h3>
                <p className="text-xs font-semibold text-slate-900/80 mt-1">
                  Calcule os pontos dos atletas nas partidas finalizadas e atualize instantaneamente a tabela de pontuação dos usuários.
                </p>
              </div>

              <button
                onClick={handleProcessCartolaScores}
                disabled={processingSync}
                className="mt-6 w-full bg-slate-950 hover:bg-slate-900 text-amber-400 font-black py-3.5 px-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
              >
                {processingSync ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Processando Pontuações...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" /> Processar Pontuações Agora
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* --- TAB 2: TIMES DOS USUÁRIOS --- */}
      {activeTab === 'teams' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-app-card p-4 rounded-3xl border border-gray-100 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar time ou usuário..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>

            <button
              onClick={() => {
                resetTeamForm();
                setShowTeamModal(true);
              }}
              className="w-full sm:w-auto bg-primary-blue hover:bg-blue-800 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4 text-amber-400" /> Escalar / Criar Time
            </button>
          </div>

          {filteredTeams.length === 0 ? (
            <div className="bg-app-card rounded-3xl p-12 text-center border border-gray-100 shadow-sm">
              <Shirt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-black uppercase text-gray-700">Nenhum time do Cartola encontrado</h3>
              <p className="text-xs text-gray-400 mt-1">
                {searchTerm ? 'Nenhum resultado para a busca efetuada.' : 'Nenhum usuário escalou um time até o momento.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTeams.map((team, idx) => {
                const isLeader = idx === 0;
                return (
                  <motion.div
                    key={team.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-app-card rounded-3xl p-6 border transition-all shadow-sm hover:shadow-md flex flex-col justify-between relative overflow-hidden ${
                      isLeader ? 'border-amber-400/60 ring-2 ring-amber-400/20' : 'border-gray-100'
                    }`}
                  >
                    {isLeader && (
                      <div className="absolute -right-12 -top-12 w-28 h-28 bg-amber-400/10 rounded-full blur-xl pointer-events-none" />
                    )}

                    <div>
                      {/* Top Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center ${
                            idx === 0 ? 'bg-amber-400 text-slate-950 font-extrabold shadow-sm' :
                            idx === 1 ? 'bg-gray-300 text-slate-900 font-extrabold' :
                            idx === 2 ? 'bg-amber-700 text-white font-extrabold' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            #{idx + 1}
                          </span>
                          <div>
                            <h3 className="font-black uppercase text-primary-gray tracking-tight text-sm">
                              {team.teamName}
                            </h3>
                            <span className="text-[11px] font-bold text-gray-400">
                              Usuário: <strong className="text-primary-blue">{team.userName}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="block text-xl font-black italic text-amber-500 leading-none">
                            {team.totalPoints.toFixed(1)}
                          </span>
                          <span className="text-[9px] font-bold uppercase text-gray-400">PTS TOTAL</span>
                        </div>
                      </div>

                      {/* Escalated Players Grid */}
                      <div className="space-y-2 my-4 pt-3 border-t border-gray-100">
                        <span className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">
                          Atletas Escalados ({team.playerIds?.length || 0}/8):
                        </span>
                        
                        <div className="grid grid-cols-2 gap-2">
                          {(team.playerIds || []).map(pId => {
                            const playerObj = players.find(p => p.id === pId);
                            const isCaptain = team.captainId === pId;
                            const pts = playerScoresMap[pId] || 0;

                            return (
                              <div 
                                key={pId} 
                                className={`p-2 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                                  isCaptain ? 'bg-amber-50 border-amber-300 text-slate-900' : 'bg-gray-50 border-gray-100 text-gray-700'
                                }`}
                              >
                                <div className="relative shrink-0">
                                  <img 
                                    src={playerObj?.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(playerObj?.name || 'P')}`} 
                                    alt="" 
                                    className="w-7 h-7 rounded-lg object-cover" 
                                  />
                                  {isCaptain && (
                                    <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 font-black text-[8px] px-1 rounded-full border border-white">
                                      C
                                    </span>
                                  )}
                                </div>
                                <div className="truncate min-w-0">
                                  <span className="block truncate text-[11px] font-black leading-tight">
                                    {playerObj ? (playerObj.nickname || playerObj.name) : 'Atleta'}
                                  </span>
                                  <span className="text-[9px] font-bold text-gray-400">
                                    {pts.toFixed(1)} pts
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-2">
                      <button
                        onClick={() => setSelectedTeamForModal(team)}
                        className="text-xs font-black uppercase text-primary-blue hover:text-blue-800 flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" /> Detalhes
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditTeam(team)}
                          className="p-2 text-gray-400 hover:text-primary-blue hover:bg-blue-50 rounded-xl transition-all"
                          title="Editar Time"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTeam(team.id, team.teamName)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          title="Excluir Time"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- TAB 3: APURAR PONTUAÇÕES --- */}
      {activeTab === 'scores' && (
        <div className="space-y-6">
          <div className="bg-app-card rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="text-lg font-black uppercase text-primary-blue tracking-tight">
                Processador de Pontuação dos Atletas
              </h3>
              <p className="text-xs text-gray-500 font-medium mt-1 max-w-xl">
                Abaixo você visualiza o desempenho e os pontos calculados de cada atleta com base nas partidas finalizadas. Clique no botão de apuração para atualizar a tabela do Cartola.
              </p>
            </div>

            <button
              onClick={handleProcessCartolaScores}
              disabled={processingSync}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs uppercase tracking-wider px-6 py-3.5 rounded-2xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 shrink-0"
            >
              {processingSync ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Apurando...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" /> Apurar Pontuações Agora
                </>
              )}
            </button>
          </div>

          {/* Players Fantasy Scores Table */}
          <div className="bg-app-card rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-600">
                Tabela de Desempenho dos Atletas ({players.length})
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 uppercase font-black tracking-widest text-[10px] border-b border-gray-100">
                    <th className="p-4">Atleta</th>
                    <th className="p-4 text-center">Posição</th>
                    <th className="p-4 text-center">Jogos</th>
                    <th className="p-4 text-center">Gols (+8.0)</th>
                    <th className="p-4 text-center">Assist. (+5.0)</th>
                    <th className="p-4 text-center">SG (+5.0)</th>
                    <th className="p-4 text-center">MVP (+5.0)</th>
                    <th className="p-4 text-right">Pts Cartola</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {players.map((p) => {
                    const stats = playerStatsMap[p.id] || { totalPoints: 0, matchCount: 0, totalGoals: 0, totalAssists: 0, cleanSheets: 0, mvpCount: 0 };
                    
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="p-4 flex items-center gap-3">
                          <img 
                            src={p.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}`} 
                            alt="" 
                            className="w-9 h-9 rounded-xl object-cover border border-gray-200" 
                          />
                          <div>
                            <span className="block font-black text-gray-800 text-sm">
                              {p.nickname || p.name}
                            </span>
                            <span className="text-[10px] text-gray-400 font-semibold">{p.name}</span>
                          </div>
                        </td>

                        <td className="p-4 text-center">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${getPositionColor(p.position)}`}>
                            {getPositionAbbr(p.position)}
                          </span>
                        </td>

                        <td className="p-4 text-center font-black text-gray-700">{stats.matchCount}</td>
                        <td className="p-4 text-center font-black text-emerald-600">{stats.totalGoals}</td>
                        <td className="p-4 text-center font-black text-blue-600">{stats.totalAssists}</td>
                        <td className="p-4 text-center font-black text-purple-600">{stats.cleanSheets}</td>
                        <td className="p-4 text-center font-black text-amber-500">{stats.mvpCount}</td>

                        <td className="p-4 text-right">
                          <span className="text-base font-black text-amber-500 italic">
                            {stats.totalPoints.toFixed(1)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 4: RANKING GERAL --- */}
      {activeTab === 'ranking' && (
        <div className="space-y-6">
          {/* Podium Top 3 */}
          {userTeams.length >= 3 && (
            <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto pt-6">
              {/* 2nd Place */}
              <div className="flex flex-col items-center justify-end">
                <div className="text-center mb-2">
                  <span className="text-xs font-black uppercase text-gray-500 block">{userTeams[1]?.teamName}</span>
                  <span className="text-lg font-black text-gray-700 italic">{userTeams[1]?.totalPoints.toFixed(1)} pts</span>
                </div>
                <div className="w-full bg-slate-200 border border-slate-300 rounded-t-3xl h-28 flex flex-col items-center justify-center p-3 shadow-inner">
                  <div className="w-10 h-10 rounded-full bg-slate-300 border-2 border-white flex items-center justify-center font-black text-slate-800 shadow-sm text-sm">
                    2º
                  </div>
                  <span className="text-[10px] font-black uppercase text-slate-600 mt-1">Prata</span>
                </div>
              </div>

              {/* 1st Place */}
              <div className="flex flex-col items-center justify-end">
                <Crown className="w-8 h-8 text-amber-400 mb-1 animate-bounce" />
                <div className="text-center mb-2">
                  <span className="text-xs font-black uppercase text-amber-600 block">{userTeams[0]?.teamName}</span>
                  <span className="text-xl font-black text-amber-500 italic">{userTeams[0]?.totalPoints.toFixed(1)} pts</span>
                </div>
                <div className="w-full bg-gradient-to-t from-amber-500 to-amber-300 border border-amber-400 rounded-t-3xl h-36 flex flex-col items-center justify-center p-3 shadow-lg">
                  <div className="w-12 h-12 rounded-full bg-slate-950 text-amber-400 border-2 border-white flex items-center justify-center font-black shadow-md text-base">
                    1º
                  </div>
                  <span className="text-[10px] font-black uppercase text-slate-950 mt-1">Ouro</span>
                </div>
              </div>

              {/* 3rd Place */}
              <div className="flex flex-col items-center justify-end">
                <div className="text-center mb-2">
                  <span className="text-xs font-black uppercase text-amber-800 block">{userTeams[2]?.teamName}</span>
                  <span className="text-lg font-black text-amber-800 italic">{userTeams[2]?.totalPoints.toFixed(1)} pts</span>
                </div>
                <div className="w-full bg-amber-200 border border-amber-300 rounded-t-3xl h-20 flex flex-col items-center justify-center p-3 shadow-inner">
                  <div className="w-10 h-10 rounded-full bg-amber-400 text-slate-950 border-2 border-white flex items-center justify-center font-black shadow-sm text-sm">
                    3º
                  </div>
                  <span className="text-[10px] font-black uppercase text-amber-900 mt-1">Bronze</span>
                </div>
              </div>
            </div>
          )}

          {/* Ranking Table */}
          <div className="bg-app-card rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-sm font-black uppercase text-primary-blue tracking-wider">
                Classificação Geral do Cartola Arena ({userTeams.length} Times)
              </h3>
            </div>

            {userTeams.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs">
                Nenhum time registrado no ranking ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-400 uppercase font-black tracking-widest text-[10px] border-b border-gray-100">
                      <th className="p-4 text-center w-16">Pos</th>
                      <th className="p-4">Time do Cartola</th>
                      <th className="p-4">Usuário</th>
                      <th className="p-4 text-center">Atletas</th>
                      <th className="p-4 text-right">Pontuação Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-bold">
                    {userTeams.map((team, idx) => (
                      <tr key={team.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="p-4 text-center">
                          <span className={`w-7 h-7 rounded-xl font-black text-xs inline-flex items-center justify-center ${
                            idx === 0 ? 'bg-amber-400 text-slate-950 font-extrabold' :
                            idx === 1 ? 'bg-gray-300 text-slate-900 font-extrabold' :
                            idx === 2 ? 'bg-amber-700 text-white font-extrabold' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {idx + 1}º
                          </span>
                        </td>

                        <td className="p-4">
                          <span className="font-black text-gray-800 text-sm uppercase block">
                            {team.teamName}
                          </span>
                        </td>

                        <td className="p-4 text-gray-600">
                          {team.userName}
                        </td>

                        <td className="p-4 text-center">
                          <span className="bg-gray-100 px-2.5 py-1 rounded-lg text-gray-700 font-bold">
                            {team.playerIds?.length || 0} / 8
                          </span>
                        </td>

                        <td className="p-4 text-right">
                          <span className="text-base font-black text-amber-500 italic">
                            {team.totalPoints.toFixed(1)} pts
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TAB 5: REGRAS & CONFIGURAÇÕES --- */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-app-card rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-8">
          <div>
            <h3 className="text-xl font-black uppercase text-primary-blue tracking-tight flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-500" /> Configurações de Rodada e Pontuação
            </h3>
            <p className="text-xs text-gray-500 mt-1 font-medium">
              Ajuste as pontuações e parâmetros do Cartola Arena para adequar ao regulamento do campeonato.
            </p>
          </div>

          {/* General Market Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5">
                Nome da Temporada
              </label>
              <input
                type="text"
                value={editSeason}
                onChange={(e) => setEditSeason(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5">
                Número da Rodada Atual
              </label>
              <input
                type="number"
                min="1"
                value={editRound}
                onChange={(e) => setEditRound(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5">
                Max de Atletas por Time
              </label>
              <input
                type="number"
                min="1"
                max="12"
                value={editMaxPlayers}
                onChange={(e) => setEditMaxPlayers(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5">
                Multiplicador do Capitão
              </label>
              <select
                value={editCaptainMult}
                onChange={(e) => setEditCaptainMult(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 focus:outline-none focus:border-amber-400"
              >
                <option value={1.5}>1.5x (50% a mais)</option>
                <option value={2.0}>2.0x (Dobro de pontos)</option>
                <option value={1.0}>1.0x (Sem bônus)</option>
              </select>
            </div>
          </div>

          {/* Scoring Rules Grid */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-gray-700 mb-4 pb-2 border-b border-gray-100">
              Pontuação por Ação na Partida (Pontos do Atleta)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <div>
                <label className="block text-[10px] font-black uppercase text-emerald-600 mb-1">
                  Gol Marcado (+pts)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editRules.goal}
                  onChange={(e) => setEditRules({ ...editRules, goal: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-blue-600 mb-1">
                  Assistência (+pts)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editRules.assist}
                  onChange={(e) => setEditRules({ ...editRules, assist: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-emerald-600 mb-1">
                  Vitória da Equipe (+pts)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editRules.win}
                  onChange={(e) => setEditRules({ ...editRules, win: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-600 mb-1">
                  Empate da Equipe (+pts)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editRules.draw}
                  onChange={(e) => setEditRules({ ...editRules, draw: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-purple-600 mb-1">
                  Jogo Sem Sofrer Gols - SG (+pts)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editRules.cleanSheet}
                  onChange={(e) => setEditRules({ ...editRules, cleanSheet: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-amber-500 mb-1">
                  Bônus MVP da Partida (+pts)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editRules.mvpBonus}
                  onChange={(e) => setEditRules({ ...editRules, mvpBonus: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-red-500 mb-1">
                  Gol Contra (-pts)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editRules.ownGoal}
                  onChange={(e) => setEditRules({ ...editRules, ownGoal: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="bg-primary-blue hover:bg-blue-800 text-white font-black text-xs uppercase tracking-wider px-8 py-3.5 rounded-2xl transition-all shadow-md active:scale-95 flex items-center gap-2"
            >
              {isSavingSettings ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-amber-400" /> Salvar Regras do Cartola
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* --- MODAL: DETALHES DO TIME --- */}
      <AnimatePresence>
        {selectedTeamForModal && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto space-y-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-700">
                    <Shirt className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase text-primary-gray">
                      {selectedTeamForModal.teamName}
                    </h3>
                    <span className="text-xs text-gray-500 font-bold">
                      Proprietário: {selectedTeamForModal.userName}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedTeamForModal(null)}
                  className="p-2 text-gray-400 hover:text-gray-700 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Total Score Badge */}
              <div className="bg-gradient-to-r from-slate-900 to-slate-950 p-5 rounded-2xl text-white flex items-center justify-between border border-slate-800 shadow-md">
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">
                    PONTUAÇÃO TOTAL DO TIME
                  </span>
                  <div className="text-2xl font-black text-amber-400 italic">
                    {selectedTeamForModal.totalPoints.toFixed(1)} <span className="text-xs text-white">pts Cartola</span>
                  </div>
                </div>
                <Trophy className="w-8 h-8 text-amber-400" />
              </div>

              {/* Players Selected List */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-gray-600 tracking-wider">
                  Escalação dos 8 Atletas:
                </h4>

                <div className="space-y-2">
                  {(selectedTeamForModal.playerIds || []).map(pId => {
                    const playerObj = players.find(p => p.id === pId);
                    const isCaptain = selectedTeamForModal.captainId === pId;
                    const pts = playerScoresMap[pId] || 0;

                    return (
                      <div 
                        key={pId}
                        className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                          isCaptain ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <img 
                            src={playerObj?.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(playerObj?.name || 'P')}`} 
                            alt="" 
                            className="w-10 h-10 rounded-xl object-cover border border-gray-200" 
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-gray-800 text-sm">
                                {playerObj ? (playerObj.nickname || playerObj.name) : 'Atleta Desconhecido'}
                              </span>
                              {isCaptain && (
                                <span className="bg-amber-500 text-slate-950 font-black text-[9px] uppercase px-2 py-0.5 rounded-full">
                                  CAPITÃO (1.5x)
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-extrabold uppercase text-gray-400">
                              {playerObj ? getPositionAbbr(playerObj.position) : '-'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-sm font-black text-amber-600 italic block">
                            {isCaptain ? (pts * (settings.captainMultiplier || 1.5)).toFixed(1) : pts.toFixed(1)} pts
                          </span>
                          {isCaptain && (
                            <span className="text-[9px] text-gray-400 font-bold block">
                              Base: {pts.toFixed(1)} pts
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL: ESCALAR / EDITAR TIME --- */}
      <AnimatePresence>
        {showTeamModal && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 max-h-[92vh] overflow-y-auto space-y-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-700">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase text-primary-gray">
                      {editingTeamId ? 'Editar Time do Cartola' : 'Escalar Novo Time'}
                    </h3>
                    <p className="text-xs text-gray-400 font-medium">
                      Escolha até {settings.maxPlayersPerTeam || 8} atletas para o time.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowTeamModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-700 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveTeam} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                      Nome do Time
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Flamengo Coxim FC"
                      value={formTeamName}
                      onChange={(e) => setFormTeamName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                      Nome do Usuário
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Carlos Silva"
                      value={formUserName}
                      onChange={(e) => setFormUserName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {/* Selected Players Count Header */}
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="block text-[10px] font-black uppercase text-amber-800 tracking-wider">
                      SELEÇÃO DE ATLETAS
                    </span>
                    <span className="text-sm font-black text-slate-900">
                      {formSelectedPlayers.length} de {settings.maxPlayersPerTeam || 8} atletas selecionados
                    </span>
                  </div>

                  {formSelectedPlayers.length > 0 && (
                    <div className="text-right">
                      <span className="block text-[10px] font-black uppercase text-gray-500">CAPITÃO:</span>
                      <select
                        value={formCaptainId}
                        onChange={(e) => setFormCaptainId(e.target.value)}
                        className="bg-white border border-amber-300 text-xs font-black px-3 py-1 rounded-xl focus:outline-none"
                      >
                        {formSelectedPlayers.map(pId => {
                          const pObj = players.find(p => p.id === pId);
                          return (
                            <option key={pId} value={pId}>
                              {pObj ? (pObj.nickname || pObj.name) : pId}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>

                {/* Player Search and Filter */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar por nome..."
                        value={playerSearchText}
                        onChange={(e) => setPlayerSearchText(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                      />
                    </div>

                    <select
                      value={posFilter}
                      onChange={(e) => setPosFilter(e.target.value)}
                      className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700"
                    >
                      <option value="all">Todas Posições</option>
                      <option value="goleiro">Goleiro</option>
                      <option value="zagueiro">Zagueiro</option>
                      <option value="lateral">Lateral</option>
                      <option value="meio-campo">Meio-Campo</option>
                      <option value="centroavante">Atacante</option>
                    </select>
                  </div>

                  {/* Player Cards Selection Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1 border border-gray-100 rounded-2xl bg-gray-50/50">
                    {modalPlayers.map(player => {
                      const isSelected = formSelectedPlayers.includes(player.id);
                      const isCaptain = formCaptainId === player.id;

                      return (
                        <div
                          key={player.id}
                          onClick={() => togglePlayerSelection(player.id)}
                          className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'bg-amber-100/80 border-amber-400 text-slate-900 shadow-sm'
                              : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={player.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}`}
                              alt=""
                              className="w-9 h-9 rounded-xl object-cover border border-gray-200 shrink-0"
                            />
                            <div className="truncate min-w-0">
                              <span className="block font-black text-xs truncate">
                                {player.nickname || player.name}
                              </span>
                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${getPositionColor(player.position)}`}>
                                {getPositionAbbr(player.position)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-black text-amber-600 italic">
                              {(playerScoresMap[player.id] || 0).toFixed(1)} pts
                            </span>
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                              isSelected ? 'bg-slate-950 text-amber-400 border-slate-950' : 'border-gray-300'
                            }`}>
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowTeamModal(false)}
                    className="px-5 py-2.5 rounded-2xl border border-gray-200 text-xs font-black uppercase text-gray-600 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider px-6 py-2.5 rounded-2xl transition-all shadow-md active:scale-95 flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" /> Salvar Time
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
