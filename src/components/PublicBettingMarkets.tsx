import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, where, getDoc, doc, addDoc, runTransaction } from 'firebase/firestore';
import { Match, OddsEngineConfig, Player, Card } from '../types';
import { TrendingUp, Shield, Trophy, Target, Zap } from 'lucide-react';
import { getPositionAbbr, getPositionColor, getPlayerFinalOverall } from '../utils/playerUtils';

interface Props {
  user: any;
  balance: number;
  onRequestDeposit?: () => void;
}

export function PublicBettingMarkets({ user, balance, onRequestDeposit }: Props) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
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

    const unsubCards = onSnapshot(collection(db, 'cards'), snap => {
      setCards(snap.docs.map(d => ({ id: d.id, ...d.data() } as Card)));
    });

    // We need all bets to calculate volume for floating odds
    const unsubBets = onSnapshot(collection(db, 'bets'), snap => {
      setAllBets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubMatches();
      unsubPlayers();
      unsubCards();
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

  const calculatePlayerPropOdds = (player: Player, oppAvg: number) => {
    const overall = getPlayerFinalOverall(player, cards);
    
    // Base expectations if no history
    let baseG = oddsConfig?.baseGoals.default ?? 0.6;
    let baseA = oddsConfig?.baseAssists.default ?? 0.6;
    
    if (player.position === 'centroavante') { 
        baseG = oddsConfig?.baseGoals.centroavante ?? 1.20; 
        baseA = oddsConfig?.baseAssists.centroavante ?? 0.50; 
    }
    else if (player.position === 'meio-campo') { 
        baseG = oddsConfig?.baseGoals.meioCampo ?? 0.80; 
        baseA = oddsConfig?.baseAssists.meioCampo ?? 0.90; 
    }
    else if (player.position === 'zagueiro') { 
        baseG = oddsConfig?.baseGoals.zagueiro ?? 0.20; 
        baseA = oddsConfig?.baseAssists.zagueiro ?? 0.20; 
    }
    else if (player.position === 'lateral') { 
        baseG = oddsConfig?.baseGoals.lateral ?? 0.40; 
        baseA = oddsConfig?.baseAssists.lateral ?? 0.60; 
    }
    else if (player.position === 'goleiro') { 
        baseG = oddsConfig?.baseGoals.goleiro ?? 0.02; 
        baseA = oddsConfig?.baseAssists.goleiro ?? 0.05; 
    }

    const matchesCount = player.stats?.matches || 0;
    const goals = player.stats?.goals || 0;
    const assists = player.stats?.assists || 0;

    // Média histórica real de Gols e Assistências
    const playerAvgG = matchesCount > 0 ? goals / matchesCount : baseG;
    const playerAvgA = matchesCount > 0 ? assists / matchesCount : baseA;

    // Blend stats with base expectation se tiver poucos jogos (ex: < 5) para não distorcer as odds
    const weight = Math.min(1, matchesCount / 5);
    const blendedG = (playerAvgG * weight) + (baseG * (1 - weight));
    const blendedA = (playerAvgA * weight) + (baseA * (1 - weight));
    
    // Multiplicador de 'frequência de gols por jogo' (Society costuma ter uma taxa alta de gols)
    const societyGoalFrequencyMultiplier = oddsConfig?.societyGoalFrequencyMultiplier ?? 2.00;
    const societyAssistFrequencyMultiplier = oddsConfig?.societyAssistFrequencyMultiplier ?? 1.80;

    // Ajuste baseado na força da equipe vs oponente
    const ratio = Math.max(0.6, Math.min(1.4, Math.pow(overall / Math.max(oppAvg, 1), 2)));
    
    // Expected values (Lambda) para Poisson Distribution
    const lambdaG = blendedG * societyGoalFrequencyMultiplier * ratio;
    const lambdaA = blendedA * societyAssistFrequencyMultiplier * ratio;

    // Função de Poisson para probabilidade acumulada P(X > k)
    const poissonGreater = (lambda: number, k: number) => {
      let cumulative = 0;
      let p = Math.exp(-lambda);
      for (let i = 0; i <= k; i++) {
        if (i > 0) p = p * lambda / i;
        cumulative += p;
      }
      return Math.max(0.01, Math.min(0.99, 1 - cumulative)); // limites seguros
    };

    const probG1 = poissonGreater(lambdaG, 0); // +0.5
    const probG2 = poissonGreater(lambdaG, 1); // +1.5
    const probG3 = poissonGreater(lambdaG, 2); // +2.5
    
    const probA1 = poissonGreater(lambdaA, 0); // +0.5
    const probA2 = poissonGreater(lambdaA, 1); // +1.5
    const probA3 = poissonGreater(lambdaA, 2); // +2.5
    
    // Margem dinâmica baseada na probabilidade
    const getDynamicMargin = (p: number) => {
        if (p > 0.8) return oddsConfig?.margins.almostCertain ?? 1.30;
        if (p > 0.5) return oddsConfig?.margins.probable ?? 1.50;
        if (p > 0.3) return oddsConfig?.margins.medium ?? 1.80;
        if (p > 0.1) return oddsConfig?.margins.improbable ?? 2.50;
        return oddsConfig?.margins.veryImprobable ?? 4.00;
    };
    
    const getOdd = (p: number) => {
        const margin = getDynamicMargin(p);
        const odd = 1 / (p * margin);
        
        // Limites estritos para futebol amador (inibir esquemas de apostas com retornos gigantes)
        const maxOdd = oddsConfig?.maxOdd ?? 12.00;
        if (odd < 1.01) return '1.01';
        if (odd > maxOdd) return maxOdd.toFixed(2);
        return odd.toFixed(2);
    };
    
    return {
        g1: getOdd(probG1),
        g2: getOdd(probG2),
        g3: getOdd(probG3),
        a1: getOdd(probA1),
        a2: getOdd(probA2),
        a3: getOdd(probA3),
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
          odd: Number(selectedBet.odd),
          odds: Number(selectedBet.odd),
          amount: betAmt,
          status: 'pending',
          createdAt: new Date().toISOString(),
          matchInfo: selectedBet.matchInfo || 'Azul vs Amarelo',
          selectedOutcome: selectedBet.selectedOutcome || selectedBet.selection
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

  // Filter matches that have at least one betting market enabled
  const activeBettableMatches = matches.filter(match => {
    return match.bettingMarkets?.matchWinner?.enabled || 
           match.bettingMarkets?.playerGoals?.enabled || 
           match.bettingMarkets?.playerAssists?.enabled;
  });

  if (activeBettableMatches.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-3xl p-8 text-center flex flex-col items-center justify-center gap-2 mt-8">
        <Shield className="w-8 h-8 text-gray-300" />
        <p className="text-sm font-bold text-gray-600">Nenhum mercado aberto no momento</p>
        <p className="text-xs text-gray-400">Aguarde o administrador habilitar as apostas para os próximos confrontos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-8">
      <h3 className="text-xl font-black uppercase italic tracking-tight text-primary-blue flex items-center gap-2">
        <TrendingUp className="w-6 h-6 text-primary-yellow" />
        Mercados Abertos
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {activeBettableMatches.map(match => {
          const isWinnerEnabled = match.bettingMarkets?.matchWinner?.enabled;
          const isGoalsEnabled = match.bettingMarkets?.playerGoals?.enabled;
          const isAssistsEnabled = match.bettingMarkets?.playerAssists?.enabled;

          const odds = calculateFloatingOdds(match);

          return (
            <div key={match.id} className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex flex-col gap-6">
              
              {/* Match Header info */}
              <div className="flex justify-between items-center border-b border-gray-50 pb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">Disponível</span>
                </div>
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {match.date} às {match.time}
                </div>
              </div>

              {/* SECTION 1: Match Winner */}
              {isWinnerEnabled && odds && (
                <div className="space-y-3">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-center bg-gray-50 py-2 rounded-xl flex items-center justify-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-primary-yellow" /> Vencedor da Partida
                  </div>
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSelectedBet({ 
                        match, 
                        market: 'matchWinner', 
                        selection: 'teamA', 
                        odd: odds.oddA,
                        matchInfo: 'Azul vs Amarelo',
                        selectedOutcome: 'Vitória Azul (1)'
                      })}
                      className="flex-1 bg-slate-900 text-white rounded-2xl p-3 flex flex-col items-center hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <span className="text-[9px] text-slate-400 uppercase font-black mb-1">Time Azul</span>
                      <span className="text-lg font-black">{odds.oddA}</span>
                    </button>
                    <button 
                      onClick={() => setSelectedBet({ 
                        match, 
                        market: 'matchWinner', 
                        selection: 'draw', 
                        odd: odds.oddDraw,
                        matchInfo: 'Azul vs Amarelo',
                        selectedOutcome: 'Empate (X)'
                      })}
                      className="flex-1 bg-slate-900 text-white rounded-2xl p-3 flex flex-col items-center hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <span className="text-[9px] text-slate-400 uppercase font-black mb-1">Empate</span>
                      <span className="text-lg font-black">{odds.oddDraw}</span>
                    </button>
                    <button 
                      onClick={() => setSelectedBet({ 
                        match, 
                        market: 'matchWinner', 
                        selection: 'teamB', 
                        odd: odds.oddB,
                        matchInfo: 'Azul vs Amarelo',
                        selectedOutcome: 'Vitória Amarelo (2)'
                      })}
                      className="flex-1 bg-slate-900 text-white rounded-2xl p-3 flex flex-col items-center hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <span className="text-[9px] text-slate-400 uppercase font-black mb-1">Time Amarelo</span>
                      <span className="text-lg font-black">{odds.oddB}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* SECTION 2: Player Props */}
              {(isGoalsEnabled || isAssistsEnabled) && (
                <div className="space-y-4 pt-2 border-t border-gray-50">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-center bg-gray-50 py-2 rounded-xl flex items-center justify-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-rose-500" /> Desempenho Individual
                  </div>

                  <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                    {['teamA', 'teamB'].map(teamKey => {
                      const playerIds = teamKey === 'teamA' ? match.teamA : match.teamB;
                      const teamName = teamKey === 'teamA' ? 'Azul' : 'Amarelo';
                      const teamBadgeColor = teamKey === 'teamA' ? 'text-primary-blue bg-blue-50 border-blue-100' : 'text-amber-600 bg-amber-50 border-amber-100';

                      // Opposing team stats
                      const oppIds = teamKey === 'teamA' ? match.teamB : match.teamA;
                      const oppTotal = oppIds.reduce((sum, id) => {
                        const p = players.find(x => x.id === id);
                        return sum + (p ? getPlayerFinalOverall(p, cards) : 75);
                      }, 0);
                      const oppAvg = oppIds.length > 0 ? oppTotal / oppIds.length : 75;

                      const activePlayers = playerIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];

                      if (activePlayers.length === 0) return null;

                      return (
                        <div key={teamKey} className="space-y-2">
                          <div className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border inline-block ${teamBadgeColor}`}>
                            Time {teamName}
                          </div>

                          <div className="space-y-2">
                            {activePlayers.map(player => {
                              const pOdds = calculatePlayerPropOdds(player, oppAvg);
                              return (
                                <div key={player.id} className="flex flex-col sm:flex-row sm:items-center justify-between border border-gray-100 rounded-2xl p-3 bg-slate-50/50 gap-3">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-black text-white ${getPositionColor(player.position)}`}>
                                      {getPositionAbbr(player.position)}
                                    </span>
                                    <span className="text-xs font-bold text-gray-700 uppercase">{player.nickname || player.name}</span>
                                  </div>

                                  <div className="flex flex-col gap-2">
                                    {isGoalsEnabled && (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[8px] font-black text-gray-400 uppercase w-8">Gols</span>
                                        <button 
                                          onClick={() => setSelectedBet({
                                            match,
                                            market: 'playerGoals',
                                            selection: `${player.nickname || player.name} +0.5 Gols`,
                                            odd: pOdds.g1,
                                            matchInfo: `Time ${teamName} - ${player.nickname || player.name}`,
                                            selectedOutcome: `Marcar +0.5 Gols`
                                          })}
                                          className="bg-slate-900 text-white hover:bg-slate-800 rounded-lg px-2 py-1 text-center min-w-[50px] transition-colors cursor-pointer"
                                        >
                                          <div className="text-[7px] text-slate-400 font-bold leading-none mb-0.5">+0.5</div>
                                          <div className="text-xs font-black leading-none">{pOdds.g1}</div>
                                        </button>
                                        <button 
                                          onClick={() => setSelectedBet({
                                            match,
                                            market: 'playerGoals',
                                            selection: `${player.nickname || player.name} +1.5 Gols`,
                                            odd: pOdds.g2,
                                            matchInfo: `Time ${teamName} - ${player.nickname || player.name}`,
                                            selectedOutcome: `Marcar +1.5 Gols`
                                          })}
                                          className="bg-slate-900 text-white hover:bg-slate-800 rounded-lg px-2 py-1 text-center min-w-[50px] transition-colors cursor-pointer"
                                        >
                                          <div className="text-[7px] text-slate-400 font-bold leading-none mb-0.5">+1.5</div>
                                          <div className="text-xs font-black leading-none">{pOdds.g2}</div>
                                        </button>
                                      </div>
                                    )}

                                    {isAssistsEnabled && (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[8px] font-black text-gray-400 uppercase w-8">Assist.</span>
                                        <button 
                                          onClick={() => setSelectedBet({
                                            match,
                                            market: 'playerAssists',
                                            selection: `${player.nickname || player.name} +0.5 Assistências`,
                                            odd: pOdds.a1,
                                            matchInfo: `Time ${teamName} - ${player.nickname || player.name}`,
                                            selectedOutcome: `Dar +0.5 Assistência`
                                          })}
                                          className="bg-slate-900 text-white hover:bg-slate-800 rounded-lg px-2 py-1 text-center min-w-[50px] transition-colors cursor-pointer"
                                        >
                                          <div className="text-[7px] text-slate-400 font-bold leading-none mb-0.5">+0.5</div>
                                          <div className="text-xs font-black leading-none">{pOdds.a1}</div>
                                        </button>
                                        <button 
                                          onClick={() => setSelectedBet({
                                            match,
                                            market: 'playerAssists',
                                            selection: `${player.nickname || player.name} +1.5 Assistências`,
                                            odd: pOdds.a2,
                                            matchInfo: `Time ${teamName} - ${player.nickname || player.name}`,
                                            selectedOutcome: `Dar +1.5 Assistência`
                                          })}
                                          className="bg-slate-900 text-white hover:bg-slate-800 rounded-lg px-2 py-1 text-center min-w-[50px] transition-colors cursor-pointer"
                                        >
                                          <div className="text-[7px] text-slate-400 font-bold leading-none mb-0.5">+1.5</div>
                                          <div className="text-xs font-black leading-none">{pOdds.a2}</div>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          );
        })}
      </div>

      {selectedBet && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-br from-primary-blue to-blue-900 p-6 text-white relative overflow-hidden">
              <h3 className="font-black text-xl">Confirmar Aposta</h3>
              <p className="text-blue-100 text-xs font-semibold mt-1 uppercase tracking-wider">{selectedBet.matchInfo}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Palpite</span>
                  <span className="text-sm font-black text-gray-800">{selectedBet.selectedOutcome}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Odd</span>
                  <span className="text-2xl font-black text-primary-blue">{selectedBet.odd}</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-gray-500">Valor da Aposta (Fixo)</label>
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
                  className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                {balance >= (bettingParams?.maxBetAmount || 1.00) ? (
                  <button 
                    onClick={handlePlaceBet}
                    className="flex-1 bg-emerald-500 text-white font-black py-3 rounded-xl hover:bg-emerald-600 transition-colors cursor-pointer"
                  >
                    Confirmar Aposta
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      setSelectedBet(null);
                      if(onRequestDeposit) onRequestDeposit();
                    }}
                    className="flex-1 bg-amber-500 text-white font-black py-3 rounded-xl hover:bg-amber-600 transition-colors cursor-pointer"
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
