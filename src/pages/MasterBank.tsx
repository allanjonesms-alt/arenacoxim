import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, getDoc, runTransaction } from 'firebase/firestore';
import { AdminData } from '../types';
import { motion } from 'framer-motion';
import { Wallet, CheckCircle2, XCircle, Clock, Search, ArrowLeft, History, Plus, Minus, UserCheck, X, AlertTriangle, Coins, Users, QrCode, Copy, Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { processPendingPaymentBets, isDepositTransaction } from '../utils/bettingUtils';

interface MasterBankProps {
  adminData?: AdminData | null;
}

export default function MasterBank({ adminData }: MasterBankProps) {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  
  // Manual adjustment form states
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'remove'>('add');
  const [adjustReason, setAdjustReason] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false);
  
  // Withdrawal approval modal states
  const [selectedWithdrawTx, setSelectedWithdrawTx] = useState<any | null>(null);
  const [isApprovingWithdraw, setIsApprovingWithdraw] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);

  // Deposit approval & rejection modal states
  const [approvingDepositTx, setApprovingDepositTx] = useState<any | null>(null);
  const [isApprovingDeposit, setIsApprovingDeposit] = useState(false);
  const [rejectingTx, setRejectingTx] = useState<any | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);

  const isMaster = adminData?.role === 'master';

  useEffect(() => {
    if (!isMaster) {
      navigate('/dashboard');
      return;
    }

    // Subscribe to transactions
    const qTx = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
    const unsubscribeTx = onSnapshot(qTx, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setTransactions(data);
      setLoading(false);
    });

    // Subscribe to users for balance adjustment list
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const data: any[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      // Sort users by name/email
      data.sort((a, b) => {
        const nameA = (a.displayName || a.email || '').toLowerCase();
        const nameB = (b.displayName || b.email || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setUsers(data);
      setLoadingUsers(false);
    });

    return () => {
      unsubscribeTx();
      unsubscribeUsers();
    };
  }, [isMaster, navigate]);

  const handleCopyPixKey = (key: string) => {
    if (!key) return;
    navigator.clipboard.writeText(key);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2200);
  };

  const executeWithdrawApproval = async (transaction: any) => {
    if (!transaction) return;
    setIsApprovingWithdraw(true);
    try {
      await runTransaction(db, async (t) => {
        const userRef = doc(db, 'users', transaction.userId);
        const userSnap = await t.get(userRef);
        
        if (!userSnap.exists()) {
          throw new Error("Usuário não encontrado!");
        }
        
        const currentBalance = userSnap.data().balance || 0;
        const newBalance = currentBalance - transaction.amount;
        
        if (newBalance < 0) {
          throw new Error("Saldo do usuário é insuficiente para aprovar este saque!");
        }
        
        t.update(userRef, { balance: newBalance });
        
        const txRef = doc(db, 'transactions', transaction.id);
        t.update(txRef, { 
          status: 'approved',
          approvedAt: new Date().toISOString(),
          approvedBy: adminData?.email || 'Admin Master'
        });
      });

      alert(`Saque de R$ ${transaction.amount.toFixed(2)} para ${transaction.userName} foi APROVADO com sucesso!`);
      setSelectedWithdrawTx(null);
    } catch (error: any) {
      console.error("Erro ao aprovar saque:", error);
      alert(`Erro ao aprovar saque: ${error.message || 'Tente novamente.'}`);
    } finally {
      setIsApprovingWithdraw(false);
    }
  };

  const executeDepositApproval = async (transaction: any) => {
    if (!transaction) return;
    setIsApprovingDeposit(true);
    try {
      await runTransaction(db, async (t) => {
        const userRef = doc(db, 'users', transaction.userId);
        const userSnap = await t.get(userRef);
        
        if (!userSnap.exists()) {
          throw new Error("Usuário não encontrado!");
        }
        
        const currentBalance = userSnap.data().balance || 0;
        const depositAmt = Math.abs(Number(transaction.amount)) || 0;
        const newBalance = currentBalance + depositAmt;
        
        t.update(userRef, { balance: newBalance });
        
        const txRef = doc(db, 'transactions', transaction.id);
        t.update(txRef, { 
          status: 'approved',
          approvedAt: new Date().toISOString(),
          approvedBy: adminData?.email || 'Admin Master'
        });
      });

      await processPendingPaymentBets(db, transaction.userId);

      alert(`Depósito de R$ ${(Math.abs(Number(transaction.amount)) || 0).toFixed(2)} aprovado e saldo creditado!`);
      setApprovingDepositTx(null);
    } catch (error: any) {
      console.error("Erro ao aprovar depósito:", error);
      alert(`Erro ao aprovar depósito: ${error.message || 'Tente novamente.'}`);
    } finally {
      setIsApprovingDeposit(false);
    }
  };

  const handleApprove = (transaction: any) => {
    const isDeposit = isDepositTransaction(transaction);
    if (!isDeposit) {
      setSelectedWithdrawTx(transaction);
      setCopiedPix(false);
    } else {
      setApprovingDepositTx(transaction);
    }
  };

  const executeReject = async (transaction: any) => {
    if (!transaction) return;
    setIsRejecting(true);
    try {
      await updateDoc(doc(db, 'transactions', transaction.id), {
        status: 'rejected',
        rejectedAt: new Date().toISOString(),
        rejectedBy: adminData?.email || 'Admin Master'
      });
      const isDeposit = isDepositTransaction(transaction);
      alert(`${isDeposit ? 'Depósito' : 'Saque'} rejeitado com sucesso!`);
      setRejectingTx(null);
    } catch (error: any) {
      console.error("Erro ao rejeitar:", error);
      alert(`Erro ao rejeitar transação: ${error.message || 'Tente novamente.'}`);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleReject = (transaction: any) => {
    setRejectingTx(transaction);
  };

  const handleManualAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      alert("Selecione um usuário primeiro.");
      return;
    }
    const amountNum = Number(adjustAmount);
    if (!adjustAmount || isNaN(amountNum) || amountNum <= 0) {
      alert("Por favor, insira um valor válido maior que zero.");
      return;
    }

    const selectedUser = users.find(u => u.id === selectedUserId);
    if (!selectedUser) {
      alert("Usuário selecionado inválido.");
      return;
    }

    const reason = adjustReason.trim() || 'Ajuste administrativo';
    const finalType = adjustType === 'add' ? 'deposit' : 'withdraw';
    const noteText = adjustType === 'add'
      ? `Ajuste: Crédito (+ R$ ${amountNum.toFixed(2)}) - ${reason}`
      : `Ajuste: Débito (- R$ ${amountNum.toFixed(2)}) - ${reason}`;

    const confirmMsg = adjustType === 'add'
      ? `Tem certeza que deseja ADICIONAR R$ ${amountNum.toFixed(2)} ao saldo de ${selectedUser.displayName || selectedUser.email}?`
      : `Tem certeza que deseja REMOVER R$ ${amountNum.toFixed(2)} do saldo de ${selectedUser.displayName || selectedUser.email}?`;

    if (!window.confirm(confirmMsg)) return;

    setIsSubmittingAdjustment(true);
    try {
      await runTransaction(db, async (t) => {
        const userRef = doc(db, 'users', selectedUserId);
        const userSnap = await t.get(userRef);

        if (!userSnap.exists()) {
          throw new Error("O usuário não existe no banco de dados.");
        }

        const currentBalance = userSnap.data().balance || 0;
        let newBalance = currentBalance;
        if (adjustType === 'add') {
          newBalance += amountNum;
        } else {
          newBalance -= amountNum;
          if (newBalance < 0) {
            throw new Error(`Saldo insuficiente! O usuário possui R$ ${currentBalance.toFixed(2)}.`);
          }
        }

        // 1. Update balance
        t.update(userRef, { balance: newBalance });

        // 2. Log manual transaction
        const newTxRef = doc(collection(db, 'transactions'));
        t.set(newTxRef, {
          userId: selectedUserId,
          userEmail: selectedUser.email || '',
          userName: selectedUser.displayName || selectedUser.email || 'Usuário',
          amount: amountNum,
          type: finalType,
          status: 'approved',
          note: noteText,
          isManual: true,
          reason: reason,
          createdAt: new Date().toISOString(),
          approvedAt: new Date().toISOString(),
          approvedBy: adminData?.email || 'Admin Master'
        });
      });

      if (adjustType === 'add') {
        await processPendingPaymentBets(db, selectedUserId);
      }

      alert(`Saldo ajustado com sucesso!`);
      setAdjustAmount('');
      setAdjustReason('');
      setSelectedUserId('');
      setUserSearchQuery('');
    } catch (error: any) {
      console.error("Erro no ajuste manual:", error);
      alert(`Erro ao ajustar saldo: ${error.message}`);
    } finally {
      setIsSubmittingAdjustment(false);
    }
  };

  if (!isMaster) return null;

  // Filter users based on search
  const filteredUsers = userSearchQuery.trim() === ''
    ? []
    : users.filter(u => 
        (u.displayName || '').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(userSearchQuery.toLowerCase())
      ).slice(0, 5);

  const selectedUserObj = users.find(u => u.id === selectedUserId);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="bg-gradient-to-br from-gray-900 to-black rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-yellow/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <Link to="/admin/arenabet" className="inline-flex items-center gap-2 text-primary-yellow hover:text-yellow-400 font-bold text-sm uppercase tracking-widest mb-2 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Voltar para ArenaBet
            </Link>
            <h1 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter flex items-center gap-3">
              <Wallet className="w-8 h-8 text-primary-yellow" />
              Banco Master
            </h1>
            <p className="text-gray-400 font-semibold max-w-xl text-sm">
              Gerencie solicitações de depósitos, saques e realize ajustes manuais de saldo diretamente para qualquer usuário.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/admin/users"
              className="bg-primary-blue hover:bg-blue-900 text-white font-black text-xs sm:text-sm uppercase tracking-wider px-5 py-3.5 rounded-2xl flex items-center gap-2.5 shadow-lg border border-blue-400/30 active:scale-95 transition-all cursor-pointer group"
            >
              <Users className="w-5 h-5 text-primary-yellow group-hover:scale-110 transition-transform" />
              <span>Gerenciamento de Usuários</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Balance Adjustment Panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col">
            <h2 className="text-lg font-black uppercase italic tracking-tight text-gray-800 mb-2 flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary-yellow" />
              Ajuste Manual de Saldo
            </h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-6">
              Adicionar ou remover valores direto do saldo do usuário
            </p>

            <form onSubmit={handleManualAdjustment} className="space-y-5">
              {/* User search & selection */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-wider text-gray-500">
                  Selecionar Usuário
                </label>
                
                {!selectedUserId ? (
                  <div className="relative">
                    <div className="relative">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Buscar por nome ou e-mail..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-150 rounded-2xl text-sm font-semibold focus:outline-none focus:border-primary-blue transition-all"
                      />
                    </div>

                    {userSearchQuery.trim() !== '' && (
                      <div className="absolute z-20 w-full mt-2 bg-white border border-gray-150 rounded-2xl shadow-xl overflow-hidden divide-y divide-gray-50">
                        {loadingUsers ? (
                          <div className="p-4 text-center text-xs text-gray-400">Carregando usuários...</div>
                        ) : filteredUsers.length === 0 ? (
                          <div className="p-4 text-center text-xs text-gray-400">Nenhum usuário encontrado</div>
                        ) : (
                          filteredUsers.map(user => (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => {
                                setSelectedUserId(user.id);
                                setUserSearchQuery('');
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="font-black text-xs text-gray-800 uppercase truncate">
                                  {user.displayName || 'Sem nome'}
                                </div>
                                <div className="text-[10px] text-gray-400 font-bold truncate">
                                  {user.email}
                                </div>
                              </div>
                              <span className="shrink-0 bg-slate-100 text-slate-700 px-2 py-1 rounded-lg text-[10px] font-black">
                                R$ {(user.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  selectedUserObj && (
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-150 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="font-black text-xs text-slate-800 uppercase tracking-tight truncate">
                            {selectedUserObj.displayName || 'Sem nome'}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400 font-semibold truncate pl-5.5">
                          {selectedUserObj.email}
                        </div>
                        <div className="text-[11px] text-slate-600 font-extrabold mt-1.5 pl-5.5">
                          Saldo Atual: <span className="text-primary-blue font-black">R$ {(selectedUserObj.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedUserId('')}
                        className="bg-white hover:bg-red-50 text-gray-400 hover:text-red-500 p-1.5 rounded-full border border-gray-150 shadow-sm transition-all cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )
                )}
              </div>

              {selectedUserId && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  {/* Toggle Type */}
                  <div className="space-y-2">
                    <label className="block text-xs font-black uppercase tracking-wider text-gray-500">
                      Tipo de Movimentação
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAdjustType('add')}
                        className={`py-3 rounded-2xl font-black text-xs uppercase tracking-wider border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          adjustType === 'add'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm'
                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                        Crédito (+)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustType('remove')}
                        className={`py-3 rounded-2xl font-black text-xs uppercase tracking-wider border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          adjustType === 'remove'
                            ? 'bg-rose-50 border-rose-500 text-rose-700 shadow-sm'
                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <Minus className="w-4 h-4" />
                        Débito (-)
                      </button>
                    </div>
                  </div>

                  {/* Amount Input */}
                  <div className="space-y-2">
                    <label className="block text-xs font-black uppercase tracking-wider text-gray-500">
                      Valor (R$)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-gray-400">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0,00"
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)}
                        required
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-150 rounded-2xl text-sm font-black text-slate-800 focus:outline-none focus:border-primary-blue focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  {/* Reason Input */}
                  <div className="space-y-2">
                    <label className="block text-xs font-black uppercase tracking-wider text-gray-500">
                      Motivo / Justificativa
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Bônus de Depósito, Estorno de Aposta..."
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-150 rounded-2xl text-xs font-semibold focus:outline-none focus:border-primary-blue focus:bg-white transition-all"
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmittingAdjustment}
                    className={`w-full py-3.5 rounded-2xl text-white font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${
                      adjustType === 'add'
                        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                        : 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                    } disabled:opacity-50`}
                  >
                    {isSubmittingAdjustment ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirmar Ajuste</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right: Transactions History (Takes col-span-2) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-black uppercase italic tracking-tight text-gray-800 mb-6 flex items-center gap-2">
              <History className="w-5 h-5 text-primary-blue" />
              Histórico de Transações
            </h2>

            {loading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-blue"></div>
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-10 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-gray-500 font-bold">Nenhuma transação no momento.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[650px] overflow-y-auto pr-1 text-slate-700">
                {transactions.map((tx) => {
                  const isDeposit = isDepositTransaction(tx);
                  return (
                    <div key={tx.id} className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-100 hover:border-blue-200 transition-colors">
                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                          {tx.isManual ? (
                            <Coins className="w-6 h-6 text-primary-yellow" />
                          ) : isDeposit ? (
                            <Wallet className="w-6 h-6 text-primary-blue" />
                          ) : (
                            <Wallet className="w-6 h-6 text-rose-500" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-black text-gray-800 uppercase text-xs sm:text-sm truncate">{tx.userName}</h4>
                          <p className="text-[10px] sm:text-xs text-gray-400 font-bold truncate">{tx.userEmail}</p>
                          
                          {/* Transaction label/description */}
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                              tx.isManual 
                                ? isDeposit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                : isDeposit ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {tx.isManual ? 'Ajuste Manual' : isDeposit ? 'Depósito PIX' : 'Saque'}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400">
                              {new Date(tx.createdAt).toLocaleString('pt-BR')}
                            </span>
                          </div>

                          {tx.note && (
                            <p className="text-[11px] text-slate-500 font-semibold mt-1 bg-white/60 border border-slate-100 px-2 py-1 rounded-lg">
                              {tx.note}
                            </p>
                          )}

                          {!isDeposit && tx.pixKey && (
                            <div className="mt-1.5 text-xs font-medium text-slate-700 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-xl flex items-center justify-between gap-2 max-w-md">
                              <span className="truncate">
                                <span className="text-[9px] uppercase font-black tracking-wider text-amber-800 mr-1.5">PIX ({tx.pixKeyType || 'Chave'}):</span>
                                <strong className="font-mono text-gray-900 select-all">{tx.pixKey}</strong>
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-250">
                        <div className="text-left sm:text-right">
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Valor</p>
                          <p className={`font-black text-base ${isDeposit ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isDeposit ? '+' : '-'} R$ {Math.abs(Number(tx.amount) || 0).toFixed(2)}
                          </p>
                        </div>

                      {tx.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(tx)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white p-2.5 rounded-xl transition-colors shadow-sm cursor-pointer"
                            title="Aprovar"
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleReject(tx)}
                            className="bg-rose-500 hover:bg-rose-600 text-white p-2.5 rounded-xl transition-colors shadow-sm cursor-pointer"
                            title="Rejeitar"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <div className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest text-center min-w-[90px] ${
                          tx.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {tx.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                        </div>
                      )}
                    </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Aprovação de Saque PIX */}
      {selectedWithdrawTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-gray-100 flex flex-col gap-5 relative overflow-hidden text-slate-800">
            
            {/* Top Banner Accent */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-500 via-primary-blue to-emerald-500" />

            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
                  <QrCode className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black uppercase italic tracking-tight text-gray-900">
                    Aprovação de Saque PIX
                  </h3>
                  <p className="text-xs text-gray-500 font-bold">
                    Confirme os dados do pagamento antes de aprovar
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWithdrawTx(null)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User & Amount Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-100">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">Solicitante</span>
                <p className="font-black text-xs sm:text-sm text-gray-800 truncate">{selectedWithdrawTx.userName || 'Usuário'}</p>
                <p className="text-[11px] font-semibold text-gray-500 truncate">{selectedWithdrawTx.userEmail || '-'}</p>
              </div>

              <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-100/80">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block mb-1">Valor do Saque</span>
                <p className="font-black text-lg sm:text-xl text-emerald-700 leading-none">
                  R$ {(Number(selectedWithdrawTx.amount) || 0).toFixed(2)}
                </p>
                <p className="text-[10px] font-bold text-emerald-600 mt-1">
                  {selectedWithdrawTx.createdAt ? new Date(selectedWithdrawTx.createdAt).toLocaleString('pt-BR') : ''}
                </p>
              </div>
            </div>

            {/* PIX Key Section */}
            <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 space-y-2.5 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Coins className="w-4 h-4" />
                  Chave PIX Cadastrada
                </span>
                {selectedWithdrawTx.pixKeyType && (
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    Tipo: {selectedWithdrawTx.pixKeyType}
                  </span>
                )}
              </div>

              {selectedWithdrawTx.pixKey ? (
                <div className="flex items-center justify-between bg-slate-800/90 border border-slate-700/80 rounded-xl p-3 gap-2">
                  <span className="font-mono font-bold text-xs sm:text-sm text-white select-all break-all">
                    {selectedWithdrawTx.pixKey}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyPixKey(selectedWithdrawTx.pixKey)}
                    className="flex-shrink-0 bg-primary-blue hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                  >
                    {copiedPix ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                        <span className="text-emerald-300">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="bg-rose-950/40 border border-rose-800/50 p-3 rounded-xl text-rose-300 text-xs font-semibold">
                  Chave PIX não informada explicitamente nesta solicitação. Verifique com o usuário ({selectedWithdrawTx.userEmail}).
                </div>
              )}
            </div>

            {/* Warning Notice */}
            <div className="bg-amber-50 border border-amber-200/80 p-3 rounded-xl flex items-start gap-2 text-amber-900 text-xs font-medium">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="leading-tight">
                Realize a transferência via PIX no aplicativo do seu banco usando a chave acima. Ao clicar em <strong>Aprovar</strong>, o saldo de R$ {(Number(selectedWithdrawTx.amount) || 0).toFixed(2)} será deduzido da conta do usuário no sistema.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedWithdrawTx(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-2xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isApprovingWithdraw}
                onClick={() => executeWithdrawApproval(selectedWithdrawTx)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black py-3 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isApprovingWithdraw ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar e Aprovar</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Aprovação de Depósito PIX */}
      {approvingDepositTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 flex flex-col gap-5 relative overflow-hidden text-slate-800">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 to-teal-500" />

            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-xs">
                  <Wallet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black uppercase italic tracking-tight text-gray-900">
                    Aprovar Depósito
                  </h3>
                  <p className="text-xs text-gray-500 font-bold">
                    Confirme o crédito no saldo do usuário
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setApprovingDepositTx(null)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-emerald-50/80 p-4 rounded-2xl border border-emerald-100 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase text-emerald-800">Solicitante:</span>
                <span className="text-xs font-bold text-gray-900 truncate max-w-[200px]">{approvingDepositTx.userName || approvingDepositTx.userEmail}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase text-emerald-800">Valor a Creditar:</span>
                <span className="text-base font-black text-emerald-700">R$ {(Math.abs(Number(approvingDepositTx.amount)) || 0).toFixed(2)}</span>
              </div>
            </div>

            <p className="text-xs font-semibold text-gray-600 leading-relaxed">
              Ao confirmar, o valor de <strong>R$ {(Math.abs(Number(approvingDepositTx.amount)) || 0).toFixed(2)}</strong> será adicionado instantaneamente ao saldo do usuário e apostas pendentes serão liberadas se aplicável.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setApprovingDepositTx(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-2xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isApprovingDeposit}
                onClick={() => executeDepositApproval(approvingDepositTx)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black py-3 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isApprovingDeposit ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar e Creditar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Rejeição de Transação */}
      {rejectingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 flex flex-col gap-5 relative overflow-hidden text-slate-800">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-rose-500 to-red-600" />

            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
                  <XCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black uppercase italic tracking-tight text-gray-900">
                    Rejeitar Transação
                  </h3>
                  <p className="text-xs text-gray-500 font-bold">
                    {isDepositTransaction(rejectingTx) ? 'Depósito PIX' : 'Saque PIX'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRejectingTx(null)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-rose-50/80 p-4 rounded-2xl border border-rose-100 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase text-rose-800">Solicitante:</span>
                <span className="text-xs font-bold text-gray-900 truncate max-w-[200px]">{rejectingTx.userName || rejectingTx.userEmail}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase text-rose-800">Valor:</span>
                <span className="text-base font-black text-rose-700">R$ {(Math.abs(Number(rejectingTx.amount)) || 0).toFixed(2)}</span>
              </div>
            </div>

            <p className="text-xs font-semibold text-gray-600 leading-relaxed">
              Tem certeza que deseja <strong>REJEITAR</strong> esta solicitação de {isDepositTransaction(rejectingTx) ? 'depósito' : 'saque'}? Esta ação não pode ser desfeita.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectingTx(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-2xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isRejecting}
                onClick={() => executeReject(rejectingTx)}
                className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black py-3 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isRejecting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    <span>Confirmar Rejeição</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
