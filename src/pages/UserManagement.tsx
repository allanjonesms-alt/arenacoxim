import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  runTransaction,
  where,
  getDocs
} from 'firebase/firestore';
import { AdminData, Player } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  Search, 
  ArrowLeft, 
  Coins, 
  ShieldCheck, 
  TrendingUp, 
  History, 
  Copy, 
  Check, 
  Plus, 
  Minus, 
  X, 
  Wallet, 
  Calendar, 
  Mail, 
  User as UserIcon,
  Ticket,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

interface UserManagementProps {
  adminData?: AdminData | null;
}

export default function UserManagement({ adminData }: UserManagementProps) {
  const navigate = useNavigate();
  const isMaster = adminData?.role === 'master';

  const [users, setUsers] = useState<any[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'balance_desc' | 'balance_asc' | 'name' | 'recent'>('balance_desc');

  // Copy feedback state
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  // Balance Adjustment Modal State
  const [adjustingUser, setAdjustingUser] = useState<any | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'remove'>('add');
  const [adjustReason, setAdjustReason] = useState('');
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false);

  // History Modal State
  const [historyUser, setHistoryUser] = useState<any | null>(null);
  const [userTransactions, setUserTransactions] = useState<any[]>([]);
  const [userBets, setUserBets] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!isMaster) {
      navigate('/dashboard');
      return;
    }

    // Subscribe to users collection
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setUsers(list);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching users:", err);
      setLoading(false);
    });

    // Subscribe to players collection to map linked athletes
    const unsubscribePlayers = onSnapshot(collection(db, 'players'), (snapshot) => {
      const pList: Player[] = [];
      snapshot.forEach((docSnap) => {
        pList.push({ id: docSnap.id, ...docSnap.data() } as Player);
      });
      setPlayers(pList);
    });

    return () => {
      unsubscribeUsers();
      unsubscribePlayers();
    };
  }, [isMaster, navigate]);

  // Load user history when modal opens
  useEffect(() => {
    if (!historyUser) {
      setUserTransactions([]);
      setUserBets([]);
      return;
    }

    setLoadingHistory(true);

    // Subscribe to user's transactions
    const qTx = query(
      collection(db, 'transactions'),
      where('userId', '==', historyUser.id)
    );
    const unsubTx = onSnapshot(qTx, (snapshot) => {
      const txs: any[] = [];
      snapshot.forEach((d) => txs.push({ id: d.id, ...d.data() }));
      txs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setUserTransactions(txs);
    });

    // Subscribe to user's bets
    const qBets = query(
      collection(db, 'bets'),
      where('userId', '==', historyUser.id)
    );
    const unsubBets = onSnapshot(qBets, (snapshot) => {
      const bs: any[] = [];
      snapshot.forEach((d) => bs.push({ id: d.id, ...d.data() }));
      bs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setUserBets(bs);
      setLoadingHistory(false);
    }, () => setLoadingHistory(false));

    return () => {
      unsubTx();
      unsubBets();
    };
  }, [historyUser]);

  // Map users with linked player info
  const usersWithExtra = useMemo(() => {
    return users.map(u => {
      const userEmail = (u.email || '').toLowerCase().trim();
      const linkedPlayer = players.find(p => p.gmail?.toLowerCase().trim() === userEmail);
      return {
        ...u,
        linkedPlayer
      };
    });
  }, [users, players]);

  // Filtered & Sorted Users
  const filteredUsers = useMemo(() => {
    let result = usersWithExtra.filter(u => {
      const term = searchTerm.toLowerCase().trim();
      if (!term) return true;
      const name = (u.displayName || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const uid = (u.id || '').toLowerCase();
      const playerName = (u.linkedPlayer?.name || u.linkedPlayer?.nickname || '').toLowerCase();
      return name.includes(term) || email.includes(term) || uid.includes(term) || playerName.includes(term);
    });

    result.sort((a, b) => {
      if (sortBy === 'balance_desc') {
        return (b.balance || 0) - (a.balance || 0);
      }
      if (sortBy === 'balance_asc') {
        return (a.balance || 0) - (b.balance || 0);
      }
      if (sortBy === 'name') {
        const nameA = (a.displayName || a.email || '').toLowerCase();
        const nameB = (b.displayName || b.email || '').toLowerCase();
        return nameA.localeCompare(nameB);
      }
      if (sortBy === 'recent') {
        const dateA = new Date(a.createdAt || a.lastLogin || 0).getTime();
        const dateB = new Date(b.createdAt || b.lastLogin || 0).getTime();
        return dateB - dateA;
      }
      return 0;
    });

    return result;
  }, [usersWithExtra, searchTerm, sortBy]);

  // Metrics
  const totalUsersCount = users.length;
  const totalBalanceInCirculation = useMemo(() => {
    return users.reduce((sum, u) => sum + (Number(u.balance) || 0), 0);
  }, [users]);

  const maxBalanceUser = useMemo(() => {
    if (users.length === 0) return null;
    return [...users].sort((a, b) => (b.balance || 0) - (a.balance || 0))[0];
  }, [users]);

  const handleCopyUid = (uid: string) => {
    navigator.clipboard.writeText(uid);
    setCopiedUid(uid);
    setTimeout(() => setCopiedUid(null), 2000);
  };

  const handleManualAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingUser) return;

    const amountNum = parseFloat(adjustAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert("Por favor, insira um valor válido maior que zero.");
      return;
    }

    if (!adjustReason.trim()) {
      alert("Informe o motivo do ajuste de saldo.");
      return;
    }

    setIsSubmittingAdjustment(true);

    try {
      await runTransaction(db, async (t) => {
        const userRef = doc(db, 'users', adjustingUser.id);
        const userSnap = await t.get(userRef);

        if (!userSnap.exists()) {
          throw new Error("Usuário não encontrado no banco de dados.");
        }

        const currentBalance = userSnap.data().balance || 0;
        let newBalance = currentBalance;

        if (adjustType === 'add') {
          newBalance += amountNum;
        } else {
          if (currentBalance < amountNum) {
            throw new Error(`Saldo insuficiente! Saldo atual: R$ ${currentBalance.toFixed(2)}`);
          }
          newBalance -= amountNum;
        }

        // Update user balance
        t.update(userRef, { balance: newBalance });

        // Record adjustment transaction
        const txRef = doc(collection(db, 'transactions'));
        t.set(txRef, {
          userId: adjustingUser.id,
          userName: adjustingUser.displayName || adjustingUser.email || 'Usuário',
          userEmail: adjustingUser.email || '',
          type: 'adjustment',
          adjustType: adjustType, // 'add' | 'remove'
          amount: amountNum,
          status: 'approved',
          reason: adjustReason.trim(),
          createdBy: adminData?.email || 'Master Admin',
          createdAt: new Date().toISOString()
        });
      });

      alert(`Saldo ${adjustType === 'add' ? 'adicionado' : 'removido'} com sucesso!`);
      setAdjustingUser(null);
      setAdjustAmount('');
      setAdjustReason('');
    } catch (error: any) {
      console.error("Erro no ajuste de saldo:", error);
      alert(`Erro: ${error.message}`);
    } finally {
      setIsSubmittingAdjustment(false);
    }
  };

  if (!isMaster) return null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Hero Header */}
      <div className="bg-gradient-to-br from-gray-900 via-slate-900 to-black rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary-yellow/10 rounded-full blur-3xl -mr-24 -mt-24 pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <Link 
              to="/admin/banco" 
              className="inline-flex items-center gap-2 text-primary-yellow hover:text-yellow-400 font-bold text-xs uppercase tracking-widest mb-2 transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
              <span>Voltar para Banco Master</span>
            </Link>

            <h1 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter flex items-center gap-3">
              <Users className="w-8 h-8 text-primary-yellow" />
              Gerenciamento de Usuários Logados
            </h1>

            <p className="text-gray-400 font-semibold max-w-xl text-xs sm:text-sm leading-relaxed">
              Consulte todos os usuários cadastrados e logados no aplicativo, verifique saldos em tempo real, ajuste créditos e consulte extratos individuais.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
              <div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Painel Exclusivo</span>
                <span className="text-xs font-black text-white uppercase italic">Master Admin</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Metric 1 */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-primary-blue flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Total de Usuários Logados</span>
            <span className="text-2xl font-black text-gray-900">{totalUsersCount}</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Saldo Total em Circulação</span>
            <span className="text-2xl font-black text-emerald-600">
              R$ {totalBalanceInCirculation.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs flex items-center gap-4 sm:col-span-2 lg:col-span-1">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="truncate">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Maior Saldo Registrado</span>
            <span className="text-lg font-black text-gray-900 truncate block">
              {maxBalanceUser ? (
                <>
                  R$ {(maxBalanceUser.balance || 0).toFixed(2)}{' '}
                  <span className="text-xs font-semibold text-gray-400">
                    ({maxBalanceUser.displayName || maxBalanceUser.email?.split('@')[0]})
                  </span>
                </>
              ) : 'R$ 0,00'}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search input */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail, atleta ou UID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-primary-blue transition-all"
          />
        </div>

        {/* Sorting selector */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <span className="text-xs font-black uppercase tracking-wider text-gray-400 shrink-0">Ordenar por:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-700 focus:outline-none focus:border-primary-blue cursor-pointer"
          >
            <option value="balance_desc">Maior Saldo primeiro</option>
            <option value="balance_asc">Menor Saldo primeiro</option>
            <option value="name">Nome (A-Z)</option>
            <option value="recent">Mais Recentes</option>
          </select>
        </div>
      </div>

      {/* Users Cards Grid */}
      {loading ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-4 border-primary-blue border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Carregando usuários do sistema...</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 space-y-3">
          <Users className="w-12 h-12 text-gray-300 mx-auto" />
          <h3 className="text-base font-black text-gray-700 uppercase italic">Nenhum usuário encontrado</h3>
          <p className="text-xs font-semibold text-gray-400 max-w-md mx-auto">
            {searchTerm ? `Nenhum resultado para "${searchTerm}". Tente buscar por outro termo.` : 'Nenhum usuário cadastrado no momento.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredUsers.map((userObj) => {
            const hasPhoto = Boolean(userObj.photoURL);
            const userBalance = Number(userObj.balance) || 0;
            const formattedDate = userObj.createdAt 
              ? new Date(userObj.createdAt).toLocaleDateString('pt-BR') 
              : userObj.lastLogin 
                ? new Date(userObj.lastLogin).toLocaleDateString('pt-BR')
                : 'Cadastrado';

            return (
              <div 
                key={userObj.id} 
                className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-5 relative group"
              >
                {/* Card Top: User Info & Avatar */}
                <div className="space-y-4">
                  <div className="flex items-start gap-3.5">
                    {/* User Avatar */}
                    {hasPhoto ? (
                      <img 
                        src={userObj.photoURL} 
                        alt="" 
                        className="w-12 h-12 rounded-2xl object-cover border-2 border-primary-yellow shadow-xs shrink-0" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-blue to-blue-900 text-white font-black text-base flex items-center justify-center uppercase shadow-xs shrink-0 border-2 border-primary-yellow">
                        {(userObj.displayName || userObj.email || 'U')[0]}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-sm text-gray-900 truncate uppercase tracking-tight">
                        {userObj.displayName || 'Usuário sem Nome'}
                      </h4>
                      
                      <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 truncate mt-0.5">
                        <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{userObj.email || 'Sem e-mail'}</span>
                      </div>

                      {/* Linked Player Badge */}
                      {userObj.linkedPlayer ? (
                        <div className="inline-flex items-center gap-1 bg-blue-50 text-primary-blue text-[9px] font-black uppercase px-2.5 py-0.5 rounded-lg border border-blue-100 mt-2">
                          <UserIcon className="w-3 h-3 text-primary-yellow" />
                          <span>Atleta: {userObj.linkedPlayer.name}</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 bg-gray-50 text-gray-400 text-[9px] font-bold uppercase px-2.5 py-0.5 rounded-lg border border-gray-100 mt-2">
                          <span>Não vinculado a atleta</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* UID Block */}
                  <div className="bg-gray-50/80 rounded-2xl p-2.5 border border-gray-100 flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">ID do Usuário (UID)</span>
                      <span className="text-[10px] font-mono text-gray-600 font-bold truncate block">{userObj.id}</span>
                    </div>
                    <button
                      onClick={() => handleCopyUid(userObj.id)}
                      className="p-1.5 hover:bg-gray-200/80 rounded-xl transition-colors shrink-0 text-gray-500 cursor-pointer"
                      title="Copiar UID"
                    >
                      {copiedUid === userObj.id ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Card Middle: Balance Display */}
                <div className="bg-gradient-to-r from-emerald-50/80 to-teal-50/80 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-emerald-800/80 uppercase tracking-widest block">Saldo Disponível</span>
                    <span className="text-xl font-black text-emerald-600">
                      R$ {userBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="text-right text-[10px] font-bold text-gray-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-gray-400" />
                    <span>{formattedDate}</span>
                  </div>
                </div>

                {/* Card Footer: Action Buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      setAdjustingUser(userObj);
                      setAdjustAmount('');
                      setAdjustType('add');
                      setAdjustReason('');
                    }}
                    className="flex-1 bg-primary-blue hover:bg-blue-900 text-white font-black text-xs uppercase tracking-wider py-2.5 px-3 rounded-xl transition-all shadow-xs active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Coins className="w-3.5 h-3.5 text-primary-yellow" />
                    <span>Ajustar Saldo</span>
                  </button>

                  <button
                    onClick={() => setHistoryUser(userObj)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs uppercase tracking-wider py-2.5 px-3 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Ver histórico de apostas e transações"
                  >
                    <History className="w-3.5 h-3.5 text-slate-500" />
                    <span>Extrato</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Balance Adjustment */}
      <AnimatePresence>
        {adjustingUser && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-gray-100"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-gray-900 to-slate-900 p-6 text-white flex items-center justify-between relative">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-primary-yellow/20 text-primary-yellow flex items-center justify-center font-black">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg uppercase italic tracking-tight">Ajustar Saldo Manual</h3>
                    <p className="text-gray-400 text-xs font-semibold">
                      {adjustingUser.displayName || adjustingUser.email}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setAdjustingUser(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleManualAdjustment} className="p-6 space-y-5">
                {/* Current Balance Notice */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-gray-500">Saldo Atual do Usuário:</span>
                  <span className="text-lg font-black text-emerald-600">
                    R$ {(Number(adjustingUser.balance) || 0).toFixed(2)}
                  </span>
                </div>

                {/* Operation Type Toggle */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-500">Tipo de Operação</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAdjustType('add')}
                      className={`py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                        adjustType === 'add'
                          ? 'bg-emerald-500 text-white border-emerald-600 shadow-md'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <Plus className="w-4 h-4" />
                      <span>Adicionar Saldo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAdjustType('remove')}
                      className={`py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                        adjustType === 'remove'
                          ? 'bg-rose-500 text-white border-rose-600 shadow-md'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <Minus className="w-4 h-4" />
                      <span>Remover Saldo</span>
                    </button>
                  </div>
                </div>

                {/* Amount Field */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-500">Valor do Ajuste (R$)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 font-black">
                      R$
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      required
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl font-black text-lg text-gray-800 focus:outline-none focus:border-primary-blue transition-all"
                    />
                  </div>
                </div>

                {/* Reason Field */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-500">Motivo / Descrição</label>
                  <input
                    type="text"
                    placeholder="Ex: Bônus de recarga, Correção de depósito, etc."
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 focus:outline-none focus:border-primary-blue transition-all"
                  />
                </div>

                {/* Submit / Cancel Buttons */}
                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setAdjustingUser(null)}
                    disabled={isSubmittingAdjustment}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-black text-xs uppercase tracking-wider rounded-2xl transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmittingAdjustment}
                    className={`flex-1 py-3 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer ${
                      adjustType === 'add' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
                    }`}
                  >
                    {isSubmittingAdjustment ? 'Processando...' : 'Confirmar Ajuste'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: User History & Statement */}
      <AnimatePresence>
        {historyUser && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-gray-100"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-gray-900 to-slate-900 p-6 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-black">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg uppercase italic tracking-tight">Extrato & Histórico</h3>
                    <p className="text-gray-400 text-xs font-semibold">
                      {historyUser.displayName || historyUser.email}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setHistoryUser(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                {/* Balance Summary Header inside modal */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase text-gray-400 block">Saldo Atual</span>
                    <span className="text-xl font-black text-emerald-600">
                      R$ {(Number(historyUser.balance) || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-black uppercase text-gray-400 block">Apostas Realizadas</span>
                    <span className="text-base font-black text-gray-800">{userBets.length} bilhetes</span>
                  </div>
                </div>

                {loadingHistory ? (
                  <div className="py-12 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Carregando extrato do usuário...
                  </div>
                ) : (
                  <>
                    {/* Section: Transactions */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-2 border-b border-gray-100 pb-2">
                        <Wallet className="w-4 h-4 text-primary-blue" />
                        Transações de Saldo ({userTransactions.length})
                      </h4>

                      {userTransactions.length === 0 ? (
                        <p className="text-xs text-gray-400 font-semibold py-2">Nenhuma transação registrada para este usuário.</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {userTransactions.map((tx) => {
                            const isDeposit = tx.type === 'deposit';
                            const isAdjustment = tx.type === 'adjustment';
                            const isAdd = isDeposit || (isAdjustment && tx.adjustType === 'add');

                            return (
                              <div key={tx.id} className="bg-gray-50/80 p-3 rounded-2xl border border-gray-100 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2.5">
                                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black ${
                                    isAdd ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                  }`}>
                                    {isAdd ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                                  </div>
                                  <div>
                                    <span className="font-black text-gray-800 block uppercase">
                                      {isDeposit ? 'Depósito PIX' : tx.type === 'withdrawal' ? 'Saque PIX' : 'Ajuste Manual'}
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-400">
                                      {tx.createdAt ? new Date(tx.createdAt).toLocaleString('pt-BR') : 'Data não informada'}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right">
                                  <span className={`font-black ${isAdd ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {isAdd ? '+' : '-'} R$ {(Number(tx.amount) || 0).toFixed(2)}
                                  </span>
                                  <span className="block text-[9px] font-black uppercase text-gray-400">
                                    {tx.status === 'approved' ? 'Aprovado' : tx.status === 'pending' ? 'Pendente' : 'Rejeitado'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Section: Bets */}
                    <div className="space-y-3 pt-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-2 border-b border-gray-100 pb-2">
                        <Ticket className="w-4 h-4 text-primary-yellow" />
                        Histórico de Apostas ({userBets.length})
                      </h4>

                      {userBets.length === 0 ? (
                        <p className="text-xs text-gray-400 font-semibold py-2">Nenhuma aposta realizada por este usuário.</p>
                      ) : (
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {userBets.map((bet) => (
                            <div key={bet.id} className="bg-gray-50/80 p-3 rounded-2xl border border-gray-100 flex items-center justify-between text-xs">
                              <div>
                                <span className="font-black text-gray-800 block uppercase">
                                  {bet.matchInfo || 'Aposta em Partida'}
                                </span>
                                <span className="text-[10px] font-bold text-primary-blue uppercase">
                                  Palpite: {bet.selectedOutcome || bet.selection} (@ {bet.odd})
                                </span>
                              </div>

                              <div className="text-right">
                                <span className="font-black text-gray-800 block">
                                  R$ {(Number(bet.amount) || 0).toFixed(2)}
                                </span>
                                <span className={`text-[9px] font-black uppercase ${
                                  bet.status === 'won' ? 'text-emerald-600' : bet.status === 'lost' ? 'text-rose-500' : 'text-amber-500'
                                }`}>
                                  {bet.status === 'won' ? 'Ganha' : bet.status === 'lost' ? 'Perdida' : 'Pendente'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
