import React, { useState, useEffect } from 'react';
import { Wallet, TrendingUp, History, PlusCircle, ArrowUpRight, ArrowDownRight, Clock, CheckCircle2, XCircle, Copy, X, QrCode, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { doc, getDoc, setDoc, collection, query, where, orderBy, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PublicBettingMarkets } from './PublicBettingMarkets';

interface UserBettingDashboardProps {
  user: any;
  isMaster?: boolean;
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

export function UserBettingDashboard({ user, isMaster }: UserBettingDashboardProps) {
  const [balance, setBalance] = useState<number>(0);
  const [bets, setBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [copied, setCopied] = useState(false);
  
  const pixCode = getDynamicPixCode(depositAmount);

  const activeBetsAmount = bets
    .filter(b => b.status === 'pending')
    .reduce((acc, b) => acc + (b.amount || 0), 0);

  const totalValue = balance + activeBetsAmount;
  const maxDepositAllowed = Math.max(0, 20.00 - totalValue);

  
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
      setShowDepositModal(false);
      setDepositAmount('');
      alert('Seu depósito foi solicitado! O valor será aprovado em breve pelo administrador.');
    } catch (error) {
      console.error('Error adding transaction: ', error);
      alert('Erro ao solicitar depósito. Tente novamente.');
    }
  };
  const handleCopyPix = () => {
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!user) return;

    let unsubscribeUser: () => void;
    let unsubscribeBets: () => void;

    const loadUserData = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          // Initialize user
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
        const q = query(betsRef, where('userId', '==', user.uid)); // Needs index if we add orderBy
        
        unsubscribeBets = onSnapshot(q, (snapshot) => {
          const loadedBets = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as any[];
          
          // Sort client side for now to avoid needing a composite index immediately
          loadedBets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          setBets(loadedBets);
          setLoading(false);
        });

      } catch (err) {
        console.error("Error loading user data:", err);
        setLoading(false);
      }
    };

    loadUserData();

    return () => {
      if (unsubscribeUser) unsubscribeUser();
      if (unsubscribeBets) unsubscribeBets();
    };
  }, [user]);

  return (
    <div className="space-y-6">

      {/* Modal de Depósito */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-br from-primary-blue to-blue-900 p-6 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mt-10 -mr-10" />
              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <h3 className="font-black text-xl flex items-center gap-2">
                    <PlusCircle className="w-6 h-6 text-primary-yellow" />
                    Adicionar Saldo
                  </h3>
                  <p className="text-blue-200 text-sm mt-1 font-medium">Depósito via PIX</p>
                </div>
                <button 
                  onClick={() => {
                    setShowDepositModal(false);
                    setDepositAmount('');
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-blue-200 hover:text-white relative z-20 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Informative limit notice */}
              <div className="bg-blue-50 text-blue-900 text-xs p-3.5 rounded-2xl border border-blue-100 flex flex-col gap-1.5 shadow-sm">
                <div className="flex items-center gap-1.5 font-black uppercase tracking-wider text-blue-800 text-[10px]">
                  <AlertCircle className="w-4 h-4 text-primary-blue shrink-0" /> Limite Máximo de Depósito
                </div>
                <p className="font-bold">
                  Você pode depositar no máximo <span className="text-primary-blue font-black text-sm">R$ {maxDepositAllowed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>.
                </p>
                <div className="text-gray-500 font-semibold leading-relaxed text-[10px] space-y-0.5 border-t border-blue-100/50 pt-1.5 mt-0.5">
                  <p>• O teto total é de R$ 20,00.</p>
                  <p>• Seu saldo atual: R$ {balance.toFixed(2)}</p>
                  <p>• Suas apostas ativas: R$ {activeBetsAmount.toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-gray-500">Valor do Depósito (R$)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-gray-500 font-bold">R$</span>
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
                  <p className="text-[11px] font-black text-rose-600 uppercase tracking-wide flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Atenção: O valor máximo permitido é R$ {maxDepositAllowed.toFixed(2)}.
                  </p>
                )}
              </div>

              {depositAmount && Number(depositAmount) > 0 && Number(depositAmount) <= maxDepositAllowed && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex justify-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixCode)}`}
                      alt="QR Code PIX"
                      className="w-48 h-48 rounded-lg shadow-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-gray-500">PIX Copia e Cola</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        value={pixCode}
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-600 focus:outline-none"
                      />
                      <button 
                        onClick={handleCopyPix}
                        className={`px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                          copied ? 'bg-emerald-500 text-white shadow-emerald-500/25' : 'bg-primary-blue text-white hover:bg-blue-900 shadow-blue-900/25'
                        } shadow-lg active:scale-95`}
                      >
                        {copied ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" /> Copiado!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" /> Copiar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded-xl flex items-start gap-2 border border-blue-100">
                      <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <p>O saldo será adicionado automaticamente assim que o pagamento for confirmado pelo banco.</p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => {
                    setShowDepositModal(false);
                    setDepositAmount('');
                  }}
                  className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                {depositAmount && Number(depositAmount) > 0 && Number(depositAmount) <= maxDepositAllowed && (
                  <button 
                    onClick={handlePixEfetivado} 
                    className="flex-1 bg-emerald-500 text-white font-black py-3 rounded-xl hover:bg-emerald-600 transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-5 h-5" /> PIX Efetivado
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Resumo da Carteira */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card de Saldo */}
        <div className="md:col-span-2 bg-gradient-to-br from-primary-blue to-blue-900 rounded-[2rem] p-6 md:p-8 text-white shadow-lg relative overflow-hidden flex flex-col justify-between min-h-[200px]">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mt-20 -mr-20" />
          <div className="relative z-10 flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-blue-200 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Wallet className="w-4 h-4" /> Saldo Disponível
              </span>
              <div className="text-4xl md:text-5xl font-black tracking-tighter">
                <span className="text-blue-300 text-2xl mr-1">R$</span>
                {loading ? '...' : balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
          
          <div className="relative z-10 mt-8 space-y-3">
            <div className="flex gap-3">
              <button 
                disabled={totalValue >= 20.00}
                onClick={() => setShowDepositModal(true)}
                className="flex-1 bg-primary-yellow text-primary-blue py-3 px-4 rounded-xl font-black text-xs md:text-sm uppercase tracking-wider hover:bg-yellow-400 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" /> Depositar
              </button>
              <button className="flex-1 bg-white/10 text-white py-3 px-4 rounded-xl font-black text-xs md:text-sm uppercase tracking-wider hover:bg-white/20 transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/10">
                <ArrowDownRight className="w-4 h-4" /> Sacar
              </button>
            </div>

            {totalValue >= 20.00 ? (
              <p className="text-[11px] text-amber-300 font-bold bg-amber-500/10 p-2 rounded-xl flex items-center gap-1.5 border border-amber-500/20">
                <AlertCircle className="w-3.5 h-3.5 text-primary-yellow shrink-0" />
                Limite total de R$ 20,00 atingido (Saldo: R$ {balance.toFixed(2)} + Apostas Ativas: R$ {activeBetsAmount.toFixed(2)}). Novos depósitos estão suspensos.
              </p>
            ) : (
              <p className="text-[11px] text-blue-200 font-semibold bg-white/5 p-2 rounded-xl">
                Você pode depositar até <span className="text-white font-black">R$ {maxDepositAllowed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> (Teto de R$ 20,00 considerando Saldo + Apostas Ativas).
              </p>
            )}
          </div>
        </div>

        {/* Card de Estatísticas */}
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex flex-col justify-center space-y-6">
          <div className="space-y-1">
            <span className="text-gray-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" /> Total em Apostas
            </span>
            <div className="text-2xl font-black text-gray-800">
              R$ {bets.reduce((acc, bet) => acc + (bet.amount || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="space-y-1 pt-4 border-t border-gray-50">
            <span className="text-gray-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <History className="w-3.5 h-3.5" /> Apostas Ativas
            </span>
            <div className="text-2xl font-black text-primary-blue">
              {bets.filter(b => b.status === 'pending').length}
            </div>
          </div>
        </div>
      </div>

      <PublicBettingMarkets user={user} balance={balance} onRequestDeposit={() => setShowDepositModal(true)} />

      {/* Histórico Recente */}
      <div className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-gray-100">
        <h3 className="text-lg font-black uppercase italic tracking-tight text-primary-blue flex items-center gap-2 mb-6">
          <History className="w-5 h-5 text-gray-400" /> Minhas Apostas
        </h3>
        
        {loading ? (
          <div className="py-10 flex justify-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-blue"></div>
          </div>
        ) : bets.length === 0 ? (
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
              <Wallet className="w-5 h-5 text-gray-300" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-600">Nenhuma aposta realizada</p>
              <p className="text-xs text-gray-400 mt-1 font-medium">Faça um depósito e comece a apostar nos próximos jogos.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {bets.map((bet) => (
              <div key={bet.id} className="group border border-gray-100 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 justify-between hover:border-blue-100 hover:shadow-md transition-all bg-white">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {bet.status === 'pending' && <Clock className="w-5 h-5 text-orange-400" />}
                    {bet.status === 'won' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                    {bet.status === 'lost' && <XCircle className="w-5 h-5 text-rose-500" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md
                        ${bet.status === 'pending' ? 'bg-orange-100 text-orange-700' : 
                          bet.status === 'won' ? 'bg-emerald-100 text-emerald-700' : 
                          'bg-rose-100 text-rose-700'}
                      `}>
                        {bet.status === 'pending' ? 'Em andamento' : bet.status === 'won' ? 'Ganhou' : 'Perdeu'}
                      </span>
                      <span className="text-xs text-gray-400 font-medium">
                        {new Date(bet.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <h4 className="text-sm font-black text-gray-800 mt-1">
                      {bet.matchInfo || 'Partida'}
                    </h4>
                    <p className="text-xs text-gray-500 font-semibold mt-0.5">
                      Palpite: <span className="text-primary-blue">{bet.selectedOutcome}</span> @ {bet.odds}
                    </p>
                  </div>
                </div>
                
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 sm:border-l border-gray-50 pt-3 sm:pt-0 sm:pl-4 min-w-[120px]">
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Valor Apostado
                  </div>
                  <div className="text-base font-black text-gray-800">
                    R$ {bet.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  {bet.status === 'won' && (
                    <div className="text-xs font-black text-emerald-500 mt-1 flex items-center gap-1">
                      + R$ {(bet.amount * bet.odds).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
