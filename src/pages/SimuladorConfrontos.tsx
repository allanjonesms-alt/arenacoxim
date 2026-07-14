import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, getDocs, doc, getDoc, addDoc, updateDoc, setDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { Player, Location, Match, Card, OddsEngineConfig, AdminData, OddsSimulationHistory } from '../types';
import { MapPin, Swords, ArrowRightLeft, Target, Trophy, Percent, Shield, Zap, CalendarDays, Settings2, Activity, ArrowUp, ArrowDown, Save, History, Wallet, ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { getPositionAbbr, getPositionColor, getPlayerFinalOverall } from '../utils/playerUtils';
import { handleFirestoreError, OperationType } from '../App';

interface Props {
  adminData?: AdminData | null;
}

export default function SimuladorConfrontos({ adminData }: Props) {
  const isMaster = adminData?.role === 'master';
  const navigate = useNavigate();
  const [locations, setLocations] = useState<Location[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  
  const [selectedLocationId, setSelectedLocationId] = useState<string>('all');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  
  const [teamA, setTeamA] = useState<Player[]>([]);
  const [teamB, setTeamB] = useState<Player[]>([]);

  // Simulated betting volume for floating odds
  const [volA, setVolA] = useState<number>(0);
  const [volDraw, setVolDraw] = useState<number>(0);
  const [volB, setVolB] = useState<number>(0);

  const [loading, setLoading] = useState(true);

  const [oddsConfig, setOddsConfig] = useState<OddsEngineConfig | null>(null);
  const [betSettings, setBetSettings] = useState<{ matchWinner?: boolean, playerGoals?: boolean, playerAssists?: boolean }>({});
  const [simulationHistory, setSimulationHistory] = useState<OddsSimulationHistory[]>([]);
  const [isSavingHistory, setIsSavingHistory] = useState(false);


  // Load data
  useEffect(() => {
    const unsubOdds = onSnapshot(doc(db, 'settings', 'oddsEngine'), (snap) => {
      if (snap.exists()) {
        setOddsConfig(snap.data() as OddsEngineConfig);
      } else {
        setOddsConfig(null);
      }
    });

    const unsubBetsSettings = onSnapshot(doc(db, 'settings', 'bets'), (snap) => {
      if (snap.exists()) {
        setBetSettings(snap.data() as any);
      } else {
        setBetSettings({});
      }
    });

    const unsubLocs = onSnapshot(collection(db, 'locations'), (snap) => {
      setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'locations'));

    const unsubPlayers = onSnapshot(collection(db, 'players'), (snap) => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Player)));
      setLoading(false);
    }, err => handleFirestoreError(err, OperationType.LIST, 'players'));

    const unsubCards = onSnapshot(collection(db, 'cards'), (snap) => setCards(snap.docs.map(d => ({ id: d.id, ...d.data() } as Card))));

    const unsubMatches = onSnapshot(collection(db, 'matches'), (snap) => {
      setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'matches'));

    return () => {
      unsubLocs();
      unsubPlayers();
      unsubMatches();
      unsubCards();
      unsubBetsSettings();
      unsubOdds();
    };
  }, []);

  const calculateOdds = (ignoreVolume = false) => {
    if (teamA.length === 0 || teamB.length === 0) return null;

    const getTeamStrength = (team: Player[]) => {
      if (team.length === 0) return 0;
      let totalOverall = 0;
      let totalPointsAvg = 0;

      team.forEach(p => {
        totalOverall += getPlayerFinalOverall(p, cards);
        const matches = p.stats?.matches || 1;
        const pts = p.stats?.points || 0;
        totalPointsAvg += (pts / matches);
      });
      
      const avgOverall = totalOverall / team.length;
      const avgPoints = totalPointsAvg / team.length;
      
      // Points modifier based on player's average score.
      // Average score is typically 0 to 3.
      // Assuming 1.0 is a neutral baseline.
      // E.g., average 3 points = 1.10 (10% boost), average 0 points = 0.90 (10% penalty)
      const pointsModifier = 1 + ((avgPoints - 1.0) * 0.05); 
      
      return avgOverall * pointsModifier;
    };

    const avgA = getTeamStrength(teamA);
    const avgB = getTeamStrength(teamB);

    // Simplistic odds calculation
    const totalAvg = avgA + avgB;
    const baseShareA = avgA / totalAvg;
    const baseShareB = avgB / totalAvg;

    // Amplification Power
    const ampPower = oddsConfig?.matchWinner?.amplificationPower ?? 5;
    const amplifiedA = Math.pow(baseShareA, ampPower);
    const amplifiedB = Math.pow(baseShareB, ampPower);
    const amplifiedTotal = amplifiedA + amplifiedB;

    let shareA = amplifiedA / amplifiedTotal;
    let shareB = amplifiedB / amplifiedTotal;

    const diff = Math.abs(avgA - avgB);
    const drawBaseProb = oddsConfig?.matchWinner?.drawBaseProbability ?? 0.25;
    const drawDiffDenom = oddsConfig?.matchWinner?.drawDiffDenominator ?? 15;
    let drawProb = drawBaseProb * Math.exp(-diff / drawDiffDenom);

    let probA = shareA * (1 - drawProb);
    let probB = shareB * (1 - drawProb);

    // Apply floating odds (market adjustment)
    if (oddsConfig?.floatingOdds?.enabled && !ignoreVolume) {
      const totalVol = volA + volDraw + volB;
      if (totalVol > 0) {
        const liquidityFactor = oddsConfig.floatingOdds.liquidityFactor ?? 1000;
        
        // Market implied probabilities
        const marketProbA = volA / totalVol;
        const marketProbDraw = volDraw / totalVol;
        const marketProbB = volB / totalVol;
        
        // Weight of the market based on liquidity factor
        const marketWeight = totalVol / (totalVol + liquidityFactor);
        const baseWeight = 1 - marketWeight;

        probA = (probA * baseWeight) + (marketProbA * marketWeight);
        drawProb = (drawProb * baseWeight) + (marketProbDraw * marketWeight);
        probB = (probB * baseWeight) + (marketProbB * marketWeight);
        
        // Normalize
        const sum = probA + drawProb + probB;
        probA /= sum;
        drawProb /= sum;
        probB /= sum;
      }
    }

    const margin = oddsConfig?.matchWinner?.margin ?? 1.25;
    
    // Odds = 1 / Probability
    let oddA = 1 / (probA * margin);
    let oddDraw = 1 / (drawProb * margin);
    let oddB = 1 / (probB * margin);

    // Ensure minimum odds 1.01
    oddA = Math.max(1.01, oddA);
    oddDraw = Math.max(1.01, oddDraw);
    oddB = Math.max(1.01, oddB);

    return {
      avgA: avgA.toFixed(2).replace(".", ","),
      avgB: avgB.toFixed(2).replace(".", ","),
      avgANum: avgA,
      avgBNum: avgB,
      probA: (probA * 100).toFixed(1),
      probDraw: (drawProb * 100).toFixed(1),
      probB: (probB * 100).toFixed(1),
      oddA: oddA.toFixed(2),
      oddDraw: oddDraw.toFixed(2),
      oddB: oddB.toFixed(2)
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

    const matches = player.stats?.matches || 0;
    const goals = player.stats?.goals || 0;
    const assists = player.stats?.assists || 0;

    // Média histórica real de Gols e Assistências
    const playerAvgG = matches > 0 ? goals / matches : baseG;
    const playerAvgA = matches > 0 ? assists / matches : baseA;

    // Blend stats with base expectation se tiver poucos jogos (ex: < 5) para não distorcer as odds
    const weight = Math.min(1, matches / 5);
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

  const odds = calculateOdds(false);

  const baseOdds = calculateOdds(true);

  
  
  const handleToggleBetMarket = async (marketName: 'matchWinner' | 'playerGoals' | 'playerAssists') => {
    try {
      const current = betSettings[marketName] || false;
      const ref = doc(db, 'settings', 'bets');
      await setDoc(ref, { [marketName]: !current }, { merge: true });
    } catch (error: any) {
      console.error(error);
      alert("Erro ao atualizar disponibilidade da aposta: " + error.message);
    }
  };
  const handleToggleMatchWinnerMarket = async () => {
    if (!selectedMatch || !odds) {
      alert("Selecione uma partida e aguarde o cálculo das odds.");
      return;
    }
    
    // We will save base odds. Real-time floating odds will be computed dynamically on the public side using real bet volume.
    // However, if the admin adjusted manual volume, maybe they want to start with that?
    // Let's just save the BASE odds (without volume adjustment) so public area has a starting point.
    // Or we just save the current calculated odds.
    const isCurrentlyEnabled = selectedMatch.bettingMarkets?.matchWinner?.enabled;
    const newEnabled = !isCurrentlyEnabled;
    
    try {
      const matchRef = doc(db, 'matches', selectedMatch.id);
      
      const newMarkets = {
        ...(selectedMatch.bettingMarkets || {}),
        matchWinner: {
          enabled: newEnabled,
          baseOddA: baseOdds ? parseFloat(baseOdds.oddA) : parseFloat(odds.oddA),
          baseOddDraw: baseOdds ? parseFloat(baseOdds.oddDraw) : parseFloat(odds.oddDraw),
          baseOddB: baseOdds ? parseFloat(baseOdds.oddB) : parseFloat(odds.oddB)
        }
      };
      
      await updateDoc(matchRef, { bettingMarkets: newMarkets });
      
      alert(newEnabled ? 'Mercado Vencedor da Partida habilitado para o público!' : 'Mercado Vencedor da Partida desabilitado.');
      
      // Update local state to reflect change immediately
      setSelectedMatch({...selectedMatch, bettingMarkets: newMarkets});
      
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar disponibilidade da aposta.");
    }
  };
  const handleSaveSimulation = async () => {
    if (!odds || !adminData) return;
    setIsSavingHistory(true);
    try {
      await addDoc(collection(db, 'odds_simulation_history'), {
        timestamp: new Date().toISOString(),
        adminId: adminData.email || 'unknown',
        adminName: adminData.name || 'Admin',
        matchId: 'Avulso',
        teamAPower: odds.avgA,
        teamBPower: odds.avgB,
        volA,
        volDraw,
        volB,
        oddA: odds.oddA,
        oddDraw: odds.oddDraw,
        oddB: odds.oddB
      });
      alert('Simulação registrada no histórico!');
    } catch (error) {
      console.error("Error saving simulation:", error);
      alert('Erro ao registrar simulação.');
    } finally {
      setIsSavingHistory(false);
    }
  };

  const renderTrendIndicator =  (currentVal: string | undefined, baseVal: string | undefined) => {
    if (!currentVal || !baseVal) return null;
    const cur = parseFloat(currentVal);
    const bas = parseFloat(baseVal);
    
    const totalVol = volA + volDraw + volB;
    if (totalVol === 0 || Math.abs(cur - bas) < 0.005) {
      return null;
    }

    const diff = cur - bas;
    const isUp = diff > 0.005;
    const isDown = diff < -0.005;
    
    if (!isUp && !isDown) return null;

    return (
      <div className={`flex items-center justify-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full mt-1.5 ${
        isUp ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
      }`}>
        {isUp ? (
          <ArrowUp className="w-2.5 h-2.5 stroke-[3]" />
        ) : (
          <ArrowDown className="w-2.5 h-2.5 stroke-[3]" />
        )}
        <span>{isUp ? '+' : ''}{diff.toFixed(2)}</span>
      </div>
    );
  };

  const filteredMatches = matches
    .filter(m => selectedLocationId === 'all' || m.locationId === selectedLocationId)
    .sort((a, b) => new Date(`${b.date}T${b.time || '00:00'}`).getTime() - new Date(`${a.date}T${a.time || '00:00'}`).getTime());

  const handleSelectMatch = (match: Match) => {
    setSelectedMatch(match);
    const tA = match.teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
    const tB = match.teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
    setTeamA(tA);
    setTeamB(tB);
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-blue"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {isMaster && (
        <div className="bg-gradient-to-br from-gray-900 to-black rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden border border-white/10 mb-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-yellow/10 rounded-full blur-3xl -mt-20 -mr-20" />
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <h2 className="text-2xl font-black uppercase tracking-tight italic flex items-center justify-center md:justify-start gap-3">
                <Wallet className="w-7 h-7 text-primary-yellow" />
                Banco do Sistema
              </h2>
              <p className="text-gray-400 text-sm font-semibold max-w-md">
                Acesso exclusivo Master para gerenciamento global de saldos, aprovação de saques e fluxo de caixa das apostas.
              </p>
            </div>
            <button onClick={() => navigate('/admin/banco')} className="bg-primary-yellow text-primary-blue px-8 py-3.5 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-yellow-400 transition-all shadow-[0_0_20px_rgba(249,212,35,0.3)] hover:shadow-[0_0_30px_rgba(249,212,35,0.5)] active:scale-95 flex items-center gap-2">
              Acessar Banco <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-primary-blue rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter flex items-center gap-3">
              <Swords className="w-8 h-8 text-primary-yellow" />
              Simulador de Confrontos
            </h1>
            <p className="text-white/80 text-sm font-medium max-w-lg">
              Escale duas equipes virtuais com atletas reais e calcule as probabilidades e as cotações (odds) de apostas esportivas para a partida simulada.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {adminData?.role === 'master' && (
              <Link to="/admin/odds-engine" className="bg-white/10 hover:bg-white/20 transition-colors p-2.5 rounded-2xl flex items-center justify-center gap-2 border border-white/20 backdrop-blur-md text-white font-bold text-sm uppercase">
                <Settings2 className="w-4 h-4 text-primary-yellow" />
                Motor de Odds
              </Link>
            )}
            <div className="bg-white/10 p-1.5 rounded-2xl flex items-center gap-2 border border-white/20 backdrop-blur-md">
              <MapPin className="w-5 h-5 text-primary-yellow ml-3" />
              <select
                value={selectedLocationId}
                onChange={(e) => {
                  setSelectedLocationId(e.target.value);
                  setTeamA([]);
                  setTeamB([]);
                }}
                className="bg-transparent text-white font-bold text-sm uppercase outline-none cursor-pointer py-2 pr-4 border-none appearance-none"
              >
                <option value="all" className="text-gray-900">Todas as Sedes</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id} className="text-gray-900">
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Match Selector */}
      {filteredMatches.length > 0 && (
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary-blue"></div>
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-900 mb-4 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary-blue" />
            Carregar Partida
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">
            {filteredMatches.map(match => {
              const loc = locations.find(l => l.id === match.locationId);
              const dateObj = new Date(`${match.date}T${match.time || '00:00'}`);
              const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
              
              return (
                <button
                  key={match.id}
                  onClick={() => handleSelectMatch(match)}
                  className="snap-start flex-shrink-0 flex flex-col items-start gap-2 bg-slate-50 border border-slate-200 p-4 rounded-2xl hover:border-primary-blue hover:shadow-md transition-all text-left min-w-[200px]"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-black uppercase text-gray-400 bg-gray-200 px-2 py-0.5 rounded-md">
                      {dateStr}
                    </span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                      match.status === 'finished' ? 'bg-emerald-100 text-emerald-700' :
                      match.status === 'live' ? 'bg-red-100 text-red-700 animate-pulse' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {match.status === 'finished' ? 'Fim' : match.status === 'live' ? 'Ao Vivo' : 'Agendado'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 w-full">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-bold text-gray-700 uppercase truncate">
                      {loc?.name || 'Local'}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase mt-1">
                    {match.teamA.length + match.teamB.length} Jogadores Escaldos
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Teams Section */}
        <div className="lg:col-span-12 space-y-6">
          
          {/* Simulation Dashboard */}
          {odds && (
            <div className="bg-white rounded-[2rem] border border-gray-100 p-6 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary-blue via-emerald-500 to-amber-500"></div>
              
              <div className="flex justify-between items-center mb-6">
                <div></div>
                <h3 className="text-center text-xs font-black uppercase tracking-[0.2em] text-gray-400">Projeção de Apostas</h3>
                <button 
                  onClick={() => handleToggleBetMarket('matchWinner')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${
                    betSettings.matchWinner
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {betSettings.matchWinner ? <><Zap className="w-3 h-3" /> Público (ON)</> : <><Shield className="w-3 h-3" /> Público (OFF)</>}
                </button>
              </div>
              
              <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                
                {/* Team A */}
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-16 h-16 rounded-2xl bg-blue-50 border-2 border-primary-blue/20 flex items-center justify-center mb-3">
                    <Shield className="w-8 h-8 text-primary-blue" />
                  </div>
                  <h4 className="text-lg font-black uppercase tracking-tighter text-gray-900">Azul</h4>
                  <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full mt-2">Power: <span className="text-primary-blue">{odds.avgA}</span></span>
                </div>

                {/* Odds Cards */}
                <div className="flex-shrink-0 flex flex-col items-center">
                   <div className="flex items-center gap-4 bg-slate-900 p-4 rounded-3xl shadow-xl border border-slate-800">
                      
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Vitória Azul (1)</span>
                        <div className="bg-slate-800 text-white font-black text-2xl px-4 py-2 rounded-xl border border-slate-700 min-w-[80px] text-center">
                          {odds.oddA}
                        </div>
                        <span className="text-[9px] text-emerald-400 font-black mt-1">{odds.probA}%</span>
                        {renderTrendIndicator(odds.oddA, baseOdds?.oddA)}
                      </div>

                      <div className="flex flex-col items-center border-x border-slate-800 px-4">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Empate (X)</span>
                        <div className="bg-slate-800 text-white font-black text-2xl px-4 py-2 rounded-xl border border-slate-700 min-w-[80px] text-center">
                          {odds.oddDraw}
                        </div>
                        <span className="text-[9px] text-yellow-500 font-black mt-1">{odds.probDraw}%</span>
                        {renderTrendIndicator(odds.oddDraw, baseOdds?.oddDraw)}
                      </div>

                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Vitória Amarelo (2)</span>
                        <div className="bg-slate-800 text-white font-black text-2xl px-4 py-2 rounded-xl border border-slate-700 min-w-[80px] text-center">
                          {odds.oddB}
                        </div>
                        <span className="text-[9px] text-amber-500 font-black mt-1">{odds.probB}%</span>
                        {renderTrendIndicator(odds.oddB, baseOdds?.oddB)}
                      </div>
                   </div>
                   
                   

                   {/* Simulação de Volume de Apostas */}
                   {oddsConfig?.floatingOdds?.enabled && (
                     <div className="mt-4 w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm">
                       <p className="text-[10px] font-black uppercase text-purple-600 mb-3 text-center tracking-widest flex items-center justify-center gap-1.5">
                         <Activity className="w-3.5 h-3.5" /> Simular Ajuste Flutuante (Vol. R$)
                       </p>
                       <div className="flex flex-col gap-3">
                         <div className="flex gap-2 justify-between">
                           <div className="flex flex-col flex-1">
                             <span className="text-[9px] text-gray-500 font-bold mb-1 uppercase text-center">Azul</span>
                             <input type="number" min="0" step="50" value={volA || ''} onChange={(e) => setVolA(Number(e.target.value) || 0)} placeholder="0" className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs text-center font-bold outline-none focus:ring-2 focus:ring-primary-blue transition-all" />
                           </div>
                           <div className="flex flex-col flex-1">
                             <span className="text-[9px] text-gray-500 font-bold mb-1 uppercase text-center">Empate</span>
                             <input type="number" min="0" step="50" value={volDraw || ''} onChange={(e) => setVolDraw(Number(e.target.value) || 0)} placeholder="0" className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs text-center font-bold outline-none focus:ring-2 focus:ring-primary-blue transition-all" />
                           </div>
                           <div className="flex flex-col flex-1">
                             <span className="text-[9px] text-gray-500 font-bold mb-1 uppercase text-center">Amarelo</span>
                             <input type="number" min="0" step="50" value={volB || ''} onChange={(e) => setVolB(Number(e.target.value) || 0)} placeholder="0" className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs text-center font-bold outline-none focus:ring-2 focus:ring-primary-blue transition-all" />
                           </div>
                         </div>
                         {(volA > 0 || volDraw > 0 || volB > 0) && (
                           <div className="flex justify-center gap-2">                             <button                                onClick={() => { setVolA(0); setVolDraw(0); setVolB(0); }}                               className="text-[10px] bg-gray-200 hover:bg-gray-300 transition-colors text-gray-700 font-bold py-1.5 px-4 rounded-lg"                             >                               Zerar Mercado                             </button>                             <button                                onClick={handleSaveSimulation}                               disabled={isSavingHistory}                               className="text-[10px] bg-purple-100 hover:bg-purple-200 transition-colors text-purple-700 font-bold py-1.5 px-4 rounded-lg flex items-center gap-1 disabled:opacity-50"                             >                               <Save className="w-3 h-3" />                               Registrar                             </button>                           </div>
                         )}
                       </div>
                     </div>
                   )}
                </div>

                {/* Team B */}
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-16 h-16 rounded-2xl bg-amber-50 border-2 border-amber-500/20 flex items-center justify-center mb-3">
                    <Shield className="w-8 h-8 text-amber-500" />
                  </div>
                  <h4 className="text-lg font-black uppercase tracking-tighter text-gray-900">Amarelo</h4>
                  <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full mt-2">Power: <span className="text-amber-600">{odds.avgB}</span></span>
                </div>
              </div>
            </div>
          )}

          {/* Roster Section */}
          <div className="flex justify-between items-center bg-white rounded-t-3xl p-6 pb-0 border-x border-t border-gray-100 mt-0">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-600">Desempenho Individual</h3>
            <div className="flex gap-2">
              <button 
                onClick={() => handleToggleBetMarket('playerGoals')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${
                  betSettings.playerGoals
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Gols: {betSettings.playerGoals ? 'ON' : 'OFF'}
              </button>
              <button 
                onClick={() => handleToggleBetMarket('playerAssists')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${
                  betSettings.playerAssists
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Assistências: {betSettings.playerAssists ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
          <div className="bg-white rounded-b-3xl p-6 border-x border-b border-gray-100 shadow-sm flex flex-col md:flex-row gap-6">
            {/* Equipe A */}
            <div className="flex-1 bg-slate-50 rounded-2xl p-4 border border-slate-100">
               <h3 className="text-sm font-black uppercase tracking-widest text-primary-blue mb-4 border-b border-slate-200 pb-2 flex justify-between">
                 Azul 
                 <span className="bg-primary-blue text-white px-2 py-0.5 rounded-md text-[10px]">{teamA.length}</span>
               </h3>
               {teamA.length === 0 ? (
                 <p className="text-xs text-gray-400 italic text-center py-8">Nenhum jogador selecionado.</p>
               ) : (
                 <div className="space-y-3">
                   {teamA.map(p => {
                     const pOdds = odds ? calculatePlayerPropOdds(p, odds.avgBNum) : null;
                     return (
                     <div key={p.id} className="flex flex-col bg-white p-3 rounded-xl border border-gray-100 shadow-sm gap-3">
                       <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                           <span className={`w-6 h-6 rounded flex items-center justify-center text-[9px] font-black text-white ${getPositionColor(p.position)}`}>
                             {getPositionAbbr(p.position)}
                           </span>
                           <span className="text-xs font-bold text-gray-700 uppercase">{p.nickname || p.name}</span>
                         </div>
                         <div className="flex items-center gap-2">
                           <span className="text-xs font-black text-primary-blue">{getPlayerFinalOverall(p, cards)}</span>
                         </div>
                       </div>
                       
                       {pOdds && (
                         <div className="bg-slate-50 rounded-lg p-2 border border-slate-100 flex flex-col gap-2">
                           <div className="flex items-center justify-between">
                             <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Gols</span>
                             <div className="flex gap-1.5">
                               <div className="flex flex-col items-center"><span className="text-[8px] text-gray-400 font-bold mb-0.5">+0.5</span><span className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-black text-gray-700">{pOdds.g1}</span></div>
                               <div className="flex flex-col items-center"><span className="text-[8px] text-gray-400 font-bold mb-0.5">+1.5</span><span className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-black text-gray-700">{pOdds.g2}</span></div>
                               <div className="flex flex-col items-center"><span className="text-[8px] text-gray-400 font-bold mb-0.5">+2.5</span><span className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-black text-gray-700">{pOdds.g3}</span></div>
                             </div>
                           </div>
                           <div className="w-full h-px bg-gray-200"></div>
                           <div className="flex items-center justify-between">
                             <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Assist.</span>
                             <div className="flex gap-1.5">
                               <div className="flex flex-col items-center"><span className="text-[8px] text-gray-400 font-bold mb-0.5">+0.5</span><span className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-black text-gray-700">{pOdds.a1}</span></div>
                               <div className="flex flex-col items-center"><span className="text-[8px] text-gray-400 font-bold mb-0.5">+1.5</span><span className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-black text-gray-700">{pOdds.a2}</span></div>
                               <div className="flex flex-col items-center"><span className="text-[8px] text-gray-400 font-bold mb-0.5">+2.5</span><span className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-black text-gray-700">{pOdds.a3}</span></div>
                             </div>
                           </div>
                         </div>
                       )}
                     </div>
                     );
                   })}
                 </div>
               )}
            </div>

            {/* Equipe B */}
            <div className="flex-1 bg-slate-50 rounded-2xl p-4 border border-slate-100">
               <h3 className="text-sm font-black uppercase tracking-widest text-amber-600 mb-4 border-b border-slate-200 pb-2 flex justify-between">
                 Amarelo 
                 <span className="bg-amber-500 text-white px-2 py-0.5 rounded-md text-[10px]">{teamB.length}</span>
               </h3>
               {teamB.length === 0 ? (
                 <p className="text-xs text-gray-400 italic text-center py-8">Nenhum jogador selecionado.</p>
               ) : (
                 <div className="space-y-3">
                   {teamB.map(p => {
                     const pOdds = odds ? calculatePlayerPropOdds(p, odds.avgANum) : null;
                     return (
                     <div key={p.id} className="flex flex-col bg-white p-3 rounded-xl border border-gray-100 shadow-sm gap-3">
                       <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                           <span className={`w-6 h-6 rounded flex items-center justify-center text-[9px] font-black text-white ${getPositionColor(p.position)}`}>
                             {getPositionAbbr(p.position)}
                           </span>
                           <span className="text-xs font-bold text-gray-700 uppercase">{p.nickname || p.name}</span>
                         </div>
                         <div className="flex items-center gap-2">
                           <span className="text-xs font-black text-amber-600">{getPlayerFinalOverall(p, cards)}</span>
                         </div>
                       </div>
                       
                       {pOdds && (
                         <div className="bg-slate-50 rounded-lg p-2 border border-slate-100 flex flex-col gap-2">
                           <div className="flex items-center justify-between">
                             <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Gols</span>
                             <div className="flex gap-1.5">
                               <div className="flex flex-col items-center"><span className="text-[8px] text-gray-400 font-bold mb-0.5">+0.5</span><span className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-black text-gray-700">{pOdds.g1}</span></div>
                               <div className="flex flex-col items-center"><span className="text-[8px] text-gray-400 font-bold mb-0.5">+1.5</span><span className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-black text-gray-700">{pOdds.g2}</span></div>
                               <div className="flex flex-col items-center"><span className="text-[8px] text-gray-400 font-bold mb-0.5">+2.5</span><span className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-black text-gray-700">{pOdds.g3}</span></div>
                             </div>
                           </div>
                           <div className="w-full h-px bg-gray-200"></div>
                           <div className="flex items-center justify-between">
                             <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Assist.</span>
                             <div className="flex gap-1.5">
                               <div className="flex flex-col items-center"><span className="text-[8px] text-gray-400 font-bold mb-0.5">+0.5</span><span className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-black text-gray-700">{pOdds.a1}</span></div>
                               <div className="flex flex-col items-center"><span className="text-[8px] text-gray-400 font-bold mb-0.5">+1.5</span><span className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-black text-gray-700">{pOdds.a2}</span></div>
                               <div className="flex flex-col items-center"><span className="text-[8px] text-gray-400 font-bold mb-0.5">+2.5</span><span className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded font-black text-gray-700">{pOdds.a3}</span></div>
                             </div>
                           </div>
                         </div>
                       )}
                     </div>
                     );
                   })}
                 </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
