import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Wallet, 
  PlusCircle, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Copy, 
  X, 
  AlertCircle, 
  ArrowLeft, 
  History, 
  TrendingUp, 
  CreditCard 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { processPendingPaymentBets } from '../utils/bettingUtils';
import { db } from '../firebase';
import { PublicBettingMarkets } from '../components/PublicBettingMarkets';

interface BancoUsuarioProps {
  user: any;
}

const getDynamicPixCode = (amountStr: string) => {
  const basePart1 = "00020126360014BR.GOV.BCB.PIX0114+5567984373039520400005303986";
  const basePart2 = "5802BR5901N6001C62140510ARENACOXIM6304";
  
  if (!amountStr) {
    return "00020126360014BR.GOV.BCB.PIX0114+55679843730395204000053039865802BR5901N6001C62140510ARENACOXIM6304EBCB";
  }
  
  const amountNum = Number(amountStr);
  if (isNaN(amountNum) || amountNum <= 0) {
    return "00020126360014BR.GOV.BCB.PIX0114+55679843730395204000053039865802BR5901N6001C62140510ARENACOXIM6304EBCB";
  }
  
  const formattedAmount = amountNum.toFixed(2);
  const lenStr = formattedAmount.length.toString().padStart(2, '0');
  const amountField = `54${lenStr}${formattedAmount}`;
  
  const rawPayload = basePart1 + amountField + basePart2;
  
  let crc = 0xFFFF;
  const polynomial = 0x1021;
  for (let i = 0; i < rawPayload.length; i++) {
    const b = rawPayload.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      const bit = ((b >> (7 - j)) & 1) === 1;
      const c15 = ((crc >> 15) & 1) === 1;
      crc <<= 1;
      if (c15 !== bit) {
        crc ^= polynomial;
      }
    }
  }
  crc &= 0xFFFF;
  let hex = crc.toString(16).toUpperCase();
  while (hex.length < 4) {
    hex = '0' + hex;
  }
  
  return rawPayload + hex;
};

