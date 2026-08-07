import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Player, CartolaSettings, CartolaUserTeam } from '../types';
import { getPositionAbbr, getPositionColor } from '../utils/playerUtils';
import {
  Shirt,
  Trophy,
  Crown,
  Search,
  Filter,
  Check,
  Plus,
  Trash2,
  AlertCircle,
  Clock,
  Sparkles,
  Wallet,
  Calendar,
  Zap,
  ArrowRight,
  Shield,
  Star,
  DollarSign,
  HelpCircle,
  ChevronRight,
  Info,
  QrCode,
  Copy,
  CheckCircle2,
  X,
  Lock,
  Unlock,
  RefreshCw,
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';

const MONTHLY_FEE = 9.90;
const MS_PER_30_DAYS = 30 * 24 * 60 * 60 * 1000;

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error in CartolaUser:', JSON.stringify(errInfo));
}

interface CartolaUserProps {
  adminData?: any;
}

export default function CartolaUser({ adminData }: CartolaUserProps) {
  const [currentUser, setCurrentUser] = useState<any>(auth.currentUser);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [userName, setUserName] = useState<string>('');
  
  // Cartola State
  const [cartolaSettings, setCartolaSettings] = useState<CartolaSettings | null>(null);
  const [userTeam, setUserTeam] = useState<CartolaUserTeam | null>(null);
  const [allTeams, setAllTeams] = useState<CartolaUserTeam[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  
  // Selection State
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [teamNameInput, setTeamNameInput] = useState<string>('');
  const [badgeColorInput, setBadgeColorInput] = useState<string>('#10b981');
  
  // UI State
  const [activeTab, setActiveTab] = useState<'field' | 'market' | 'ranking' | 'rules' | 'subscription'>('field');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [searchPlayer, setSearchPlayer] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // PIX Modal State
  const [showPixModal, setShowPixModal] = useState<boolean>(false);
  const [pixAmount, setPixAmount] = useState<string>('9.90');
  const [pixSubmitting, setPixSubmitting] = useState<boolean>(false);
  const [copiedPix, setCopiedPix] = useState<boolean>(false);

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((usr) => {
      setCurrentUser(usr);
    });
    return () => unsubscribe();
  }, []);

  // Listen to User Profile & Balance
  useEffect(() => {
    if (!currentUser) {
      setUserBalance(0);
      return;
    }

    const userRef = doc(db, 'users', currentUser.uid);
    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setUserBalance(data.balance || 0);
          setUserName(data.name || data.displayName || currentUser.displayName || currentUser.email || 'Jogador');
        } else {
          setUserBalance(0);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`)
    );

    return () => unsubUser();
  }, [currentUser]);

  // Listen to Cartola Settings
  useEffect(() => {
    const settingsRef = doc(db, 'cartola_settings', 'default');
    const unsubSettings = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          setCartolaSettings(snap.data() as CartolaSettings);
        } else {
          setCartolaSettings({
            marketStatus: 'open',
            currentRound: 1,
            seasonName: 'Temporada 2026',
            maxPlayersPerTeam: 8,
            captainMultiplier: 1.5,
            scoringRules: {
              goal: 8.0,
              assist: 5.0,
              win: 3.0,
              draw: 1.0,
              cleanSheet: 5.0,
              yellowCard: -2.0,
              redCard: -5.0,
              ownGoal: -4.0,
              mvpBonus: 5.0
            }
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'cartola_settings/default')
    );

    return () => unsubSettings();
  }, []);

  // Fetch Players
  useEffect(() => {
    const qPlayers = query(collection(db, 'players'), orderBy('name', 'asc'));
    const unsubPlayers = onSnapshot(
      qPlayers,
      (snap) => {
        const list: Player[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Player));
        setAllPlayers(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'players')
    );

    return () => unsubPlayers();
  }, []);

  // Fetch All Cartola Teams for Leaderboard
  useEffect(() => {
    const qTeams = query(collection(db, 'cartola_teams'), orderBy('totalPoints', 'desc'));
    const unsubTeams = onSnapshot(
      qTeams,
      (snap) => {
        const list: CartolaUserTeam[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() } as CartolaUserTeam));
        setAllTeams(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'cartola_teams')
    );

    return () => unsubTeams();
  }, []);

  // Listen to User's Own Team
  useEffect(() => {
    if (!currentUser) {
      setUserTeam(null);
      setSelectedPlayerIds([]);
      setCaptainId(null);
      setLoading(false);
      return;
    }

    const teamRef = doc(db, 'cartola_teams', currentUser.uid);
    const unsubMyTeam = onSnapshot(
      teamRef,
      (snap) => {
        if (snap.exists()) {
          const tData = { id: snap.id, ...snap.data() } as CartolaUserTeam;
          setUserTeam(tData);
          setSelectedPlayerIds(tData.playerIds || []);
          setCaptainId(tData.captainId || null);
          setTeamNameInput(tData.teamName || '');
          setBadgeColorInput(tData.badgeColor || '#10b981');
        } else {
          setUserTeam(null);
          setTeamNameInput(`Time do ${currentUser.displayName || 'Atleta'}`);
        }
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `cartola_teams/${currentUser.uid}`);
        setLoading(false);
      }
    );

    return () => unsubMyTeam();
  }, [currentUser]);

  // Subscription Calculations
  const now = Date.now();
  const isSubscribed = Boolean(
    userTeam?.subscriptionActive &&
    userTeam?.subscriptionExpiresAt &&
    userTeam.subscriptionExpiresAt > now
  );

  const daysRemaining = userTeam?.subscriptionExpiresAt
    ? Math.max(0, Math.ceil((userTeam.subscriptionExpiresAt - now) / (1000 * 60 * 60 * 24)))
    : 0;

  const maxPlayers = cartolaSettings?.maxPlayersPerTeam || 8;
  const isMarketOpen = cartolaSettings?.marketStatus === 'open';

  // Toggle player selection in market
  const handleTogglePlayer = (playerId: string) => {
    if (!isMarketOpen) {
      setMessage({ text: 'O mercado está fechado no momento para edições.', type: 'error' });
      return;
    }

    if (selectedPlayerIds.includes(playerId)) {
      const updated = selectedPlayerIds.filter((id) => id !== playerId);
      setSelectedPlayerIds(updated);
      if (captainId === playerId) {
        setCaptainId(updated[0] || null);
      }
    } else {
      if (selectedPlayerIds.length >= maxPlayers) {
        setMessage({ text: `Seu time pode ter no máximo ${maxPlayers} jogadores.`, type: 'error' });
        return;
      }
      const updated = [...selectedPlayerIds, playerId];
      setSelectedPlayerIds(updated);
      if (!captainId) {
        setCaptainId(playerId);
      }
    }
  };

  // Payment & Subscription Handler
  const handlePayAndSubscribe = async () => {
    if (!currentUser) {
      alert('Você precisa estar logado para assinar o Cartola Arena.');
      return;
    }

    if (userBalance < MONTHLY_FEE) {
      setShowPixModal(true);
      return;
    }

    if (!teamNameInput.trim()) {
      alert('Por favor, informe o nome do seu time!');
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      // Execute subscription via Firestore transaction
      const userRef = doc(db, 'users', currentUser.uid);
      const teamRef = doc(db, 'cartola_teams', currentUser.uid);
      const txRef = doc(collection(db, 'transactions'));

      await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) {
          throw new Error('Usuário não encontrado.');
        }

        const currentBal = Number(userSnap.data().balance) || 0;
        if (currentBal < MONTHLY_FEE) {
          throw new Error('Saldo insuficiente para assinar o Cartola Arena.');
        }

        const newBal = currentBal - MONTHLY_FEE;
        const currentExp = userTeam?.subscriptionExpiresAt && userTeam.subscriptionExpiresAt > now
          ? userTeam.subscriptionExpiresAt
          : now;
        const newExpiry = currentExp + MS_PER_30_DAYS;

        // 1. Deduct balance from user
        transaction.update(userRef, { balance: newBal });

        // 2. Add transaction record for bank statement
        transaction.set(txRef, {
          userId: currentUser.uid,
          userEmail: currentUser.email || '',
          userName: currentUser.displayName || userName || currentUser.email || 'Usuário Cartola',
          amount: MONTHLY_FEE,
          type: 'cartola_subscription',
          status: 'approved',
          description: 'Inscrição Mensal Cartola Arena (30 dias)',
          createdAt: new Date().toISOString()
        });

        // 3. Create or Update Team with Active Subscription
        const teamPayload: Partial<CartolaUserTeam> = {
          userId: currentUser.uid,
          userName: currentUser.displayName || userName || currentUser.email || 'Jogador Cartola',
          userEmail: currentUser.email || '',
          userPhotoUrl: currentUser.photoURL || '',
          teamName: teamNameInput.trim(),
          badgeColor: badgeColorInput,
          playerIds: selectedPlayerIds,
          captainId: captainId || (selectedPlayerIds[0] || null),
          totalPoints: userTeam?.totalPoints || 0,
          subscriptionExpiresAt: newExpiry,
          subscriptionPaidAt: now,
          subscriptionActive: true,
          updatedAt: now,
          createdAt: userTeam?.createdAt || now
        };

        transaction.set(teamRef, teamPayload, { merge: true });
      });

      setMessage({
        text: 'Inscrição de R$ 9,90 confirmada com sucesso! Seu time está ativo por 30 dias no Cartola Arena.',
        type: 'success'
      });
      setActiveTab('field');
    } catch (err: any) {
      console.error('Error during Cartola subscription:', err);
      setMessage({
        text: err.message || 'Erro ao processar o pagamento da inscrição. Tente novamente.',
        type: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Save Team Escalation (When active)
  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!isSubscribed) {
      alert('Sua assinatura mensal está expirada ou inativa. Por favor, realize o pagamento de R$ 9,90 para ativar seu time.');
      setActiveTab('subscription');
      return;
    }

    if (!isMarketOpen) {
      alert('O mercado está fechado no momento. Nenhuma alteração é permitida durante as rodadas.');
      return;
    }

    if (selectedPlayerIds.length === 0) {
      alert('Escolha pelo menos 1 jogador para seu time.');
      return;
    }

    if (!captainId || !selectedPlayerIds.includes(captainId)) {
      alert('Por favor, selecione um Capitão entre os atletas do seu time!');
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const teamRef = doc(db, 'cartola_teams', currentUser.uid);
      await setDoc(
        teamRef,
        {
          teamName: teamNameInput.trim() || `Time de ${currentUser.displayName || 'Atleta'}`,
          badgeColor: badgeColorInput,
          playerIds: selectedPlayerIds,
          captainId: captainId,
          updatedAt: now
        },
        { merge: true }
      );

      setMessage({
        text: 'Escalação salva com sucesso! Seu time está pronto para a próxima rodada.',
        type: 'success'
      });
      setActiveTab('field');
    } catch (err: any) {
      console.error('Error saving team escalation:', err);
      setMessage({ text: 'Erro ao salvar escalação. Tente novamente.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // Request PIX Deposit handler
  const handleRequestPixDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(pixAmount);
    if (!pixAmount || amountNum <= 0) {
      alert('Informe um valor de depósito válido.');
      return;
    }

    setPixSubmitting(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        userName: currentUser.displayName || userName || currentUser.email,
        amount: amountNum,
        type: 'deposit',
        status: 'pending',
        description: 'Depósito PIX para Cartola Arena',
        createdAt: new Date().toISOString()
      });

      alert('Solicitação de depósito PIX gerada com sucesso! Assim que aprovada pelo admin, o saldo será creditado automaticamente.');
      setShowPixModal(false);
    } catch (err) {
      console.error('Error requesting PIX deposit:', err);
      alert('Erro ao solicitar depósito PIX.');
    } finally {
      setPixSubmitting(false);
    }
  };

  // Helper to get selected players objects
  const selectedPlayerObjects = allPlayers.filter((p) => selectedPlayerIds.includes(p.id));

  // Filtered players for market
  const filteredPlayers = allPlayers.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchPlayer.toLowerCase()) ||
      (p.nickname && p.nickname.toLowerCase().includes(searchPlayer.toLowerCase()));

    if (positionFilter === 'all') return matchesSearch;
    return matchesSearch && p.position.toLowerCase() === positionFilter.toLowerCase();
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
        <p className="text-sm font-black uppercase tracking-widest text-slate-400">
          Carregando Cartola Arena...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* HEADER BANNER */}
      <div className="relative bg-gradient-to-r from-emerald-900 via-slate-900 to-teal-950 border-b border-emerald-500/20 overflow-hidden py-8 px-4 sm:px-8">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-emerald-600 p-0.5 shadow-lg shadow-emerald-950/50 flex-shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Shirt className="w-8 h-8 text-amber-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-amber-400/20 text-amber-300 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-amber-400/30">
                  {cartolaSettings?.seasonName || 'Temporada 2026'}
                </span>
                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                  isMarketOpen
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {isMarketOpen ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  Mercado {isMarketOpen ? 'Aberto' : 'Fechado'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-black uppercase italic tracking-tight text-white mt-1">
                Cartola <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-emerald-400">Arena</span>
              </h1>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Escale os melhores atletas das peladas, acumule pontos e conquiste a liderança!
              </p>
            </div>
          </div>

          {/* USER ACCOUNT & SUBSCRIPTION STATUS BADGE */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Balance Card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-inner">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">Seu Saldo</span>
                <span className="block text-sm font-black text-emerald-400">
                  R$ {userBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <button
                onClick={() => setShowPixModal(true)}
                className="ml-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all"
              >
                + PIX
              </button>
            </div>

            {/* Subscription Status Card */}
            <div className={`border rounded-2xl px-4 py-2.5 flex items-center gap-3 ${
              isSubscribed
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
            }`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isSubscribed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}>
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold opacity-80">Inscrição Mensal</span>
                <span className="block text-xs font-black">
                  {isSubscribed ? `Ativa (${daysRemaining}d restantes)` : 'Pendente (R$ 9,90/mês)'}
                </span>
              </div>
              {!isSubscribed && (
                <button
                  onClick={() => setActiveTab('subscription')}
                  className="ml-1 bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all"
                >
                  Assinar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* NOTIFICATION MESSAGES */}
      {message && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className={`p-4 rounded-2xl flex items-center justify-between border ${
            message.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/80 border-rose-500/40 text-rose-200'
          }`}>
            <div className="flex items-center gap-3">
              {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5 text-rose-400" />}
              <span className="text-xs font-bold">{message.text}</span>
            </div>
            <button onClick={() => setMessage(null)} className="opacity-70 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6">
        {/* NAV TABS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-800 flex-nowrap">
          <button
            onClick={() => setActiveTab('field')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              activeTab === 'field'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-950/50'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Shirt className="w-3.5 h-3.5" />
            Meu Time
          </button>

          <button
            onClick={() => setActiveTab('market')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap relative ${
              activeTab === 'market'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-950/50'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Mercado de Atletas
            <span className="bg-emerald-500 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded-full ml-1">
              {selectedPlayerIds.length}/{maxPlayers}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ranking')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              activeTab === 'ranking'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-950/50'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            Liga & Ranking
          </button>

          <button
            onClick={() => setActiveTab('rules')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              activeTab === 'rules'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-950/50'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Pontuação
          </button>

          <button
            onClick={() => setActiveTab('subscription')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ml-auto ${
              activeTab === 'subscription'
                ? 'bg-gradient-to-r from-amber-500 to-emerald-600 text-slate-950 shadow-lg'
                : 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30'
            }`}
          >
            <Crown className="w-4 h-4" />
            Minha Assinatura (R$ 9,90)
          </button>
        </div>

        {/* TAB CONTENTS */}
        <div className="mt-6">
          {/* TAB 1: MEU TIME / PITCH VIEW */}
          {activeTab === 'field' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Field Column */}
              <div className="lg:col-span-8 space-y-6">
                {!currentUser ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4">
                    <Shield className="w-12 h-12 text-amber-400 mx-auto" />
                    <h3 className="text-xl font-black uppercase italic text-white">Faça Login para Jogar</h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Entre na sua conta para criar seu time no Cartola Arena, selecionar seus craques e disputar os prêmios da temporada!
                    </p>
                  </div>
                ) : !isSubscribed ? (
                  <div className="bg-gradient-to-br from-amber-950/60 via-slate-900 to-emerald-950/60 border border-amber-500/40 rounded-3xl p-8 text-center space-y-5">
                    <Crown className="w-14 h-14 text-amber-400 mx-auto animate-bounce" />
                    <div>
                      <h3 className="text-2xl font-black uppercase italic text-white">Ative sua Inscrição Mensal</h3>
                      <p className="text-xs text-amber-200/80 max-w-md mx-auto mt-1">
                        Para escalar seu time e competir na liga, faça a assinatura do Cartola Arena por apenas{' '}
                        <strong className="text-amber-300 font-black">R$ 9,90/mês</strong>. O valor é debitado do seu saldo e renovado a cada 30 dias.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
                      <button
                        onClick={handlePayAndSubscribe}
                        disabled={submitting}
                        className="w-full sm:w-auto bg-gradient-to-r from-amber-400 to-emerald-500 hover:from-amber-300 hover:to-emerald-400 text-slate-950 font-black uppercase tracking-wider text-xs px-8 py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2"
                      >
                        {submitting ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Crown className="w-4 h-4" />
                            Pagar R$ 9,90 e Criar/Ativar Time
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setShowPixModal(true)}
                        className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-6 py-4 rounded-2xl transition-all border border-slate-700 flex items-center justify-center gap-2"
                      >
                        <Wallet className="w-4 h-4 text-emerald-400" />
                        Depositar via PIX
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* SOCCER PITCH VISUAL */}
                    <div className="relative bg-gradient-to-b from-emerald-800 via-emerald-900 to-teal-950 rounded-3xl border-2 border-emerald-500/30 overflow-hidden shadow-2xl min-h-[520px] flex flex-col justify-between p-6">
                      {/* Pitch Lines */}
                      <div className="absolute inset-x-8 top-0 bottom-0 border-x-2 border-emerald-400/20 pointer-events-none" />
                      <div className="absolute inset-x-0 top-1/2 h-0.5 bg-emerald-400/20 pointer-events-none" />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-2 border-emerald-400/20 rounded-full pointer-events-none" />
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 border-b-2 border-x-2 border-emerald-400/20 rounded-b-2xl pointer-events-none" />
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-20 border-t-2 border-x-2 border-emerald-400/20 rounded-t-2xl pointer-events-none" />

                      {/* Header info on pitch */}
                      <div className="relative z-10 flex items-center justify-between bg-slate-950/80 backdrop-blur-md p-4 rounded-2xl border border-emerald-500/30">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-slate-950 text-sm shadow-md"
                            style={{ backgroundColor: badgeColorInput }}
                          >
                            <Shirt className="w-6 h-6 text-white drop-shadow" />
                          </div>
                          <div>
                            <h2 className="text-base font-black uppercase text-white tracking-tight">
                              {teamNameInput || userTeam?.teamName || 'Meu Time'}
                            </h2>
                            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                              {userTeam?.totalPoints || 0} Pontos Acumulados
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => setActiveTab('market')}
                          disabled={!isMarketOpen}
                          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                            isMarketOpen
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <Plus className="w-4 h-4" />
                          Alterar Atletas ({selectedPlayerIds.length}/{maxPlayers})
                        </button>
                      </div>

                      {/* Pitch Player Grid */}
                      <div className="relative z-10 py-6 my-auto">
                        {selectedPlayerObjects.length === 0 ? (
                          <div className="text-center py-12 space-y-4 bg-slate-950/60 backdrop-blur-md rounded-2xl p-6 border border-emerald-500/20 max-w-md mx-auto">
                            <Shirt className="w-12 h-12 text-emerald-400 mx-auto opacity-80" />
                            <h4 className="text-lg font-black uppercase italic text-white">Nenhum Atleta Escala do</h4>
                            <p className="text-xs text-slate-300">
                              Acesse o Mercado de Atletas para escolher seus {maxPlayers} jogadores e definir o Capitão!
                            </p>
                            <button
                              onClick={() => setActiveTab('market')}
                              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider px-6 py-3 rounded-xl transition-all shadow-lg"
                            >
                              Ir para o Mercado
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {selectedPlayerObjects.map((player) => {
                              const isCaptain = captainId === player.id;
                              const posColor = getPositionColor(player.position);
                              const posAbbr = getPositionAbbr(player.position);

                              return (
                                <motion.div
                                  key={player.id}
                                  layout
                                  className={`relative bg-slate-950/90 backdrop-blur-md rounded-2xl p-3 border shadow-xl flex flex-col items-center text-center group transition-all ${
                                    isCaptain
                                      ? 'border-amber-400 shadow-amber-500/10'
                                      : 'border-emerald-500/30 hover:border-emerald-400'
                                  }`}
                                >
                                  {/* Captain Badge */}
                                  {isCaptain && (
                                    <div className="absolute -top-2 -right-2 bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1 z-20">
                                      <Crown className="w-3 h-3" />
                                      Capitão (1.5x)
                                    </div>
                                  )}

                                  {/* Player Photo */}
                                  <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 mb-2 mt-1">
                                    <img
                                      src={player.photoUrl || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&q=80&w=200'}
                                      alt={player.name}
                                      className="w-full h-full object-cover object-top"
                                    />
                                    <span className={`absolute bottom-0 inset-x-0 text-[9px] font-black uppercase text-white py-0.5 text-center ${posColor}`}>
                                      {posAbbr}
                                    </span>
                                  </div>

                                  <span className="font-black text-xs text-white truncate w-full">
                                    {player.nickname || player.name}
                                  </span>

                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] text-emerald-400 font-bold">
                                      {player.stats?.goals || 0} Gols
                                    </span>
                                    <span className="text-[10px] text-amber-400 font-bold">
                                      {player.stats?.assists || 0} Ass.
                                    </span>
                                  </div>

                                  {/* Quick Captain & Remove Actions (if market open) */}
                                  {isMarketOpen && (
                                    <div className="mt-2 pt-2 border-t border-slate-800/80 w-full flex items-center justify-between gap-1 opacity-90 group-hover:opacity-100 transition-all">
                                      <button
                                        onClick={() => setCaptainId(player.id)}
                                        className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wider transition-all flex-1 ${
                                          isCaptain
                                            ? 'bg-amber-400 text-slate-950'
                                            : 'bg-slate-800 text-slate-300 hover:bg-amber-400/20 hover:text-amber-300'
                                        }`}
                                      >
                                        {isCaptain ? 'Capitão' : 'Virar C'}
                                      </button>
                                      <button
                                        onClick={() => handleTogglePlayer(player.id)}
                                        className="text-slate-400 hover:text-rose-400 p-1 rounded-lg hover:bg-rose-500/10"
                                        title="Remover"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </motion.div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Pitch Footer / Save Button */}
                      {isMarketOpen && selectedPlayerObjects.length > 0 && (
                        <div className="relative z-10 pt-4 border-t border-emerald-500/30 flex items-center justify-between gap-4">
                          <span className="text-xs text-slate-300 font-medium">
                            {selectedPlayerObjects.length === maxPlayers
                              ? '✓ Time completo com 8 atletas!'
                              : `Faltam ${maxPlayers - selectedPlayerObjects.length} atleta(s)`}
                          </span>

                          <button
                            onClick={handleSaveTeam}
                            disabled={submitting}
                            className="bg-gradient-to-r from-amber-400 to-emerald-400 hover:from-amber-300 hover:to-emerald-300 text-slate-950 font-black uppercase tracking-wider text-xs px-6 py-3 rounded-xl shadow-xl transition-all flex items-center gap-2"
                          >
                            {submitting ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="w-4 h-4" />
                                Salvar Escalação
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Sidebar Info Column */}
              <div className="lg:col-span-4 space-y-6">
                {/* TEAM CONFIG CARD */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Identidade do Time
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Nome do seu Escudero
                      </label>
                      <input
                        type="text"
                        value={teamNameInput}
                        onChange={(e) => setTeamNameInput(e.target.value)}
                        placeholder="Ex: Galácticos FC"
                        disabled={!isMarketOpen && isSubscribed}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Cor do Escudo
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={badgeColorInput}
                          onChange={(e) => setBadgeColorInput(e.target.value)}
                          disabled={!isMarketOpen && isSubscribed}
                          className="w-10 h-10 rounded-xl bg-transparent border-0 cursor-pointer"
                        />
                        <span className="text-xs font-mono text-slate-400">{badgeColorInput}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SUBSCRIPTION SUMMARY CARD */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                  <h3 className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                    <Crown className="w-4 h-4" />
                    Status da Inscrição
                  </h3>

                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Valor Mensal:</span>
                      <span className="font-black text-amber-400">R$ 9,90 / 30 dias</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Status:</span>
                      <span className={`font-black ${isSubscribed ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isSubscribed ? 'Ativo' : 'Pendente de Pagamento'}
                      </span>
                    </div>

                    {isSubscribed && userTeam?.subscriptionExpiresAt && (
                      <div className="flex justify-between py-1 border-b border-slate-800">
                        <span className="text-slate-400">Vencimento:</span>
                        <span className="font-black text-slate-200">
                          {new Date(userTeam.subscriptionExpiresAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    )}

                    {!isSubscribed && (
                      <button
                        onClick={handlePayAndSubscribe}
                        className="w-full mt-2 bg-gradient-to-r from-amber-400 to-emerald-500 text-slate-950 font-black uppercase text-xs py-3 rounded-xl transition-all shadow-md"
                      >
                        Pagar R$ 9,90 e Ativar
                      </button>
                    )}
                  </div>
                </div>

                {/* QUICK MARKET OVERVIEW */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
                      Top Atletas Disponíveis
                    </h3>
                    <button
                      onClick={() => setActiveTab('market')}
                      className="text-[10px] font-black text-emerald-400 hover:underline uppercase"
                    >
                      Ver Todos →
                    </button>
                  </div>

                  <div className="space-y-2">
                    {allPlayers.slice(0, 4).map((player) => {
                      const isSelected = selectedPlayerIds.includes(player.id);
                      return (
                        <div
                          key={player.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded text-white ${getPositionColor(player.position)}`}>
                              {getPositionAbbr(player.position)}
                            </span>
                            <span className="text-xs font-bold text-white truncate max-w-[120px]">
                              {player.nickname || player.name}
                            </span>
                          </div>

                          <button
                            onClick={() => handleTogglePlayer(player.id)}
                            disabled={!isMarketOpen}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                              isSelected
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                            }`}
                          >
                            {isSelected ? 'Remover' : 'Escalar'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MERCADO DE ATLETAS */}
          {activeTab === 'market' && (
            <div className="space-y-6">
              {/* Market Header Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1 md:w-80">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchPlayer}
                      onChange={(e) => setSearchPlayer(e.target.value)}
                      placeholder="Buscar atleta pelo nome..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Position Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 scrollbar-none">
                  {[
                    { id: 'all', label: 'Todos' },
                    { id: 'goleiro', label: 'Goleiros' },
                    { id: 'zagueiro', label: 'Zagueiros' },
                    { id: 'lateral', label: 'Laterais' },
                    { id: 'meio-campo', label: 'Meias' },
                    { id: 'centroavante', label: 'Atacantes' },
                  ].map((pos) => (
                    <button
                      key={pos.id}
                      onClick={() => setPositionFilter(pos.id)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                        positionFilter === pos.id
                          ? 'bg-emerald-500 text-slate-950 shadow-md'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>

                {/* Selected counter */}
                <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-2">
                  <Shirt className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-black text-white">
                    {selectedPlayerIds.length} / {maxPlayers} Escalados
                  </span>
                </div>
              </div>

              {/* Players Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredPlayers.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-slate-500 font-bold uppercase text-xs">
                    Nenhum atleta encontrado para essa busca.
                  </div>
                ) : (
                  filteredPlayers.map((player) => {
                    const isSelected = selectedPlayerIds.includes(player.id);
                    const isCaptain = captainId === player.id;

                    return (
                      <div
                        key={player.id}
                        className={`bg-slate-900 border rounded-2xl p-4 transition-all relative flex flex-col justify-between ${
                          isSelected
                            ? 'border-emerald-500/80 bg-emerald-950/20 shadow-lg shadow-emerald-950/30'
                            : 'border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 flex-shrink-0">
                              <img
                                src={player.photoUrl || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&q=80&w=200'}
                                alt={player.name}
                                className="w-full h-full object-cover object-top"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <span className={`inline-block text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded text-white mb-1 ${getPositionColor(player.position)}`}>
                                {getPositionAbbr(player.position)}
                              </span>
                              <h4 className="text-sm font-black text-white truncate">
                                {player.nickname || player.name}
                              </h4>
                              <p className="text-[10px] text-slate-400 truncate">{player.name}</p>
                            </div>
                          </div>

                          {/* Stats Row */}
                          <div className="grid grid-cols-3 gap-2 bg-slate-950 rounded-xl p-2.5 text-center mb-3">
                            <div>
                              <span className="block text-[9px] text-slate-500 font-bold">Jogos</span>
                              <span className="block text-xs font-black text-slate-200">{player.stats?.matches || 0}</span>
                            </div>
                            <div>
                              <span className="block text-[9px] text-slate-500 font-bold">Gols</span>
                              <span className="block text-xs font-black text-emerald-400">{player.stats?.goals || 0}</span>
                            </div>
                            <div>
                              <span className="block text-[9px] text-slate-500 font-bold">Assis.</span>
                              <span className="block text-xs font-black text-amber-400">{player.stats?.assists || 0}</span>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                          <button
                            onClick={() => handleTogglePlayer(player.id)}
                            disabled={!isMarketOpen}
                            className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                              isSelected
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-md'
                            }`}
                          >
                            {isSelected ? (
                              <>
                                <X className="w-3.5 h-3.5" />
                                Escalado
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                Escalar
                              </>
                            )}
                          </button>

                          {isSelected && (
                            <button
                              onClick={() => setCaptainId(player.id)}
                              className={`p-2 rounded-xl transition-all ${
                                isCaptain
                                  ? 'bg-amber-400 text-slate-950 font-black'
                                  : 'bg-slate-800 text-slate-400 hover:text-amber-300'
                              }`}
                              title={isCaptain ? 'Capitão Selecionado' : 'Tornar Capitão'}
                            >
                              <Crown className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: LEAGUE LEADERBOARD / RANKING */}
          {activeTab === 'ranking' && (
            <div className="space-y-6">
              {/* Podium Header */}
              {allTeams.length >= 3 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {/* 2nd Place */}
                  <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-700/60 rounded-3xl p-6 text-center relative overflow-hidden order-2 md:order-1 mt-4 md:mt-6">
                    <div className="w-12 h-12 bg-slate-300 text-slate-950 font-black text-lg rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                      2º
                    </div>
                    <h3 className="text-base font-black text-white truncate">{allTeams[1].teamName}</h3>
                    <p className="text-xs text-slate-400 font-medium">{allTeams[1].userName}</p>
                    <div className="mt-3 bg-slate-900 py-1.5 px-4 rounded-full inline-block border border-slate-800">
                      <span className="text-sm font-black text-amber-400">{allTeams[1].totalPoints || 0} pts</span>
                    </div>
                  </div>

                  {/* 1st Place */}
                  <div className="bg-gradient-to-b from-amber-950/60 via-slate-900 to-emerald-950/60 border-2 border-amber-400 rounded-3xl p-6 text-center relative overflow-hidden order-1 md:order-2 shadow-2xl shadow-amber-500/10">
                    <Crown className="w-8 h-8 text-amber-400 mx-auto mb-2 animate-pulse" />
                    <div className="w-14 h-14 bg-gradient-to-br from-amber-300 to-yellow-500 text-slate-950 font-black text-xl rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xl">
                      1º
                    </div>
                    <h3 className="text-lg font-black text-white truncate">{allTeams[0].teamName}</h3>
                    <p className="text-xs text-amber-200/80 font-medium">{allTeams[0].userName}</p>
                    <div className="mt-3 bg-amber-400 text-slate-950 py-1.5 px-6 rounded-full inline-block font-black shadow-md">
                      {allTeams[0].totalPoints || 0} pts
                    </div>
                  </div>

                  {/* 3rd Place */}
                  <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-700/40 rounded-3xl p-6 text-center relative overflow-hidden order-3 mt-4 md:mt-8">
                    <div className="w-12 h-12 bg-amber-700 text-amber-100 font-black text-lg rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                      3º
                    </div>
                    <h3 className="text-base font-black text-white truncate">{allTeams[2].teamName}</h3>
                    <p className="text-xs text-slate-400 font-medium">{allTeams[2].userName}</p>
                    <div className="mt-3 bg-slate-900 py-1.5 px-4 rounded-full inline-block border border-slate-800">
                      <span className="text-sm font-black text-amber-400">{allTeams[2].totalPoints || 0} pts</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Leaderboard Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    Classificação Geral do Cartola Arena
                  </h3>
                  <span className="text-xs text-slate-400 font-bold">{allTeams.length} Times Inscritos</span>
                </div>

                <div className="divide-y divide-slate-800/60">
                  {allTeams.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 font-bold uppercase text-xs">
                      Nenhum time cadastrado na liga ainda. Seja o primeiro a assinar e criar o seu!
                    </div>
                  ) : (
                    allTeams.map((team, idx) => {
                      const isMyTeam = currentUser && team.userId === currentUser.uid;

                      return (
                        <div
                          key={team.id}
                          className={`p-4 sm:p-5 flex items-center justify-between transition-all ${
                            isMyTeam
                              ? 'bg-emerald-950/40 border-l-4 border-l-emerald-500'
                              : 'hover:bg-slate-850'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                              idx === 0 ? 'bg-amber-400 text-slate-950' :
                              idx === 1 ? 'bg-slate-300 text-slate-950' :
                              idx === 2 ? 'bg-amber-700 text-white' :
                              'bg-slate-800 text-slate-400'
                            }`}>
                              {idx + 1}º
                            </span>

                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-slate-950 shadow-md"
                              style={{ backgroundColor: team.badgeColor || '#10b981' }}
                            >
                              <Shirt className="w-5 h-5 text-white" />
                            </div>

                            <div>
                              <h4 className="text-sm font-black text-white flex items-center gap-2">
                                {team.teamName}
                                {isMyTeam && (
                                  <span className="bg-emerald-500 text-slate-950 text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                                    Seu Time
                                  </span>
                                )}
                              </h4>
                              <p className="text-[11px] text-slate-400 font-medium">{team.userName}</p>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="block text-sm font-black text-amber-400">
                              {team.totalPoints || 0} pts
                            </span>
                            <span className="block text-[10px] text-slate-500 font-bold uppercase">
                              {team.playerIds?.length || 0} Atletas
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: REGRAS E PONTUAÇÃO */}
          {activeTab === 'rules' && (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
                <div>
                  <h3 className="text-xl font-black uppercase italic text-white flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-amber-400" />
                    Como Funciona a Pontuação do Cartola Arena
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Os pontos dos seus atletas escalados são computados automaticamente a partir do desempenho oficial nas partidas presenciais marcadas no aplicativo!
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                      +8.0
                    </div>
                    <h4 className="text-sm font-black text-white">Gol Marcado</h4>
                    <p className="text-xs text-slate-400">Cada gol feito pelo atleta adiciona 8.0 pontos no seu saldo da rodada.</p>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black">
                      +5.0
                    </div>
                    <h4 className="text-sm font-black text-white">Assistência</h4>
                    <p className="text-xs text-slate-400">Passe direto para gol concede 5.0 pontos para o garçom do jogo.</p>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-black">
                      +5.0
                    </div>
                    <h4 className="text-sm font-black text-white">Sem Sofrer Gols (SG)</h4>
                    <p className="text-xs text-slate-400">Goleiros e defensores ganham 5.0 pontos bônus se a partida terminar sem gols sofridos.</p>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center font-black">
                      +5.0
                    </div>
                    <h4 className="text-sm font-black text-white">MVP da Partida</h4>
                    <p className="text-xs text-slate-400">Atleta eleito o Craque/MVP da pelada ganha 5.0 pontos adicionais.</p>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-black">
                      +3.0
                    </div>
                    <h4 className="text-sm font-black text-white">Vitória do Time</h4>
                    <p className="text-xs text-slate-400">Estar no time vencedor da pelada adiciona 3.0 pontos para cada jogador.</p>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black">
                      1.5x
                    </div>
                    <h4 className="text-sm font-black text-white">Multiplicador do Capitão</h4>
                    <p className="text-xs text-slate-400">O jogador escolhido como seu Capitão tem toda a pontuação da rodada multiplicada por 1.5x!</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: MINHA ASSINATURA & EXTRATO */}
          {activeTab === 'subscription' && (
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-emerald-500 flex items-center justify-center text-slate-950 shadow-lg">
                    <Crown className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase italic text-white">Assinatura Cartola Arena</h3>
                    <p className="text-xs text-slate-400">
                      R$ 9,90 por mês • Débito automático do saldo • Válido por 30 dias
                    </p>
                  </div>
                </div>

                <div className="bg-slate-950 rounded-2xl p-6 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                    <span className="text-xs font-bold text-slate-400">Status Atual:</span>
                    <span className={`text-xs font-black uppercase px-3 py-1 rounded-full ${
                      isSubscribed
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {isSubscribed ? 'Ativo' : 'Expirado / Pendente'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                    <span className="text-xs font-bold text-slate-400">Dias Restantes:</span>
                    <span className="text-sm font-black text-white">{daysRemaining} dias</span>
                  </div>

                  <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                    <span className="text-xs font-bold text-slate-400">Seu Saldo em Conta:</span>
                    <span className="text-sm font-black text-emerald-400">
                      R$ {userBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <button
                    onClick={handlePayAndSubscribe}
                    disabled={submitting}
                    className="w-full bg-gradient-to-r from-amber-400 to-emerald-500 hover:from-amber-300 hover:to-emerald-400 text-slate-950 font-black uppercase text-xs py-4 rounded-xl shadow-xl transition-all flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Crown className="w-4 h-4" />
                        {isSubscribed ? 'Renovar Assinatura (R$ 9,90 por +30 dias)' : 'Assinar por R$ 9,90/mês'}
                      </>
                    )}
                  </button>
                </div>

                {/* STATEMENT LINK */}
                <div className="bg-slate-950/60 rounded-2xl p-5 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Wallet className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h4 className="text-xs font-black text-white">Extrato de Débitos e Créditos</h4>
                      <p className="text-[10px] text-slate-400">
                        Acesse seu extrato completo de transações e depósitos PIX.
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/banco"
                    className="bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black uppercase px-4 py-2.5 rounded-xl transition-all border border-slate-700"
                  >
                    Ver Extrato →
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PIX QUICK DEPOSIT MODAL */}
      <AnimatePresence>
        {showPixModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative"
            >
              <button
                onClick={() => setShowPixModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <QrCode className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase italic text-white">Depositar via PIX</h3>
                  <p className="text-xs text-slate-400">Adicione saldo para assinar o Cartola Arena</p>
                </div>
              </div>

              <form onSubmit={handleRequestPixDeposit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Valor do Depósito (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={pixAmount}
                    onChange={(e) => setPixAmount(e.target.value)}
                    placeholder="9.90"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-black focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex gap-2">
                  {['9.90', '20.00', '50.00'].map((amt) => (
                    <button
                      type="button"
                      key={amt}
                      onClick={() => setPixAmount(amt)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-black border ${
                        pixAmount === amt
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      R$ {amt}
                    </button>
                  ))}
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-2">
                  <span className="block text-slate-400 font-bold">Chave PIX de Depósito (Atendimento Arena):</span>
                  <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg font-mono text-[11px] text-emerald-400">
                    <span className="truncate">allanjonesms@gmail.com</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('allanjonesms@gmail.com');
                        setCopiedPix(true);
                        setTimeout(() => setCopiedPix(false), 2000);
                      }}
                      className="ml-2 text-slate-300 hover:text-white"
                    >
                      {copiedPix ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={pixSubmitting}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase text-xs py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  {pixSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    'Solicitar Aprovação do Depósito'
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
