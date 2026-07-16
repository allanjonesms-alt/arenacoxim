import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, getDocs, doc, getDoc, addDoc, updateDoc, setDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { Player, Location, Match, Card, OddsEngineConfig, AdminData, OddsSimulationHistory } from '../types';
import { MapPin, Swords, ArrowRightLeft, Target, Trophy, Percent, Shield, Zap, CalendarDays, Settings2, Activity, ArrowUp, ArrowDown, Save, History, Wallet, ArrowUpRight, Search } from 'lucide-react';
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
  const [betSettings, setBetSettings] = useState<any>({});
  const [simulationHistory, setSimulationHistory] = useState<OddsSimulationHistory[]>([]);
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const [longTermSearch, setLongTermSearch] = useState('');
  const [activeBetTab, setActiveBetTab] = useState<'linha' | 'goleiro'>('linha');


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
    const isCurrentlyEnabled = selectedMatch.bettingMarkets?.matchWinner?.enabled || false;
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

  const handleTogglePlayerGoalsMarket = async () => {
    if (!selectedMatch) {
      alert("Selecione uma partida.");
      return;
    }
    const isCurrentlyEnabled = selectedMatch.bettingMarkets?.playerGoals?.enabled || false;
    const newEnabled = !isCurrentlyEnabled;
    try {
      const matchRef = doc(db, 'matches', selectedMatch.id);
      const newMarkets = {
        ...(selectedMatch.bettingMarkets || {}),
        playerGoals: {
          enabled: newEnabled
        }
      };
      await updateDoc(matchRef, { bettingMarkets: newMarkets });
      alert(newEnabled ? 'Mercado de Gols habilitado para esta partida!' : 'Mercado de Gols desabilitado para esta partida.');
      setSelectedMatch({...selectedMatch, bettingMarkets: newMarkets});
    } catch (err: any) {
      console.error(err);
      alert("Erro ao atualizar mercado de gols: " + err.message);
    }
  };

  const handleTogglePlayerAssistsMarket = async () => {
    if (!selectedMatch) {
      alert("Selecione uma partida.");
      return;
    }
    const isCurrentlyEnabled = selectedMatch.bettingMarkets?.playerAssists?.enabled || false;
    const newEnabled = !isCurrentlyEnabled;
    try {
      const matchRef = doc(db, 'matches', selectedMatch.id);
      const newMarkets = {
        ...(selectedMatch.bettingMarkets || {}),
        playerAssists: {
          enabled: newEnabled
        }
      };
      await updateDoc(matchRef, { bettingMarkets: newMarkets });
      alert(newEnabled ? 'Mercado de Assistências habilitado para esta partida!' : 'Mercado de Assistências desabilitado para esta partida.');
      setSelectedMatch({...selectedMatch, bettingMarkets: newMarkets});
    } catch (err: any) {
      console.error(err);
      alert("Erro ao atualizar mercado de assistências: " + err.message);
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
    .sort((a, b) => {
      const timeA = a.createdAt || new Date(`${a.date}T${a.time || '00:00'}`).getTime() || 0;
      const timeB = b.createdAt || new Date(`${b.date}T${b.time || '00:00'}`).getTime() || 0;
      return timeB - timeA;
    })
    .slice(0, 6);

  const MONTH_NAMES_PT: { [key: string]: string } = {
    '01': 'Janeiro',
    '02': 'Fevereiro',
    '03': 'Março',
    '04': 'Abril',
    '05': 'Maio',
    '06': 'Junho',
    '07': 'Julho',
    '08': 'Agosto',
    '09': 'Setembro',
    '10': 'Outubro',
    '11': 'Novembro',
    '12': 'Dezembro'
  };

  const getMonthlyGoalsData = () => {
    const data: { [playerId: string]: { [monthKey: string]: number } } = {};
    const finishedMatches = matches.filter(m => m.status === 'finished');
    
    players.forEach(p => {
      data[p.id] = {};
    });

    finishedMatches.forEach(match => {
      if (!match.date || !match.events) return;
      const monthKey = match.date.substring(0, 7);
      
      match.events.forEach(event => {
        if (event.type === 'goal' && event.playerId) {
          if (!data[event.playerId]) {
            data[event.playerId] = {};
          }
          data[event.playerId][monthKey] = (data[event.playerId][monthKey] || 0) + 1;
        }
      });
    });

    return data;
  };

  const getMonthlyConcededData = () => {
    const data: { [playerId: string]: { [monthKey: string]: number } } = {};
    const finishedMatches = matches.filter(m => m.status === 'finished');
    
    players.forEach(p => {
      data[p.id] = {};
    });

    finishedMatches.forEach(match => {
      if (!match.date) return;
      const monthKey = match.date.substring(0, 7);
      
      if (match.goalkeeperAId) {
        if (!data[match.goalkeeperAId]) data[match.goalkeeperAId] = {};
        data[match.goalkeeperAId][monthKey] = (data[match.goalkeeperAId][monthKey] || 0) + (match.scoreB || 0);
      }
      if (match.goalkeeperBId) {
        if (!data[match.goalkeeperBId]) data[match.goalkeeperBId] = {};
        data[match.goalkeeperBId][monthKey] = (data[match.goalkeeperBId][monthKey] || 0) + (match.scoreA || 0);
      }
    });

    return data;
  };

  const getRemainingMatchesInMonth = (isGoalkeeper: boolean) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-indexed
    const currentDay = today.getDate();
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    let matchesLeft = 0;
    // Loop from today to the last day of the month
    for (let d = currentDay; d <= lastDayOfMonth; d++) {
      const tempDate = new Date(currentYear, currentMonth, d);
      const dayOfWeek = tempDate.getDay();
      if (dayOfWeek === 2 || dayOfWeek === 4) { // Tuesday (2) or Thursday (4)
        matchesLeft++;
      }
    }

    return isGoalkeeper ? matchesLeft * 2 : matchesLeft;
  };

  const getActiveMonths = () => {
    const monthsSet = new Set<string>();
    const finishedMatches = matches.filter(m => m.status === 'finished');
    
    finishedMatches.forEach(match => {
      if (match.date) {
        const monthKey = match.date.substring(0, 7);
        monthsSet.add(monthKey);
      }
    });

    const todayStr = new Date().toISOString().substring(0, 7);
    monthsSet.add(todayStr);

    return Array.from(monthsSet).sort();
  };

  const playerMonthlyGoals = getMonthlyGoalsData();
  const playerMonthlyConceded = getMonthlyConcededData();
  const activeMonths = getActiveMonths();

  const calculateLongTermOdds = (player: Player) => {
    const currentDateObj = new Date();
    const currentMonthKey = currentDateObj.toISOString().substring(0, 7); // e.g. "2026-07"
    
    // Career statistics
    const careerMatchesCount = player.stats?.matches || 0;
    const careerAvgPerMatch = careerMatchesCount > 0 ? ((player.stats?.goals || 0) / careerMatchesCount) : 0;
    
    // Position-based average goals per match expectation
    let positionBasePerMatch = 0.30;
    if (player.position === 'centroavante') positionBasePerMatch = 0.60;
    else if (player.position === 'meio-campo') positionBasePerMatch = 0.40;
    else if (player.position === 'lateral') positionBasePerMatch = 0.20;
    else if (player.position === 'zagueiro') positionBasePerMatch = 0.10;
    else if (player.position === 'goleiro') positionBasePerMatch = 0.01;

    // Credibility weighting (blend career stats with position baselines)
    const weight = Math.min(1.0, careerMatchesCount / 25);
    const blendedGoalsPerMatch = (careerAvgPerMatch * weight) + (positionBasePerMatch * (1 - weight));

    // Current goals scored in this month so far
    const C = playerMonthlyGoals[player.id]?.[currentMonthKey] || 0;

    // Count finished matches played by this specific player in the current month
    const finishedMatchesThisMonth = matches.filter(m => m.status === 'finished' && m.date?.substring(0, 7) === currentMonthKey);
    const playedThisMonth = finishedMatchesThisMonth.filter(m => m.teamA.includes(player.id) || m.teamB.includes(player.id)).length;

    // Current month form (shrinkage estimator blending career blendedGoalsPerMatch and current month average)
    let projectedGoalsPerMatch = blendedGoalsPerMatch;
    if (playedThisMonth > 0) {
      const currentMonthAvg = C / playedThisMonth;
      const formWeight = Math.min(0.40, playedThisMonth / 10); // up to 40% weight to current month form
      projectedGoalsPerMatch = (currentMonthAvg * formWeight) + (blendedGoalsPerMatch * (1 - formWeight));
    }

    // Remaining matches of the month
    const remainingMatches = getRemainingMatchesInMonth(false);
    const ExpectedRemaining = projectedGoalsPerMatch * remainingMatches;
    const ExpectedTotal = C + ExpectedRemaining;

    // Custom Over/Under Line
    const L = Math.max(C + 0.5, Math.floor(ExpectedTotal) + 0.5);

    // Poisson Distribution P(X > k)
    const targetRemaining = L - C; // Ends in 0.5 (e.g. 2.5)
    const k = Math.floor(targetRemaining);

    const poissonGreater = (lambda: number, limitVal: number) => {
      if (limitVal < 0) return 0.99;
      let cumulative = 0;
      let p = Math.exp(-lambda);
      for (let i = 0; i <= limitVal; i++) {
        if (i > 0) p = p * lambda / i;
        cumulative += p;
      }
      return Math.max(0.01, Math.min(0.99, 1 - cumulative));
    };

    const probOverRaw = poissonGreater(ExpectedRemaining, k);
    const probUnderRaw = Math.max(0.01, 1 - probOverRaw);

    // Suavização para evitar odds extremamente desreguladas (ex: 4.01 vs 1.11)
    const smoothingWeight = 0.50; 
    const probOver = probOverRaw * smoothingWeight + (1 - smoothingWeight) * 0.5;
    const probUnder = probUnderRaw * smoothingWeight + (1 - smoothingWeight) * 0.5;

    // 15% sportsbook margin
    const margin = 1.15;
    const rawOddOver = 1 / (probOver * margin);
    const rawOddUnder = 1 / (probUnder * margin);

    const maxLtOdd = oddsConfig?.maxOdd ?? 12.00;
    const formatLtOdd = (odd: number) => {
      if (odd < 1.05) return '1.05';
      if (odd > maxLtOdd) return maxLtOdd.toFixed(2);
      return odd.toFixed(2);
    };

    // To display monthly projection baseline in the UI
    const totalGamesInMonth = playedThisMonth + remainingMatches;
    const blendedMonthlyAvg = projectedGoalsPerMatch * (totalGamesInMonth || 8);

    return {
      currentGoals: C,
      line: L,
      oddOver: formatLtOdd(rawOddOver),
      oddUnder: formatLtOdd(rawOddUnder),
      probOver: (probOver * 100).toFixed(1),
      probUnder: (probUnder * 100).toFixed(1),
      blendedMonthlyAvg,
      expectedRemaining: ExpectedRemaining
    };
  };

  const calculateLongTermConcededOdds = (player: Player) => {
    const currentDateObj = new Date();
    const currentMonthKey = currentDateObj.toISOString().substring(0, 7); // e.g. "2026-07"
    
    // Career conceded statistics from finished matches
    const finishedMatches = matches.filter(m => m.status === 'finished');
    let goalkeeperCareerConceded = 0;
    let goalkeeperCareerMatches = 0;

    finishedMatches.forEach(match => {
      if (match.goalkeeperAId === player.id) {
        goalkeeperCareerConceded += match.scoreB || 0;
        goalkeeperCareerMatches++;
      } else if (match.goalkeeperBId === player.id) {
        goalkeeperCareerConceded += match.scoreA || 0;
        goalkeeperCareerMatches++;
      }
    });

    const gkMatchesCount = goalkeeperCareerMatches > 0 ? goalkeeperCareerMatches : (player.stats?.matches || 0);
    const careerConcededAvgPerMatch = gkMatchesCount > 0 
      ? (goalkeeperCareerConceded / gkMatchesCount) 
      : 2.0; // default expectation of 2 goals per match

    // Baseline conceded average per match
    const positionBaseConcededPerMatch = 2.0;

    // Blended average per match (credibility weighting)
    const gkWeight = Math.min(1.0, gkMatchesCount / 20);
    const blendedConcededPerMatch = (careerConcededAvgPerMatch * gkWeight) + (positionBaseConcededPerMatch * (1 - gkWeight));

    // Current goals conceded in this month so far
    const C = playerMonthlyConceded[player.id]?.[currentMonthKey] || 0;

    // Count finished matches played by this goalkeeper in the current month
    const finishedMatchesThisMonth = finishedMatches.filter(m => m.date?.substring(0, 7) === currentMonthKey);
    const playedThisMonth = finishedMatchesThisMonth.filter(m => m.goalkeeperAId === player.id || m.goalkeeperBId === player.id).length;

    // Current month form (shrinkage estimator blending career blendedConcededPerMatch and current month average conceded)
    let projectedConcededPerMatch = blendedConcededPerMatch;
    if (playedThisMonth > 0) {
      const currentMonthAvg = C / playedThisMonth;
      const formWeight = Math.min(0.40, playedThisMonth / 10); // up to 40% weight to current month form
      projectedConcededPerMatch = (currentMonthAvg * formWeight) + (blendedConcededPerMatch * (1 - formWeight));
    }

    // Remaining matches of the month for Goalkeepers (10 matches)
    const remainingGKMatches = getRemainingMatchesInMonth(true);
    const ExpectedRemaining = projectedConcededPerMatch * remainingGKMatches;
    const ExpectedTotal = C + ExpectedRemaining;

    // Custom Over/Under Line
    const L = Math.max(C + 0.5, Math.floor(ExpectedTotal) + 0.5);

    // Poisson Distribution P(X > k)
    const targetRemaining = L - C; // Ends in 0.5 (e.g. 2.5)
    const k = Math.floor(targetRemaining);

    const poissonGreater = (lambda: number, limitVal: number) => {
      if (limitVal < 0) return 0.99;
      let cumulative = 0;
      let p = Math.exp(-lambda);
      for (let i = 0; i <= limitVal; i++) {
        if (i > 0) p = p * lambda / i;
        cumulative += p;
      }
      return Math.max(0.01, Math.min(0.99, 1 - cumulative));
    };

    const probOverRaw = poissonGreater(ExpectedRemaining, k);
    const probUnderRaw = Math.max(0.01, 1 - probOverRaw);

    // Suavização para evitar odds extremamente desreguladas (ex: 4.01 vs 1.11)
    const smoothingWeight = 0.50; 
    const probOver = probOverRaw * smoothingWeight + (1 - smoothingWeight) * 0.5;
    const probUnder = probUnderRaw * smoothingWeight + (1 - smoothingWeight) * 0.5;

    // 15% sportsbook margin
    const margin = 1.15;
    const rawOddOver = 1 / (probOver * margin);
    const rawOddUnder = 1 / (probUnder * margin);

    const maxLtOdd = oddsConfig?.maxOdd ?? 12.00;
    const formatLtOdd = (odd: number) => {
      if (odd < 1.05) return '1.05';
      if (odd > maxLtOdd) return maxLtOdd.toFixed(2);
      return odd.toFixed(2);
    };

    const totalGKGamesInMonth = playedThisMonth + remainingGKMatches;
    const blendedMonthlyAvg = projectedConcededPerMatch * (totalGKGamesInMonth || 10);

    return {
      currentGoals: C,
      line: L,
      oddOver: formatLtOdd(rawOddOver),
      oddUnder: formatLtOdd(rawOddUnder),
      probOver: (probOver * 100).toFixed(1),
      probUnder: (probUnder * 100).toFixed(1),
      blendedMonthlyAvg,
      expectedRemaining: ExpectedRemaining
    };
  };

  const handleToggleLongTermMarket = async () => {
    try {
      const current = betSettings.longTermMonthlyGoals?.enabled || false;
      const ref = doc(db, 'settings', 'bets');
      await setDoc(ref, { 
        longTermMonthlyGoals: { 
          enabled: !current 
        } 
      }, { merge: true });
      alert(!current ? 'Mercado de Longo Prazo habilitado para o público!' : 'Mercado de Longo Prazo desabilitado.');
    } catch (error: any) {
      console.error(error);
      alert("Erro ao atualizar o mercado de longo prazo: " + error.message);
    }
  };

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
                  onClick={handleToggleMatchWinnerMarket}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${
                    selectedMatch?.bettingMarkets?.matchWinner?.enabled
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {selectedMatch?.bettingMarkets?.matchWinner?.enabled ? <><Zap className="w-3 h-3" /> Público (ON)</> : <><Shield className="w-3 h-3" /> Público (OFF)</>}
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
                onClick={handleTogglePlayerGoalsMarket}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${
                  selectedMatch?.bettingMarkets?.playerGoals?.enabled
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Gols: {selectedMatch?.bettingMarkets?.playerGoals?.enabled ? 'ON' : 'OFF'}
              </button>
              <button 
                onClick={handleTogglePlayerAssistsMarket}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${
                  selectedMatch?.bettingMarkets?.playerAssists?.enabled
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Assistências: {selectedMatch?.bettingMarkets?.playerAssists?.enabled ? 'ON' : 'OFF'}
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

          {/* SEÇÃO APONTAMENTOS DE LONGO PRAZO */}
          <div className="bg-white rounded-[2rem] border border-gray-100 p-6 shadow-lg mt-8 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-500"></div>
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight text-gray-900 flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-emerald-500" />
                  Apostas de Longo Prazo - Gols do Mês
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-1">
                  Odds de Over/Under para gols de cada atleta no mês atual, atualizadas automaticamente a cada partida.
                </p>
              </div>
              
              <button 
                onClick={handleToggleLongTermMarket}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                  betSettings.longTermMonthlyGoals?.enabled
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {betSettings.longTermMonthlyGoals?.enabled ? (
                  <><Zap className="w-4 h-4" /> Público: Ativo (ON)</>
                ) : (
                  <><Shield className="w-4 h-4" /> Público: Inativo (OFF)</>
                )}
              </button>
            </div>

            {/* Filtro de Busca */}
            <div className="relative mb-6">
              <input
                type="text"
                placeholder="Buscar jogador para ver odds de longo prazo..."
                value={longTermSearch}
                onChange={e => setLongTermSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-medium"
              />
              <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>

            {/* Abas para Apostas no Longo Prazo */}
            <div className="flex border-b border-gray-150 mb-6 gap-2">
              <button
                type="button"
                onClick={() => setActiveBetTab('linha')}
                className={`pb-3 px-4 text-xs sm:text-sm font-black uppercase tracking-wider border-b-2 transition-all ${
                  activeBetTab === 'linha'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Gols no Mês (Linha)
              </button>
              <button
                type="button"
                onClick={() => setActiveBetTab('goleiro')}
                className={`pb-3 px-4 text-xs sm:text-sm font-black uppercase tracking-wider border-b-2 transition-all ${
                  activeBetTab === 'goleiro'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Gols Sofridos (Goleiros)
              </button>
            </div>

            {/* Listagem de Jogadores e Odds por Categoria */}
            <div className="space-y-4">
              {activeBetTab === 'linha' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-black uppercase tracking-wider text-emerald-600 border-b border-gray-150 pb-2 flex items-center justify-between">
                    <span>Gols no Mês (Linha)</span>
                    <span className="text-[10px] text-gray-400 font-bold lowercase">atleta de linha - ordenado por gols</span>
                  </h4>
                  <div className="flex flex-col bg-white border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-100 shadow-sm">
                    {(() => {
                      const linePlayers = players.filter(p => p.position !== 'goleiro' && (p.stats?.matches || 0) >= 10 && (adminData ? true : !p.bettingDisabled));
                      const sortedLine = [...linePlayers]
                        .filter(p => {
                          const term = longTermSearch.toLowerCase();
                          return p.name.toLowerCase().includes(term) || p.nickname?.toLowerCase().includes(term);
                        })
                        .map(p => ({ player: p, ltOdds: calculateLongTermOdds(p) }))
                        .sort((a, b) => b.ltOdds.currentGoals - a.ltOdds.currentGoals);

                      if (sortedLine.length === 0) {
                        return <p className="text-xs text-gray-400 italic text-center py-6">Nenhum atleta de linha encontrado.</p>;
                      }

                      return sortedLine.map(({ player, ltOdds }) => {
                        return (
                          <div key={player.id} className={`flex flex-col sm:flex-row sm:items-center justify-between py-2 px-3 hover:bg-slate-50 transition-all gap-3 ${player.bettingDisabled ? 'opacity-65 grayscale-[30%]' : ''}`}>
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span className={`w-6 h-6 rounded flex items-center justify-center text-[9px] font-black text-white shrink-0 ${getPositionColor(player.position)}`}>
                                {getPositionAbbr(player.position)}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-gray-800 uppercase tracking-tight truncate">
                                    {player.nickname || player.name}
                                  </span>
                                  {player.bettingDisabled && (
                                    <span className="text-[8px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-black uppercase shrink-0">Desativado</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                                  Gols no Mês: <span className="text-gray-700 font-black">{ltOdds.currentGoals}</span> | Projeção: <span className="text-gray-700 font-black">{ltOdds.blendedMonthlyAvg.toFixed(1)}</span> | Rating: <span className="text-gray-500 font-bold">{getPlayerFinalOverall(player, cards)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                              {adminData && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await updateDoc(doc(db, 'players', player.id), {
                                        bettingDisabled: !player.bettingDisabled
                                      });
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  }}
                                  className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider transition-all ${
                                    !player.bettingDisabled
                                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                  }`}
                                >
                                  {!player.bettingDisabled ? '🟢 Ativo' : '🔴 Inativo'}
                                </button>
                              )}

                              {/* Mercado de Over/Under */}
                              <div className="flex gap-2">
                                <div className="bg-slate-900 border border-slate-800 rounded-lg py-1 px-3 text-center min-w-[70px]">
                                  <span className="block text-[11px] font-bold text-white tracking-wider">+{ltOdds.line}</span>
                                  <span className="text-[12.5px] font-black text-primary-yellow">@ {ltOdds.oddOver}</span>
                                </div>
                                <div className="bg-slate-900 border border-slate-800 rounded-lg py-1 px-3 text-center min-w-[70px]">
                                  <span className="block text-[11px] font-bold text-white tracking-wider">-{ltOdds.line}</span>
                                  <span className="text-[12.5px] font-black text-primary-yellow">@ {ltOdds.oddUnder}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {activeBetTab === 'goleiro' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-black uppercase tracking-wider text-indigo-600 border-b border-gray-150 pb-2 flex items-center justify-between">
                    <span>Gols Sofridos (Goleiros)</span>
                    <span className="text-[10px] text-gray-400 font-bold lowercase">goleiro - ordenado por sofridos</span>
                  </h4>
                  <div className="flex flex-col bg-white border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-100 shadow-sm">
                    {(() => {
                      const goalkeepers = players.filter(p => p.position === 'goleiro' && (p.stats?.matches || 0) >= 15 && (adminData ? true : !p.bettingDisabled));
                      const sortedGK = [...goalkeepers]
                        .filter(p => {
                          const term = longTermSearch.toLowerCase();
                          return p.name.toLowerCase().includes(term) || p.nickname?.toLowerCase().includes(term);
                        })
                        .map(p => ({ player: p, ltOdds: calculateLongTermConcededOdds(p) }))
                        .sort((a, b) => b.ltOdds.currentGoals - a.ltOdds.currentGoals);

                      if (sortedGK.length === 0) {
                        return <p className="text-xs text-gray-400 italic text-center py-6">Nenhum goleiro encontrado.</p>;
                      }

                      return sortedGK.map(({ player, ltOdds }) => {
                        return (
                          <div key={player.id} className={`flex flex-col sm:flex-row sm:items-center justify-between py-2 px-3 hover:bg-slate-50 transition-all gap-3 ${player.bettingDisabled ? 'opacity-65 grayscale-[30%]' : ''}`}>
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-black text-white shrink-0 bg-blue-600">
                                GK
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-gray-800 uppercase tracking-tight truncate">
                                    {player.nickname || player.name}
                                  </span>
                                  {player.bettingDisabled && (
                                    <span className="text-[8px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-black uppercase shrink-0">Desativado</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                                  Gols Sofridos no Mês: <span className="text-red-500 font-black">{ltOdds.currentGoals}</span> | Projeção: <span className="text-gray-700 font-black">{ltOdds.blendedMonthlyAvg.toFixed(1)}</span> | Rating: <span className="text-gray-500 font-bold">{getPlayerFinalOverall(player, cards)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                              {adminData && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await updateDoc(doc(db, 'players', player.id), {
                                        bettingDisabled: !player.bettingDisabled
                                      });
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  }}
                                  className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider transition-all ${
                                    !player.bettingDisabled
                                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                  }`}
                                >
                                  {!player.bettingDisabled ? '🟢 Ativo' : '🔴 Inativo'}
                                </button>
                              )}

                              {/* Mercado de Over/Under */}
                              <div className="flex gap-2">
                                <div className="bg-slate-900 border border-slate-800 rounded-lg py-1 px-3 text-center min-w-[70px]">
                                  <span className="block text-[11px] font-bold text-white tracking-wider">+{ltOdds.line}</span>
                                  <span className="text-[12.5px] font-black text-primary-yellow">@ {ltOdds.oddOver}</span>
                                </div>
                                <div className="bg-slate-900 border border-slate-800 rounded-lg py-1 px-3 text-center min-w-[70px]">
                                  <span className="block text-[11px] font-bold text-white tracking-wider">-{ltOdds.line}</span>
                                  <span className="text-[12.5px] font-black text-primary-yellow">@ {ltOdds.oddUnder}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
