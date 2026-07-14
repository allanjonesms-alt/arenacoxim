import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, where, getDoc, doc, addDoc, runTransaction } from 'firebase/firestore';
import { Match, OddsEngineConfig, Player } from '../types';
import { TrendingUp, Shield, Trophy } from 'lucide-react';

interface Props {
  user: any;
  balance: number;
  onRequestDeposit?: () => void;
}

export function PublicBettingMarkets({ user, balance, onRequestDeposit }: Props) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [oddsConfig, setOddsConfig] = useState<OddsEngineConfig | null>(null);
  const [bettingParams, setBettingParams] = useState<any>({ maxBetAmount: 1.00 });
  const [betSettings, setBetSettings] = useState<{ matchWinner?: boolean, playerGoals?: boolean, playerAssists?: boolean }>({});
  const [allBets, setAllBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // For placing a bet
  const [selectedBet, setSelectedBet] = useState<any | null>(null);
  const [betAmount, setBetAmount] = useState<string>('');

  useEffect(() => {
    // Fetch odds config
        const unsubBettingParams = onSnapshot(doc(db, 'settings', 'bettingParams'), snap => {
      if (snap.exists()) {
        setBettingParams(prev => ({ ...prev, ...snap.data() }));
      }
    });
    const unsubBetsSettings = onSnapshot(doc(db, 'settings', 'bets'), snap => {
      if (snap.exists()) {
        setBetSettings(snap.data() as any);
      } else {
        setBetSettings({});
      }
    });

    const unsubOdds = onSnapshot(doc(db, 'settings', 'oddsEngine'), snap => {
      if (snap.exists()) {
        setOddsConfig(snap.data() as OddsEngineConfig);
      } else {
        setOddsConfig(null);
      }
    });

    const unsubMatches = onSnapshot(query(collection(db, 'matches'), where('status', 'in', ['scheduled', 'live'])), snap => {
      const activeMatches = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Match))
        
      setMatches(activeMatches);
    });
    
    const unsubPlayers = onSnapshot(collection(db, 'players'), snap => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Player)));
    });

    // We need all bets to calculate volume for floating odds
    const unsubBets = onSnapshot(collection(db, 'bets'), snap => {
      setAllBets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubMatches();
      unsubPlayers();
      unsubBets();
      unsubBetsSettings();
      unsubBettingParams();
      unsubOdds();
    };
  }, []);

  const calculateFloatingOdds = (match: Match) => {
    const market = match.bettingMarkets?.matchWinner;
    if (!market) return null;

    let { baseOddA, baseOddDraw, baseOddB } = market;
    
    // Safety check for NaN or undefined base odds
    if (!baseOddA || isNaN(baseOddA)) baseOddA = 1.0;
    if (!baseOddDraw || isNaN(baseOddDraw)) baseOddDraw = 1.0;
    if (!baseOddB || isNaN(baseOddB)) baseOddB = 1.0;

    // Calculate volume
    const matchBets = allBets.filter(b => b.matchId === match.id && b.market === 'matchWinner');
    let volA = 0;
    let volDraw = 0;
    let volB = 0;

    matchBets.forEach(b => {
      if (b.selection === 'teamA') volA += b.amount;
      if (b.selection === 'draw') volDraw += b.amount;
      if (b.selection === 'teamB') volB += b.amount;
    });

    if (oddsConfig?.floatingOdds?.enabled) {
      const totalVol = volA + volDraw + volB;
      if (totalVol > 0) {
        const liquidityFactor = oddsConfig.floatingOdds.liquidityFactor ?? 1000;
        const marketProbA = volA / totalVol;
        const marketProbDraw = volDraw / totalVol;
        const marketProbB = volB / totalVol;

        const margin = oddsConfig.matchWinner?.margin ?? 1.25;
        const baseProbA = 1 / (baseOddA * margin);
        const baseProbDraw = 1 / (baseOddDraw * margin);
        const baseProbB = 1 / (baseOddB * margin);

        const marketWeight = totalVol / (totalVol + liquidityFactor);

        const finalProbA = (baseProbA * (1 - marketWeight)) + (marketProbA * marketWeight);
        const finalProbDraw = (baseProbDraw * (1 - marketWeight)) + (marketProbDraw * marketWeight);
        const finalProbB = (baseProbB * (1 - marketWeight)) + (marketProbB * marketWeight);

        // Normalize
        const sumProb = finalProbA + finalProbDraw + finalProbB;
        
        return {
          oddA: (1 / ((finalProbA / sumProb) * margin)).toFixed(2),
          oddDraw: (1 / ((finalProbDraw / sumProb) * margin)).toFixed(2),
          oddB: (1 / ((finalProbB / sumProb) * margin)).toFixed(2)
        };
      }
    }

    return {
      oddA: baseOddA.toFixed(2),
      oddDraw: baseOddDraw.toFixed(2),
      oddB: baseOddB.toFixed(2)
    };
  };

  const handlePlaceBet = async () => {
    const finalBetAmt = bettingParams?.maxBetAmount || 1.00;
    if (!selectedBet || finalBetAmt <= 0) return;
    if (finalBetAmt > balance) {
      alert("Saldo insuficiente!");
      return;
    }

    try {
      await runTransaction(db, async (t) => {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await t.get(userRef);
        if (!userSnap.exists()) throw new Error("Usuário não encontrado");
        
        const currentBalance = userSnap.data().balance || 0;
        const betAmt = finalBetAmt;
        
        if (currentBalance < betAmt) throw new Error("Saldo insuficiente!");
        
        t.update(userRef, { balance: currentBalance - betAmt });
        
        const newBetRef = doc(collection(db, 'bets'));
        t.set(newBetRef, {
          userId: user.uid,
          userEmail: user.email,
          userName: user.displayName || user.email,
          matchId: selectedBet.match.id,
          market: selectedBet.market,
          selection: selectedBet.selection,
          odd: selectedBet.odd,
          amount: betAmt,
          status: 'pending',
          createdAt: new Date().toISOString()
        });
      });
      
      setSelectedBet(null);
      setBetAmount('');
      alert("Aposta realizada com sucesso!");
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Erro ao realizar aposta.");
    }
  };

  if (loading) return null;
  if (matches.length === 0) return null;

  return (
    <div className="space-y-6 mt-8">
      <h3 className="text-xl font-black uppercase italic tracking-tight text-primary-blue flex items-center gap-2">
        <TrendingUp className="w-6 h-6 text-primary-yellow" />
        Mercados Abertos
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {betSettings.matchWinner && matches.map(match => {
          const odds = calculateFloatingOdds(match);
          if (!odds) return null;

          return (
            <div key={match.id} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
              <div className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-widest text-center bg-gray-50 py-2 rounded-xl">
                Vencedor da Partida
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedBet({ match, market: 'matchWinner', selection: 'teamA', odd: odds.oddA })}
                  className="flex-1 bg-slate-900 text-white rounded-2xl p-3 flex flex-col items-center hover:bg-slate-800 transition-colors"
                >
                  <span className="text-[10px] text-slate-400 uppercase font-bold mb-1">Time Azul (1)</span>
                  <span className="text-xl font-black">{odds.oddA}</span>
                </button>
                <button 
                  onClick={() => setSelectedBet({ match, market: 'matchWinner', selection: 'draw', odd: odds.oddDraw })}
                  className="flex-1 bg-slate-900 text-white rounded-2xl p-3 flex flex-col items-center hover:bg-slate-800 transition-colors"
                >
                  <span className="text-[10px] text-slate-400 uppercase font-bold mb-1">Empate (X)</span>
                  <span className="text-xl font-black">{odds.oddDraw}</span>
                </button>
                <button 
                  onClick={() => setSelectedBet({ match, market: 'matchWinner', selection: 'teamB', odd: odds.oddB })}
                  className="flex-1 bg-slate-900 text-white rounded-2xl p-3 flex flex-col items-center hover:bg-slate-800 transition-colors"
                >
                  <span className="text-[10px] text-slate-400 uppercase font-bold mb-1">Time Amarelo (2)</span>
                  <span className="text-xl font-black">{odds.oddB}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedBet && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-br from-primary-blue to-blue-900 p-6 text-white relative overflow-hidden">
              <h3 className="font-black text-xl">Confirmar Aposta</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
                <span className="text-sm font-bold text-gray-600 uppercase">Odd</span>
                <span className="text-2xl font-black text-primary-blue">{selectedBet.odd}</span>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-gray-500">Valor da Aposta (Máximo Permitido)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-gray-500 font-bold">R$</span>
                  </div>
                  <input
                    type="number"
                    value={bettingParams?.maxBetAmount || 1.00}
                    readOnly
                    className="w-full pl-12 pr-4 py-3 bg-gray-100 border border-gray-200 rounded-xl font-bold text-gray-500 focus:outline-none cursor-not-allowed"
                  />
                </div>
                <div className="text-right text-xs font-bold text-gray-500 mt-2">
                  Retorno Potencial: <span className="text-emerald-500 font-black">R$ {(((bettingParams?.maxBetAmount || 1.00) || 0) * Number(selectedBet.odd)).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setSelectedBet(null)}
                  className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                {balance >= (bettingParams?.maxBetAmount || 1.00) ? (
                  <button 
                    onClick={handlePlaceBet}
                    className="flex-1 bg-emerald-500 text-white font-black py-3 rounded-xl hover:bg-emerald-600 transition-colors"
                  >
                    Confirmar Aposta
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      setSelectedBet(null);
                      if(onRequestDeposit) onRequestDeposit();
                    }}
                    className="flex-1 bg-amber-500 text-white font-black py-3 rounded-xl hover:bg-amber-600 transition-colors"
                  >
                    Depositar Saldo
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