export default function BancoUsuario({ user }: BancoUsuarioProps) {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [activeTab, setActiveTab] = useState<'overview' | 'deposit' | 'withdraw' | 'active_bets' | 'finalized_bets'>(() => {
    if (location.state?.activeTab) {
      return location.state.activeTab;
    }
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'active_bets' || tabParam === 'finalized_bets' || tabParam === 'deposit' || tabParam === 'withdraw' || tabParam === 'overview') {
      return tabParam as any;
    }
    return 'overview';
  });
  const [balance, setBalance] = useState<number>(0);
  const [bets, setBets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Deposit state
  const [depositAmount, setDepositAmount] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState('cpf');
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    let unsubscribeUser: () => void;
    let unsubscribeBets: () => void;
    let unsubscribeTx: () => void;

    const loadUserData = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          await setDoc(userRef, {
            email: user.email,
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            balance: 0,
            createdAt: new Date().toISOString()
          });
        }

        unsubscribeUser = onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            setBalance(snap.data().balance || 0);
          }
        });

        // Listen to bets
        const betsRef = collection(db, 'bets');
        const qBets = query(betsRef, where('userId', '==', user.uid));
        
        unsubscribeBets = onSnapshot(qBets, (snapshot) => {
          const loadedBets = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as any[];
          
          loadedBets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setBets(loadedBets);
          setLoading(false);
        });

        // Listen to transactions
        const txRef = collection(db, 'transactions');
        const qTx = query(txRef, where('userId', '==', user.uid));
        
        unsubscribeTx = onSnapshot(qTx, (snapshot) => {
          const loadedTxs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as any[];
          
          loadedTxs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setTransactions(loadedTxs);
        });

      } catch (err) {
        console.error("Error loading bank data:", err);
        setLoading(false);
      }
    };

    loadUserData();

    return () => {
      if (unsubscribeUser) unsubscribeUser();
      if (unsubscribeBets) unsubscribeBets();
      if (unsubscribeTx) unsubscribeTx();
    };
  }, [user, navigate]);

  useEffect(() => {
    if (user?.uid) {
      processPendingPaymentBets(db, user.uid);
    }
  }, [user, balance]);

  const pendingPaymentBets = bets.filter(b => b.status === 'pending_payment');
  const activeBets = bets.filter(b => b.status === 'pending');
  const finalizedBets = bets.filter(b => b.status === 'won' || b.status === 'lost');
  
  const activeBetsAmount = activeBets.reduce((acc, b) => acc + (b.amount || 0), 0);
  const totalValue = balance + activeBetsAmount;
  const maxDepositAllowed = Math.max(0, 20.00 - totalValue);
  
  // Pending withdrawals (saques pendentes)
  const pendingWithdrawAmount = transactions
    .filter(tx => tx.type === 'withdraw' && tx.status === 'pending')
    .reduce((acc, tx) => acc + (tx.amount || 0), 0);

  // Available for withdrawal (balance minus pending withdrawals to prevent double-withdrawal)
  const availableForWithdraw = Math.max(0, balance - pendingWithdrawAmount);

  const pixCode = getDynamicPixCode(depositAmount);

  const handleCopyPix = () => {
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePixEfetivado = async () => {
    const amountNum = Number(depositAmount);
    if (!depositAmount || amountNum <= 0) return;

    if (amountNum > maxDepositAllowed) {
      alert(`O valor máximo que você pode depositar no momento é R$ ${maxDepositAllowed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`);
      return;
    }
    
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || user.email,
        amount: amountNum,
        type: 'deposit',
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      setDepositAmount('');
      alert('Seu depósito foi solicitado! O valor será aprovado em breve pelo administrador.');
      setActiveTab('overview');
    } catch (error) {
      console.error('Error adding transaction: ', error);
      alert('Erro ao solicitar depósito. Tente novamente.');
    }
  };

  const handleRequestWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(withdrawAmount);
    if (!withdrawAmount || amountNum <= 0) {
      alert('Por favor, informe um valor de saque válido.');
      return;
    }

    if (amountNum > availableForWithdraw) {
      alert(`Você não possui saldo disponível suficiente para este saque. Saldo real: R$ ${balance.toFixed(2)}, Pendente de aprovação: R$ ${pendingWithdrawAmount.toFixed(2)}.`);
      return;
    }

    if (!pixKey.trim()) {
      alert('Por favor, informe a Chave PIX.');
      return;
    }

    setWithdrawSubmitting(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || user.email,
        amount: amountNum,
        type: 'withdraw',
        status: 'pending',
        pixKey: pixKey.trim(),
        pixKeyType: pixKeyType,
        createdAt: new Date().toISOString()
      });
      setWithdrawAmount('');
      setPixKey('');
      alert('Sua solicitação de saque foi enviada com sucesso! O administrador analisará e fará a transferência em breve.');
      setActiveTab('overview');
    } catch (error) {
      console.error('Error adding withdraw request: ', error);
      alert('Erro ao solicitar saque. Tente novamente.');
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-blue"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
      
      {/* Header and Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={() => navigate('/apostas')}
          className="inline-flex items-center gap-2 px-5 py-3 bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 rounded-2xl transition-all border border-gray-100 shadow-sm font-black text-xs uppercase tracking-wider cursor-pointer self-start"
          title="Voltar para Apostas"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para Apostas</span>
        </button>

        <div className="text-right hidden sm:block">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ambiente de Transações</span>
          <p className="text-xs text-gray-500 font-bold">Arena Coxim Banking</p>
        </div>
      </div>

      {/* Main Bank Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Card: Balance Info & Navigation Tabs */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-gradient-to-br from-primary-blue to-blue-900 rounded-[2.5rem] p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[200px]">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl -mt-10 -mr-10" />
            <div className="relative z-10 space-y-1">
              <span className="text-blue-200 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary-yellow" /> Saldo Disponível
              </span>
              <div className="text-4xl font-black tracking-tighter">
                <span className="text-blue-300 text-xl mr-1">R$</span>
                {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div className="relative z-10 mt-6 pt-4 border-t border-white/10 flex justify-between text-xs text-blue-200">
              <div>
                <span className="block font-bold opacity-60 uppercase text-[9px] tracking-wider">Apostas Ativas</span>
                <span className="font-black text-white">R$ {activeBetsAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="text-right">
                <span className="block font-bold opacity-60 uppercase text-[9px] tracking-wider">Patrimônio Total</span>
                <span className="font-black text-white">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Tab Navigation Menu */}
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex flex-col gap-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-primary-blue text-white shadow-md shadow-blue-900/10'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Wallet className="w-4 h-4" />
                Resumo da Conta
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-bold">
                {transactions.length} Tx
              </span>
            </button>

            <button
              onClick={() => setActiveTab('deposit')}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'deposit'
                  ? 'bg-primary-blue text-white shadow-md shadow-blue-900/10'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <PlusCircle className="w-4 h-4" />
                Depositar PIX
              </span>
              {maxDepositAllowed > 0 && (
                <span className="text-[9px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-black uppercase">
                  Ativo
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('withdraw')}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'withdraw'
                  ? 'bg-primary-blue text-white shadow-md shadow-blue-900/10'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ArrowUpRight className="w-4 h-4" />
                Solicitar Saque
              </span>
              {balance > 0 && (
                <span className="text-[10px] bg-amber-500 text-white px-2.5 py-0.5 rounded-full font-bold">
                  Disponível
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('active_bets')}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'active_bets'
                  ? 'bg-primary-blue text-white shadow-md shadow-blue-900/10'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Clock className="w-4 h-4" />
                Apostas Ativas
              </span>
              <span className="text-[10px] bg-orange-100 text-orange-700 px-2.5 py-0.5 rounded-full font-bold">
                {activeBets.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('finalized_bets')}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'finalized_bets'
                  ? 'bg-primary-blue text-white shadow-md shadow-blue-900/10'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <History className="w-4 h-4" />
                Apostas Encerradas
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-bold">
                {finalizedBets.length}
              </span>
            </button>
          </div>
        </div>

        {/* Right Area: Dynamic Page content */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 space-y-6">
                  <div>
                    <h2 className="text-xl font-black text-primary-blue uppercase italic tracking-tight flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-gray-400" />
                      Banco Arena Coxim
                    </h2>
                    <p className="text-xs text-gray-400 font-bold uppercase mt-1">
                      Visão geral da sua carteira digital de palpites esportivos
                    </p>
                  </div>

                  {/* Summary widgets */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total em Apostas</span>
                      <p className="text-xl font-black text-gray-800 mt-1">
                        R$ {bets.reduce((acc, b) => acc + (b.amount || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Rendimento de Palpites</span>
                      <p className="text-xl font-black text-emerald-600 mt-1">
                        R$ {finalizedBets.filter(b => b.status === 'won').reduce((acc, b) => acc + (b.amount * b.odds - b.amount), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  {/* Limits and Constraints */}
                  <div className="bg-blue-50 text-blue-900 text-xs p-4 rounded-2xl border border-blue-100 space-y-2">
                    <h3 className="font-black uppercase tracking-wider text-[10px] text-blue-800 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4 text-primary-blue" /> Regras de Limites Operacionais
                    </h3>
                    <p className="font-bold leading-relaxed">
                      O teto máximo permitido por usuário é de <span className="font-black text-primary-blue">R$ 20,00</span> (considerando seu Saldo Disponível mais todas as Apostas Ativas).
                    </p>
                    <p className="text-[10px] text-gray-500 font-medium">
                      Esta política promove a diversão segura, controlando a exposição financeira na liga de futebol amador.
                    </p>
                  </div>
                </div>

                {/* Recent Transaction Log */}
                <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
                  <h3 className="text-md font-black uppercase italic tracking-tight text-gray-700 flex items-center gap-2 mb-4">
                    <History className="w-4 h-4 text-gray-400" />
                    Histórico de Transações (Depósitos e Saques)
                  </h3>

                  {transactions.length === 0 ? (
                    <div className="py-10 text-center text-xs text-gray-400 font-bold uppercase">
                      Nenhuma transação registrada
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {transactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between border border-gray-50 rounded-2xl p-4 hover:bg-slate-50 transition-all bg-slate-50/30">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                              {tx.type === 'deposit' ? (
                                <PlusCircle className="w-5 h-5 text-primary-blue" />
                              ) : (
                                <ArrowUpRight className="w-5 h-5 text-rose-500" />
                              )}
                            </div>
                            <div>
                              <span className="block text-xs font-black text-gray-800 uppercase tracking-tight">
                                {tx.note ? tx.note : (tx.type === 'deposit' ? 'Depósito PIX' : 'Saque Bancário')}
                              </span>
                              <span className="block text-[10px] text-gray-400 font-bold">
                                {new Date(tx.createdAt).toLocaleString('pt-BR')}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <span className="block text-xs font-black text-gray-800">
                                {tx.type === 'deposit' ? '+' : '-'} R$ {tx.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                              <span className={`inline-block text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md mt-1 ${
                                tx.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                tx.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                'bg-rose-100 text-rose-700'
                              }`}>
                                {tx.status === 'pending' ? 'Pendente' : tx.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* DEPOSIT TAB */}
            {activeTab === 'deposit' && (
              <motion.div
                key="deposit"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 space-y-6"
              >
                <div>
                  <h2 className="text-xl font-black text-primary-blue uppercase italic tracking-tight flex items-center gap-2">
                    <PlusCircle className="w-5 h-5 text-emerald-500" />
                    Realizar Depósito PIX
                  </h2>
                  <p className="text-xs text-gray-400 font-bold uppercase mt-1">
                    Adicione fundos para poder realizar palpites nos mercados de gols
                  </p>
                </div>

                <div className="bg-amber-50 text-amber-900 text-xs p-4 rounded-2xl border border-amber-100 space-y-1">
                  <span className="font-black uppercase tracking-wider text-[9px] text-amber-800 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4 shrink-0" /> Limites Importantes
                  </span>
                  <p className="font-bold">
                    Seu limite de depósito no momento é de <span className="font-black">R$ {maxDepositAllowed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>.
                  </p>
                  <p className="text-[10px] text-gray-500 font-semibold leading-relaxed">
                    A soma do seu saldo disponível (R$ {balance.toFixed(2)}) e suas apostas pendentes (R$ {activeBetsAmount.toFixed(2)}) não pode ultrapassar R$ 20,00.
                  </p>
                </div>

                {maxDepositAllowed <= 0 ? (
                  <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-150 space-y-2">
                    <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                    <h4 className="font-black uppercase text-gray-700">Limite Atingido</h4>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto font-bold leading-normal">
                      Você já alcançou o teto regulamentar de R$ 20,00 em saldo e apostas ativas. Aguarde a finalização dos seus palpites pendentes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-widest text-gray-500">Valor a Depositar</label>
                      <div className="relative max-w-xs">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <span className="text-gray-400 font-bold">R$</span>
                        </div>
                        <input
                          type="number"
                          max={maxDepositAllowed}
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="0,00"
                          className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent transition-all"
                        />
                      </div>
                      {Number(depositAmount) > maxDepositAllowed && (
                        <p className="text-[10px] font-black text-rose-600 uppercase tracking-wide flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3.5 h-3.5" /> Atenção: O limite máximo é R$ {maxDepositAllowed.toFixed(2)}.
                        </p>
                      )}
                    </div>

                    {depositAmount && Number(depositAmount) > 0 && Number(depositAmount) <= maxDepositAllowed && (
                      <div className="space-y-4 p-4 border border-slate-100 rounded-2xl bg-slate-50/50 animate-in fade-in duration-200">
                        <div className="flex justify-center p-4 bg-white rounded-xl shadow-inner border border-slate-50">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(pixCode)}`}
                            alt="QR Code PIX"
                            className="w-40 h-40 rounded-lg"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Código PIX Copia e Cola</label>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              readOnly 
                              value={pixCode}
                              className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-500 focus:outline-none truncate"
                            />
                            <button 
                              onClick={handleCopyPix}
                              className={`px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shrink-0 ${
                                copied ? 'bg-emerald-500 text-white' : 'bg-primary-blue text-white hover:bg-blue-900'
                              }`}
                            >
                              {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              <span>{copied ? 'Copiado' : 'Copiar'}</span>
                            </button>
                          </div>
                        </div>

                        <div className="bg-blue-50 text-blue-800 text-[11px] p-3 rounded-xl flex items-start gap-2 leading-relaxed border border-blue-100">
                          <Clock className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary-blue" />
                          <p>Após realizar a transferência via PIX no aplicativo do seu banco, clique no botão <strong>PIX Efetivado</strong> para solicitar a liberação do saldo.</p>
                        </div>

                        <div className="pt-2 flex justify-end">
                          <button 
                            onClick={handlePixEfetivado} 
                            className="bg-emerald-500 text-white font-black px-6 py-3.5 rounded-xl hover:bg-emerald-600 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider"
                          >
                            <CheckCircle2 className="w-5 h-5" /> PIX Efetivado
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* WITHDRAW TAB */}
            {activeTab === 'withdraw' && (
              <motion.div
                key="withdraw"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 space-y-6"
              >
                <div>
                  <h2 className="text-xl font-black text-primary-blue uppercase italic tracking-tight flex items-center gap-2">
                    <ArrowUpRight className="w-5 h-5 text-rose-500" />
                    Solicitar Saque Bancário
                  </h2>
                  <p className="text-xs text-gray-400 font-bold uppercase mt-1">
                    Retire seus ganhos diretamente para sua conta bancária via PIX
                  </p>
                </div>

                <div className="bg-gray-50 border border-gray-150 p-4 rounded-2xl flex justify-between items-center text-xs">
                  <div>
                    <span className="block font-bold text-gray-400 uppercase text-[9px] tracking-wider">Saldo Líquido Disponível</span>
                    <span className="font-black text-gray-800 text-base">R$ {availableForWithdraw.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {pendingWithdrawAmount > 0 && (
                    <div className="text-right">
                      <span className="block font-bold text-amber-500 uppercase text-[9px] tracking-wider">Aguardando Aprovação</span>
                      <span className="font-bold text-amber-600">R$ {pendingWithdrawAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>

                {availableForWithdraw <= 0 ? (
                  <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-150 space-y-2">
                    <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                    <h4 className="font-black uppercase text-gray-700">Sem Saldo Disponível</h4>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto font-bold leading-normal">
                      Você não possui saldo livre para realizar saques no momento.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleRequestWithdraw} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-gray-500">Tipo de Chave PIX</label>
                        <select
                          value={pixKeyType}
                          onChange={(e) => setPixKeyType(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent transition-all text-xs"
                        >
                          <option value="cpf">CPF</option>
                          <option value="phone">Celular</option>
                          <option value="email">E-mail</option>
                          <option value="random">Chave Aleatória</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-gray-500">Chave PIX</label>
                        <input
                          type="text"
                          required
                          value={pixKey}
                          onChange={(e) => setPixKey(e.target.value)}
                          placeholder="Insira sua chave PIX..."
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent transition-all text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-widest text-gray-500">Valor do Saque</label>
                      <div className="relative max-w-xs">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <span className="text-gray-400 font-bold">R$</span>
                        </div>
                        <input
                          type="number"
                          required
                          max={availableForWithdraw}
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          placeholder="0,00"
                          className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent transition-all"
                        />
                      </div>
                    </div>

                    <div className="bg-slate-50 text-slate-600 text-[11px] p-3.5 rounded-xl border border-slate-100 flex items-start gap-2 leading-relaxed">
                      <Clock className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                      <p>Os pedidos de saques são avaliados e processados manualmente pelo administrador da Arena Coxim para garantir total controle financeiro.</p>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={withdrawSubmitting || !withdrawAmount || Number(withdrawAmount) > availableForWithdraw}
                        className="bg-rose-500 hover:bg-rose-600 text-white font-black px-6 py-3.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                      >
                        {withdrawSubmitting ? 'Processando...' : 'Solicitar Saque'}
                      </button>
                    </div>
                  </form>
                )}
              </motion.div>
            )}

            {/* ACTIVE BETS TAB */}
            {activeTab === 'active_bets' && (
              <motion.div
                key="active_bets"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 space-y-6"
              >
                <div>
                  <h2 className="text-xl font-black text-primary-blue uppercase italic tracking-tight flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-500 animate-pulse" />
                    Apostas Ativas & Pendentes
                  </h2>
                  <p className="text-xs text-gray-400 font-bold uppercase mt-1">
                    Seus palpites atualmente em andamento ou aguardando saldo
                  </p>
                </div>

                {/* Unpaid / Pending Payment Bets Section */}
                {pendingPaymentBets.length > 0 && (
                  <div className="space-y-3 p-4 bg-amber-50/80 rounded-2xl border border-amber-200">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                      <h3 className="text-xs font-black text-amber-900 uppercase">
                        Apostas Pendentes de Saldo ({pendingPaymentBets.length})
                      </h3>
                    </div>
                    <p className="text-[11px] text-amber-800 font-medium leading-snug">
                      Apostas registradas sem saldo. Elas serão aprovadas e ativadas automaticamente assim que for incluído saldo na sua conta.
                    </p>
                    <div className="space-y-2 pt-1">
                      {pendingPaymentBets.map((bet) => (
                        <div key={bet.id} className="bg-white p-3 rounded-xl border border-amber-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                Aguardando Saldo
                              </span>
                              <span className="text-[10px] text-gray-400 font-bold">
                                {new Date(bet.createdAt).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <h4 className="text-xs font-black text-gray-800">{bet.matchInfo || 'Partida'}</h4>
                            <p className="text-xs text-gray-600 font-semibold">
                              Palpite: <span className="text-primary-blue font-black">{bet.selectedOutcome || bet.selection}</span> @ {bet.odds || bet.odd}
                            </p>
                          </div>
                          <div className="text-right sm:text-right w-full sm:w-auto flex sm:flex-col justify-between sm:justify-center items-center sm:items-end">
                            <span className="text-xs font-black text-amber-800">R$ {(Number(bet.amount) || 0).toFixed(2)}</span>
                            <button
                              onClick={() => setActiveTab('deposit')}
                              className="text-[10px] font-bold text-amber-700 underline hover:text-amber-900 cursor-pointer uppercase"
                            >
                              Depositar Saldo
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeBets.length === 0 ? (
                  <div className="py-12 bg-gray-50 rounded-2xl border border-gray-100 text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto" />
                    <p className="text-sm font-bold text-gray-500">Nenhuma aposta ativa</p>
                    <button
                      onClick={() => navigate('/apostas')}
                      className="inline-block px-4 py-2 bg-primary-blue hover:bg-blue-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                    >
                      Ver Mercados Abertos
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeBets.map((bet) => (
                      <div key={bet.id} className="border border-gray-100 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 justify-between hover:border-blue-100 hover:shadow-md transition-all bg-white shadow-sm">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-100">
                              Aguardando Jogo
                            </span>
                            <span className="text-[10px] text-gray-400 font-bold">
                              {new Date(bet.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          <h4 className="text-sm font-black text-gray-800">{bet.matchInfo || 'Partida'}</h4>
                          <p className="text-xs text-gray-500 font-semibold">
                            Seu palpite: <span className="text-primary-blue font-black">{bet.selectedOutcome}</span> @ {bet.odds}
                          </p>
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 sm:border-l border-gray-50 pt-3 sm:pt-0 sm:pl-4 min-w-[120px]">
                          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                            Valor Apostado
                          </div>
                          <div className="text-base font-black text-gray-800">
                            R$ {bet.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] font-bold text-gray-400 mt-1">
                            Retorno Possível: R$ {(bet.amount * bet.odds).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* FINALIZED BETS TAB */}
            {activeTab === 'finalized_bets' && (
              <motion.div
                key="finalized_bets"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 space-y-6"
              >
                <div>
                  <h2 className="text-xl font-black text-primary-blue uppercase italic tracking-tight flex items-center gap-2">
                    <History className="w-5 h-5 text-gray-400" />
                    Apostas Encerradas
                  </h2>
                  <p className="text-xs text-gray-400 font-bold uppercase mt-1">
                    Ganhos e perdas de seus palpites concluídos
                  </p>
                </div>

                {finalizedBets.length === 0 ? (
                  <div className="py-12 bg-gray-50 rounded-2xl border border-gray-100 text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-gray-300 mx-auto" />
                    <p className="text-sm font-bold text-gray-500">Nenhuma aposta encerrada até o momento</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {finalizedBets.map((bet) => (
                      <div key={bet.id} className="border border-gray-100 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 justify-between hover:border-blue-100 hover:shadow-md transition-all bg-white shadow-sm">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                              bet.status === 'won' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                : 'bg-rose-50 text-rose-700 border-rose-100'
                            }`}>
                              {bet.status === 'won' ? 'GANHOU' : 'PERDIDA'}
                            </span>
                            <span className="text-[10px] text-gray-400 font-bold">
                              {new Date(bet.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          <h4 className="text-sm font-black text-gray-800">{bet.matchInfo || 'Partida'}</h4>
                          <p className="text-xs text-gray-500 font-semibold">
                            Seu palpite: <span className="text-primary-blue font-black">{bet.selectedOutcome}</span> @ {bet.odds}
                          </p>
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 sm:border-l border-gray-50 pt-3 sm:pt-0 sm:pl-4 min-w-[140px]">
                          {bet.status === 'won' ? (
                            <div className="text-right space-y-1 w-full">
                              <div>
                                <span className="block text-[10px] font-black uppercase tracking-widest text-emerald-600">
                                  Valor Apostado
                                </span>
                                <span className="text-sm font-black text-emerald-600">
                                  R$ {bet.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="pt-0.5">
                                <span className="block text-[10px] font-black uppercase tracking-widest text-emerald-600">
                                  Retorno
                                </span>
                                <span className="text-base font-black text-emerald-600">
                                  R$ {(bet.amount * bet.odds).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-right space-y-1 w-full">
                              <div>
                                <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
                                  Valor Apostado
                                </span>
                                <span className="text-sm font-bold text-gray-700">
                                  R$ {bet.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="pt-1">
                                <span className="text-xs font-black text-rose-600 uppercase bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md inline-block">
                                  PERDIDA
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
