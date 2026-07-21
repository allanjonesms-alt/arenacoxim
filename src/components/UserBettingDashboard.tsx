import React, { useState, useEffect } from 'react';
import { Wallet, TrendingUp, History, PlusCircle, ArrowUpRight, ArrowDownRight, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { PublicBettingMarkets } from './PublicBettingMarkets';
import { useNavigate } from 'react-router-dom';

interface UserBettingDashboardProps {
  user: any;
  isMaster?: boolean;
}

export function UserBettingDashboard({ user, isMaster }: UserBettingDashboardProps) {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number>(0);
  const [bets, setBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const activeBetsAmount = bets
    .filter(b => b.status === 'pending')
    .reduce((acc, b) => acc + (b.amount || 0), 0);

  const totalValue = balance + activeBetsAmount;
  const maxDepositAllowed = Math.max(0, 20.00 - totalValue);

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

      {/* Resumo da Carteira */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card de Apostas Ativas */}
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-gray-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-primary-blue animate-pulse" /> Apostas Ativas
            </span>
            <div className="text-3xl font-black text-primary-blue">
              {bets.filter(b => b.status === 'pending').length}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
            <Clock className="w-6 h-6 text-primary-blue" />
          </div>
        </div>

        {/* Card de Acesso ao Banco */}
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-gray-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5 text-emerald-500" /> Banco Arena Coxim
            </span>
            <p className="text-xs text-gray-400 font-semibold mt-0.5">
              Faça depósitos, saques e veja o extrato completo
            </p>
          </div>
          <button
            onClick={() => navigate('/banco')}
            className="bg-primary-blue hover:bg-blue-900 text-white font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <Wallet className="w-4 h-4 text-primary-yellow shrink-0" />
            <span>Acessar</span>
          </button>
        </div>
      </div>

      <PublicBettingMarkets user={user} balance={balance} onRequestDeposit={() => navigate('/banco')} />

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
