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
            <button
              onClick={() => navigate('/banco?tab=active_bets', { state: { activeTab: 'active_bets' } })}
              className="text-xs text-primary-blue hover:text-blue-900 font-bold underline cursor-pointer inline-flex items-center gap-1 mt-1"
            >
              Ver apostas ativas →
            </button>
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
    </div>
  );
}
