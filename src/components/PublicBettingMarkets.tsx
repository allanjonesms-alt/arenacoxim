import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, where, getDoc, doc, addDoc, runTransaction } from 'firebase/firestore';
import { Match, OddsEngineConfig, Player, Card } from '../types';
import { TrendingUp, Shield, Trophy, Target, Zap, CalendarDays, Search, ChevronDown, ChevronUp, ArrowLeft, ChevronRight, Clock, Users } from 'lucide-react';
import { getPositionAbbr, getPositionColor, getPlayerFinalOverall } from '../utils/playerUtils';
import { calculateMatchPoints } from '../utils/scoringEngine';

const isMatchWithin30MinOrPast = (matchDate: string, matchTime: string) => {
  if (!matchDate || !matchTime) return false;
  try {
    const [year, month, day] = matchDate.split('-').map(Number);
    const [hours, minutes] = matchTime.split(':').map(Number);
    const matchDateTime = new Date(year, month - 1, day, hours, minutes, 0);
    const now = new Date();
    const diffInMinutes = (matchDateTime.getTime() - now.getTime()) / (1000 * 60);
    return diffInMinutes <= 30;
  } catch (e) {
    return false;
  }
};

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
  const [betSettings, setBetSettings] = useState<any>({});
  const [allBets, setAllBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMarketTab, setActiveMarketTab] = useState<'matches' | 'longTerm'>('matches');
  const [longTermSearch, setLongTermSearch] = useState('');
  const [isGolsNoMesCollapsed, setIsGolsNoMesCollapsed] = useState(false);
  const [showAllGolsNoMes, setShowAllGolsNoMes] = useState(false);
  const [isGolsSofridosCollapsed, setIsGolsSofridosCollapsed] = useState(false);
  const [showAllGolsSofridos, setShowAllGolsSofridos] = useState(false);
  const [isScorerCollapsed, setIsScorerCollapsed] = useState(false);
  const [showAllScorer, setShowAllScorer] = useState(false);

  // Selected match for dedicated match betting view
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

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

    const unsubMatches = onSnapshot(collection(db, 'matches'), snap => {
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

  const getGkAverageConceded = (gk: Player) => {
    const finishedMatches = matches.filter(m => m.status === 'finished');
    let goalkeeperCareerConceded = 0;
    let goalkeeperCareerMatches = 0;

    finishedMatches.forEach(match => {
      if (match.goalkeeperAId === gk.id) {
        goalkeeperCareerConceded += match.scoreB || 0;
        goalkeeperCareerMatches++;
      } else if (match.goalkeeperBId === gk.id) {
        goalkeeperCareerConceded += match.scoreA || 0;
        goalkeeperCareerMatches++;
      }
    });

    const gkMatchesCount = goalkeeperCareerMatches > 0 ? goalkeeperCareerMatches : (gk.stats?.matches || 0);
    const careerConcededAvgPerMatch = gkMatchesCount > 0 
      ? (goalkeeperCareerConceded / gkMatchesCount) 
      : 2.0;

    const positionBaseConcededPerMatch = 2.0;
    const gkWeight = Math.min(1.0, gkMatchesCount / 20);
    const blendedConcededPerMatch = (careerConcededAvgPerMatch * gkWeight) + (positionBaseConcededPerMatch * (1 - gkWeight));

    return blendedConcededPerMatch;
  };

  const getPlayerAverageGoals = (player: Player) => {
    let baseG = 0.6;
    if (player.position === 'centroavante') baseG = 1.20; 
    else if (player.position === 'meio-campo') baseG = 0.80; 
    else if (player.position === 'zagueiro') baseG = 0.20; 
    else if (player.position === 'lateral') baseG = 0.40; 
    else if (player.position === 'goleiro') baseG = 0.02; 

    const mCount = player.stats?.matches || 0;
    const gCount = player.stats?.goals || 0;
    const playerAvgG = mCount > 0 ? gCount / mCount : baseG;

    const weight = Math.min(1, mCount / 5);
    const blendedG = (playerAvgG * weight) + (baseG * (1 - weight));
    return blendedG;
  };

  const calculatePoissonMatchGoals = (match: Match) => {
    if (match.bettingMarkets?.matchGoals?.options && match.bettingMarkets.matchGoals.options.length > 0) {
      return match.bettingMarkets.matchGoals.options;
    }

    const currentTeamA = match.teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
    const currentTeamB = match.teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];

    // 1. Calcular a média geral de gols das partidas finalizadas
    const finishedMatches = matches.filter(m => m.status === 'finished');
    const generalMatchAvg = finishedMatches.length > 0
      ? finishedMatches.reduce((sum, m) => sum + (m.scoreA || 0) + (m.scoreB || 0), 0) / finishedMatches.length
      : 6.5; // Padrão realista para futebol society se não houver histórico

    // Média de gols sofridos por goleiro como baseline
    const baseGkConceded = finishedMatches.length > 0 ? (generalMatchAvg / 2) : 2.5;

    // 2. Poder ofensivo de linha baseado na soma das médias de gols dos atletas escalados
    const outfieldA = currentTeamA.filter(p => p.position !== 'goleiro');
    const baseOffensivePowerA = outfieldA.length > 0 
      ? outfieldA.reduce((sum, p) => sum + getPlayerAverageGoals(p), 0)
      : (generalMatchAvg / 2);

    const outfieldB = currentTeamB.filter(p => p.position !== 'goleiro');
    const baseOffensivePowerB = outfieldB.length > 0 
      ? outfieldB.reduce((sum, p) => sum + getPlayerAverageGoals(p), 0)
      : (generalMatchAvg / 2);

    // 3. Médias de gols sofridos dos goleiros
    const gkA = currentTeamA.find(p => p.position === 'goleiro') || (match?.goalkeeperAId ? players.find(p => p.id === match.goalkeeperAId) : null);
    const gkB = currentTeamB.find(p => p.position === 'goleiro') || (match?.goalkeeperBId ? players.find(p => p.id === match.goalkeeperBId) : null);

    const gkA_avg = gkA ? getGkAverageConceded(gkA) : baseGkConceded;
    const gkB_avg = gkB ? getGkAverageConceded(gkB) : baseGkConceded;

    // 4. Projeção inicial (poder de ataque contra a defesa do goleiro adversário)
    let expectedA = baseOffensivePowerA * (gkB_avg / baseGkConceded);
    let expectedB = baseOffensivePowerB * (gkA_avg / baseGkConceded);

    // 5. Calibração e ancoragem: combinamos 60% da projeção individual com 40% da média histórica geral do torneio para garantir estabilidade e realidade.
    const playerBasedTotal = expectedA + expectedB;
    const lambda = (playerBasedTotal * 0.6) + (generalMatchAvg * 0.4);

    const poissonProb = (l: number, k: number) => {
      let p = Math.exp(-l);
      let cumulative = 0;
      for (let i = 0; i <= k; i++) {
        if (i > 0) p = p * l / i;
        cumulative += p;
      }
      return cumulative;
    };

    const getOverUnderOdds = (k: number) => {
      const probUnder = poissonProb(lambda, k);
      const probOver = Math.max(0.01, Math.min(0.99, 1 - probUnder));
      const safeProbUnder = Math.max(0.01, Math.min(0.99, probUnder));

      const margin = 1.25;
      let oddOver = 1 / (probOver * margin);
      let oddUnder = 1 / (safeProbUnder * margin);

      const maxOdd = 12.00;
      
      return {
        line: `${k}.5`,
        probOver: (probOver * 100).toFixed(1),
        probUnder: (safeProbUnder * 100).toFixed(1),
        oddOver: Math.max(1.01, Math.min(maxOdd, oddOver)).toFixed(2),
        oddUnder: Math.max(1.01, Math.min(maxOdd, oddUnder)).toFixed(2)
      };
    };

    return [
      getOverUnderOdds(2),
      getOverUnderOdds(3),
      getOverUnderOdds(4),
      getOverUnderOdds(5)
    ];
  };

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
  const getMonthlyPointsData = () => {
    const data: { [playerId: string]: { [monthKey: string]: number } } = {};
    const finishedMatches = matches.filter(m => m.status === 'finished');
    const activeRules = {
      win: 3,
      draw: 1,
      goal: 5,
      assist: 3,
      cleanSheet: 5,
      mvp: 10,
      penaltySave: 5,
      penaltyMiss: 5
    };

    players.forEach(p => {
      data[p.id] = {};
    });

    finishedMatches.forEach(match => {
      if (!match.date) return;
      const monthKey = match.date.substring(0, 7);

      const scoreA = match.scoreA ?? 0;
      const scoreB = match.scoreB ?? 0;
      const events = match.events || [];
      const mvpId = match.mvpId || null;

      try {
        const results = calculateMatchPoints(
          match,
          scoreA,
          scoreB,
          events,
          mvpId,
          players,
          activeRules as any
        );

        results.forEach(res => {
          if (res.playerId.startsWith('unidentified_')) return;
          if (!data[res.playerId]) {
            data[res.playerId] = {};
          }
          data[res.playerId][monthKey] = (data[res.playerId][monthKey] || 0) + res.points;
        });
      } catch (err) {
        console.error("Erro ao calcular pontos para longo prazo:", err);
      }
    });

    return data;
  };

  const playerMonthlyPoints = getMonthlyPointsData();

  const getScorerCohort = () => {
    const currentDateObj = new Date();
    const currentMonthKey = currentDateObj.toISOString().substring(0, 7);
    const finishedMatchesThisMonth = matches.filter(m => m.status === 'finished' && m.date?.substring(0, 7) === currentMonthKey);
    const remainingMatches = getRemainingMatchesInMonth(false);

    const cohort = players.map(p => {
      const careerMatches = p.stats?.matches || 0;
      const careerPoints = p.stats?.points || 0;
      
      let positionDefault = 4.0;
      if (p.position === 'centroavante') positionDefault = 6.0;
      else if (p.position === 'meio-campo') positionDefault = 5.0;
      else if (p.position === 'lateral') positionDefault = 4.5;
      else if (p.position === 'zagueiro') positionDefault = 3.5;
      else if (p.position === 'goleiro') positionDefault = 4.0;

      const careerAvg = careerMatches > 0 ? (careerPoints / careerMatches) : positionDefault;
      const weight = Math.min(1.0, careerMatches / 15);
      const blendedCareerAvg = (careerAvg * weight) + (positionDefault * (1 - weight));

      const C = playerMonthlyPoints[p.id]?.[currentMonthKey] || 0;
      const playedThisMonth = finishedMatchesThisMonth.filter(m => m.teamA.includes(p.id) || m.teamB.includes(p.id)).length;

      let projectedPointsPerMatch = blendedCareerAvg;
      if (playedThisMonth > 0) {
        const currentMonthAvg = C / playedThisMonth;
        const formWeight = Math.min(0.40, playedThisMonth / 8);
        projectedPointsPerMatch = (currentMonthAvg * formWeight) + (blendedCareerAvg * (1 - formWeight));
      }

      const expectedRemaining = projectedPointsPerMatch * remainingMatches;
      const expectedTotal = C + expectedRemaining;

      return {
        id: p.id,
        player: p,
        currentPoints: C,
        playedThisMonth,
        avgPerMatch: playedThisMonth > 0 ? (C / playedThisMonth) : blendedCareerAvg,
        expectedTotal,
        bettingDisabled: p.bettingDisabled || false
      };
    });

    const activeCohort = cohort.filter(item => !item.bettingDisabled && (item.player.stats?.matches || 0) >= 1);

    const T = 12.0;
    let sumExp = 0;
    
    activeCohort.forEach(item => {
      const val = Math.max(1.0, item.expectedTotal);
      sumExp += Math.exp(val / T);
    });

    const finalCohort = cohort.map(item => {
      const val = Math.max(1.0, item.expectedTotal);
      const prob = !item.bettingDisabled && sumExp > 0 ? (Math.exp(val / T) / sumExp) : 0;
      const rawOdd = prob > 0 ? (1.20 / prob) : 99.00;
      const odd = Math.max(1.15, Math.min(99.00, Number(rawOdd.toFixed(2))));

      return {
        ...item,
        prob: prob * 100,
        odd
      };
    });

    return finalCohort;
  };

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

  const handlePlaceBet = async () => {
    const finalBetAmt = Math.min(1.00, bettingParams?.maxBetAmount || 1.00);
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
          matchId: selectedBet.match?.id || selectedBet.matchId || 'long_term',
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

  // Filter matches that have at least one betting market enabled and are not finished
  const activeBettableMatches = matches.filter(match => {
    const timeLocked = isMatchWithin30MinOrPast(match.date, match.time);
    const isGoalsEnabled = match.bettingMarkets?.playerGoals?.enabled && !timeLocked;
    const isAssistsEnabled = match.bettingMarkets?.playerAssists?.enabled && !timeLocked;
    const isWinnerEnabled = match.bettingMarkets?.matchWinner?.enabled;
    const isMatchGoalsEnabled = match.bettingMarkets?.matchGoals?.enabled && !timeLocked;
    return (match.status === 'scheduled' || match.status === 'live') && (
           isWinnerEnabled || 
           isGoalsEnabled || 
           isAssistsEnabled ||
           isMatchGoalsEnabled
    );
  });

  // Sort matches chronologically by date and time (Jogo 1, Jogo 2, etc.)
  const sortedBettableMatches = [...activeBettableMatches].sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const timeA = a.time || '00:00';
    const timeB = b.time || '00:00';
    return timeA.localeCompare(timeB);
  });

  const isAnyMarketOpen = sortedBettableMatches.length > 0 || (betSettings.longTermMonthlyGoals?.enabled);

  if (!isAnyMarketOpen) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-3xl p-8 text-center flex flex-col items-center justify-center gap-2 mt-8">
        <Shield className="w-8 h-8 text-gray-300" />
        <p className="text-sm font-bold text-gray-600">Nenhum mercado aberto no momento</p>
        <p className="text-xs text-gray-400">Aguarde o administrador habilitar as apostas para os próximos confrontos ou mercados de longo prazo.</p>
      </div>
    );
  }

  // Find selected match index if selectedMatchId is active
  const selectedMatchIndex = selectedMatchId ? sortedBettableMatches.findIndex(m => m.id === selectedMatchId) : -1;
  const selectedMatch = selectedMatchIndex >= 0 ? sortedBettableMatches[selectedMatchIndex] : null;

  // DEDICATED MATCH BETTING VIEW
  if (selectedMatch) {
    const gameNumber = selectedMatchIndex + 1;
    const gameTitle = `JOGO ${gameNumber}`;
    const timeLocked = isMatchWithin30MinOrPast(selectedMatch.date, selectedMatch.time);
    const isWinnerEnabled = selectedMatch.bettingMarkets?.matchWinner?.enabled;
    const isGoalsEnabled = selectedMatch.bettingMarkets?.playerGoals?.enabled && !timeLocked;
    const isAssistsEnabled = selectedMatch.bettingMarkets?.playerAssists?.enabled && !timeLocked;
    const isMatchGoalsEnabled = selectedMatch.bettingMarkets?.matchGoals?.enabled && !timeLocked;
    const odds = calculateFloatingOdds(selectedMatch);

    return (
      <div className="space-y-8 mt-8 animate-in fade-in duration-300">
        {/* Dedicated Match Page Header */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-3">
            <button
              onClick={() => setSelectedMatchId(null)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all font-black text-xs uppercase tracking-wider cursor-pointer active:scale-95 shadow-2xs"
            >
              <ArrowLeft className="w-4 h-4 text-primary-blue" />
              <span>Voltar para Próximos Confrontos</span>
            </button>

            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-black uppercase tracking-wider text-white bg-primary-blue px-3 py-1 rounded-xl shadow-xs border border-blue-900/10 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-primary-yellow" />
                {gameTitle}
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                Disponível para Apostas
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-primary-blue uppercase italic tracking-tight">
              Confronto Azul vs Amarelo
            </h2>

            <div className="flex items-center gap-3 text-xs font-bold text-gray-500">
              <span className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
                <CalendarDays className="w-4 h-4 text-primary-yellow" />
                {selectedMatch.date} às {selectedMatch.time}
              </span>
            </div>
          </div>

          <button
            onClick={() => setSelectedMatchId(null)}
            className="bg-primary-blue hover:bg-blue-900 text-white font-black text-xs uppercase tracking-wider px-6 py-3 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer self-start sm:self-center flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4 text-primary-yellow" />
            <span>Voltar</span>
          </button>
        </div>

        {/* Dedicated Match Markets Container */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm border border-gray-100 space-y-8">
          {/* 1. Vencedor da Partida (1X2) */}
          {isWinnerEnabled && odds && (
            <div className="space-y-4">
              <div className="text-xs font-black text-primary-blue uppercase tracking-[0.2em] bg-blue-50/80 border border-blue-100 py-3 px-4 rounded-2xl flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary-yellow" /> Vencedor da Partida ({gameTitle})
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button 
                  onClick={() => setSelectedBet({ 
                    match: selectedMatch, 
                    market: 'matchWinner', 
                    selection: 'teamA', 
                    odd: odds.oddA,
                    matchInfo: `${gameTitle} - Azul vs Amarelo`,
                    selectedOutcome: 'Vitória Azul (1)'
                  })}
                  className="bg-white border-2 border-slate-200 text-slate-800 rounded-2xl p-4 flex flex-col items-center hover:border-primary-blue hover:bg-blue-50/20 transition-all cursor-pointer shadow-sm active:scale-95 group"
                >
                  <span className="text-xs text-slate-500 uppercase font-black mb-1 group-hover:text-primary-blue">Time Azul</span>
                  <span className="text-2xl font-black text-emerald-600">@ {odds.oddA}</span>
                </button>

                <button 
                  onClick={() => setSelectedBet({ 
                    match: selectedMatch, 
                    market: 'matchWinner', 
                    selection: 'draw', 
                    odd: odds.oddDraw,
                    matchInfo: `${gameTitle} - Azul vs Amarelo`,
                    selectedOutcome: 'Empate (X)'
                  })}
                  className="bg-white border-2 border-slate-200 text-slate-800 rounded-2xl p-4 flex flex-col items-center hover:border-primary-blue hover:bg-blue-50/20 transition-all cursor-pointer shadow-sm active:scale-95 group"
                >
                  <span className="text-xs text-slate-500 uppercase font-black mb-1 group-hover:text-primary-blue">Empate</span>
                  <span className="text-2xl font-black text-emerald-600">@ {odds.oddDraw}</span>
                </button>

                <button 
                  onClick={() => setSelectedBet({ 
                    match: selectedMatch, 
                    market: 'matchWinner', 
                    selection: 'teamB', 
                    odd: odds.oddB,
                    matchInfo: `${gameTitle} - Azul vs Amarelo`,
                    selectedOutcome: 'Vitória Amarelo (2)'
                  })}
                  className="bg-white border-2 border-slate-200 text-slate-800 rounded-2xl p-4 flex flex-col items-center hover:border-amber-400 hover:bg-amber-50/20 transition-all cursor-pointer shadow-sm active:scale-95 group"
                >
                  <span className="text-xs text-slate-500 uppercase font-black mb-1 group-hover:text-amber-600">Time Amarelo</span>
                  <span className="text-2xl font-black text-emerald-600">@ {odds.oddB}</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. Match Goals (Linhas por partida) */}
          {isMatchGoalsEnabled && (
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="text-xs font-black text-primary-blue uppercase tracking-[0.2em] bg-emerald-50/80 border border-emerald-100 py-3 px-4 rounded-2xl flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-500" /> Total de Gols Marcados no {gameTitle}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {calculatePoissonMatchGoals(selectedMatch).map((opt) => (
                  <div key={opt.line} className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-2xl p-3 gap-3">
                    <span className="text-sm font-black text-slate-800 tracking-wider">Total: {opt.line} Gols</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedBet({
                          match: selectedMatch,
                          market: 'matchGoals',
                          selection: `over_${opt.line}`,
                          odd: opt.oddOver,
                          matchInfo: `${gameTitle} - Azul vs Amarelo`,
                          selectedOutcome: `Mais de ${opt.line} Gols`
                        })}
                        className="bg-white hover:bg-emerald-50 text-slate-800 hover:border-emerald-500 border border-slate-200 font-black text-xs px-4 py-2 rounded-xl transition-all flex flex-col items-center min-w-[85px] cursor-pointer shadow-xs active:scale-95"
                      >
                        <span className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">Mais de</span>
                        <span className="text-sm font-black text-emerald-600">@ {opt.oddOver}</span>
                      </button>
                      <button
                        onClick={() => setSelectedBet({
                          match: selectedMatch,
                          market: 'matchGoals',
                          selection: `under_${opt.line}`,
                          odd: opt.oddUnder,
                          matchInfo: `${gameTitle} - Azul vs Amarelo`,
                          selectedOutcome: `Menos de ${opt.line} Gols`
                        })}
                        className="bg-white hover:bg-emerald-50 text-slate-800 hover:border-emerald-500 border border-slate-200 font-black text-xs px-4 py-2 rounded-xl transition-all flex flex-col items-center min-w-[85px] cursor-pointer shadow-xs active:scale-95"
                      >
                        <span className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">Menos de</span>
                        <span className="text-sm font-black text-emerald-600">@ {opt.oddUnder}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Desempenho Individual de Jogadores */}
          {(isGoalsEnabled || isAssistsEnabled) && (
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="text-xs font-black text-primary-blue uppercase tracking-[0.2em] bg-rose-50/80 border border-rose-100 py-3 px-4 rounded-2xl flex items-center gap-2">
                <Target className="w-4 h-4 text-rose-500" /> Desempenho Individual de Jogadores ({gameTitle})
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {['teamA', 'teamB'].map(teamKey => {
                  const playerIds = teamKey === 'teamA' ? selectedMatch.teamA : selectedMatch.teamB;
                  const teamName = teamKey === 'teamA' ? 'Azul' : 'Amarelo';
                  const teamBadgeColor = teamKey === 'teamA' ? 'text-primary-blue bg-blue-50 border-blue-200' : 'text-amber-700 bg-amber-50 border-amber-200';

                  // Opposing team stats
                  const oppIds = teamKey === 'teamA' ? selectedMatch.teamB : selectedMatch.teamA;
                  const oppTotal = oppIds.reduce((sum, id) => {
                    const p = players.find(x => x.id === id);
                    return sum + (p ? getPlayerFinalOverall(p, cards) : 75);
                  }, 0);
                  const oppAvg = oppIds.length > 0 ? oppTotal / oppIds.length : 75;

                  const activePlayers = playerIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];

                  if (activePlayers.length === 0) return null;

                  return (
                    <div key={teamKey} className="space-y-3 bg-slate-50/60 p-4 rounded-2xl border border-slate-100">
                      <div className={`text-xs font-black uppercase tracking-wider px-3 py-1 rounded-xl border inline-block ${teamBadgeColor}`}>
                        Time {teamName}
                      </div>

                      <div className="space-y-2.5">
                        {activePlayers.map(player => {
                          const pOdds = calculatePlayerPropOdds(player, oppAvg);
                          return (
                            <div key={player.id} className="flex flex-col sm:flex-row sm:items-center justify-between border border-gray-200/70 rounded-2xl p-3 bg-white gap-3 shadow-xs">
                              <div className="flex items-center gap-2.5">
                                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black text-white ${getPositionColor(player.position)}`}>
                                  {getPositionAbbr(player.position)}
                                </span>
                                <span className="text-xs font-black text-gray-800 uppercase">{player.nickname || player.name}</span>
                              </div>

                              <div className="flex flex-col gap-2">
                                {isGoalsEnabled && (
                                  <div className="flex items-center gap-2 justify-between sm:justify-end">
                                    <span className="text-[9px] font-black text-gray-400 uppercase w-10">Gols</span>
                                    <button 
                                      onClick={() => setSelectedBet({
                                        match: selectedMatch,
                                        market: 'playerGoals',
                                        selection: `${player.nickname || player.name} +0.5 Gols`,
                                        odd: pOdds.g1,
                                        matchInfo: `${gameTitle} (Time ${teamName}) - ${player.nickname || player.name}`,
                                        selectedOutcome: `Marcar +0.5 Gols`
                                      })}
                                      className="bg-slate-50 border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 text-slate-800 rounded-xl px-2.5 py-1 text-center min-w-[55px] transition-all cursor-pointer active:scale-95"
                                    >
                                      <div className="text-[8px] text-slate-500 font-bold leading-none mb-0.5">+0.5</div>
                                      <div className="text-xs font-black leading-none text-emerald-600">@ {pOdds.g1}</div>
                                    </button>
                                    <button 
                                      onClick={() => setSelectedBet({
                                        match: selectedMatch,
                                        market: 'playerGoals',
                                        selection: `${player.nickname || player.name} +1.5 Gols`,
                                        odd: pOdds.g2,
                                        matchInfo: `${gameTitle} (Time ${teamName}) - ${player.nickname || player.name}`,
                                        selectedOutcome: `Marcar +1.5 Gols`
                                      })}
                                      className="bg-slate-50 border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 text-slate-800 rounded-xl px-2.5 py-1 text-center min-w-[55px] transition-all cursor-pointer active:scale-95"
                                    >
                                      <div className="text-[8px] text-slate-500 font-bold leading-none mb-0.5">+1.5</div>
                                      <div className="text-xs font-black leading-none text-emerald-600">@ {pOdds.g2}</div>
                                    </button>
                                  </div>
                                )}

                                {isAssistsEnabled && (
                                  <div className="flex items-center gap-2 justify-between sm:justify-end">
                                    <span className="text-[9px] font-black text-gray-400 uppercase w-10">Assist.</span>
                                    <button 
                                      onClick={() => setSelectedBet({
                                        match: selectedMatch,
                                        market: 'playerAssists',
                                        selection: `${player.nickname || player.name} +0.5 Assistências`,
                                        odd: pOdds.a1,
                                        matchInfo: `${gameTitle} (Time ${teamName}) - ${player.nickname || player.name}`,
                                        selectedOutcome: `Dar +0.5 Assistência`
                                      })}
                                      className="bg-slate-50 border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 text-slate-800 rounded-xl px-2.5 py-1 text-center min-w-[55px] transition-all cursor-pointer active:scale-95"
                                    >
                                      <div className="text-[8px] text-slate-500 font-bold leading-none mb-0.5">+0.5</div>
                                      <div className="text-xs font-black leading-none text-emerald-600">@ {pOdds.a1}</div>
                                    </button>
                                    <button 
                                      onClick={() => setSelectedBet({
                                        match: selectedMatch,
                                        market: 'playerAssists',
                                        selection: `${player.nickname || player.name} +1.5 Assistências`,
                                        odd: pOdds.a2,
                                        matchInfo: `${gameTitle} (Time ${teamName}) - ${player.nickname || player.name}`,
                                        selectedOutcome: `Dar +1.5 Assistência`
                                      })}
                                      className="bg-slate-50 border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 text-slate-800 rounded-xl px-2.5 py-1 text-center min-w-[55px] transition-all cursor-pointer active:scale-95"
                                    >
                                      <div className="text-[8px] text-slate-500 font-bold leading-none mb-0.5">+1.5</div>
                                      <div className="text-xs font-black leading-none text-emerald-600">@ {pOdds.a2}</div>
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

        {/* Back Button Footer */}
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setSelectedMatchId(null)}
            className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 rounded-2xl border border-gray-200 shadow-sm font-black text-xs uppercase tracking-wider cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 text-primary-blue" />
            <span>Voltar para Todos os Confrontos</span>
          </button>
        </div>

        {/* Modal for placing bets */}
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
                      value={Math.min(1.00, bettingParams?.maxBetAmount || 1.00)}
                      readOnly
                      className="w-full pl-12 pr-4 py-3 bg-gray-100 border border-gray-200 rounded-xl font-bold text-gray-500 focus:outline-none cursor-not-allowed"
                    />
                  </div>
                  <div className="text-right text-xs font-bold text-gray-500 mt-2">
                    Retorno Potencial: <span className="text-emerald-500 font-black">R$ {(Math.min(1.00, bettingParams?.maxBetAmount || 1.00) * Number(selectedBet.odd)).toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setSelectedBet(null)}
                    className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  {balance >= Math.min(1.00, bettingParams?.maxBetAmount || 1.00) ? (
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

  // ALL MATCHES CARDS LIST VIEW
  return (
    <div className="space-y-8 mt-8">
      {/* SECTION 1: PROXIMOS CONFRONTOS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="text-xl font-black uppercase italic tracking-tight text-primary-blue flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary-yellow" />
            Próximos Confrontos
          </h3>
          <span className="text-xs font-bold text-gray-400 uppercase">
            Clique na partida para ver todos os mercados
          </span>
        </div>

        {sortedBettableMatches.length === 0 ? (
          <div className="bg-gray-50 border border-gray-100 rounded-3xl p-8 text-center flex flex-col items-center justify-center gap-2">
            <Shield className="w-8 h-8 text-gray-300" />
            <p className="text-sm font-bold text-gray-600">Nenhum confronto disponível para apostas no momento</p>
          </div>
        ) : (
          <div className="bg-slate-900 text-white rounded-3xl overflow-hidden shadow-xl border border-slate-800">
            {/* Sportsbook Header Bar */}
            <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800/80 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-400">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary-yellow" />
                <span>Partida / Confronto</span>
              </div>
              <div className="flex items-center text-center font-black">
                <div className="w-20 sm:w-24 text-amber-400">1</div>
                <div className="w-20 sm:w-24 text-amber-400">X</div>
                <div className="w-20 sm:w-24 text-amber-400">2</div>
              </div>
            </div>

            {/* Match Rows */}
            <div className="divide-y divide-slate-800/60">
              {sortedBettableMatches.map((match, index) => {
                const gameNumber = index + 1;
                const gameTitle = `JOGO ${gameNumber}`;
                const timeLocked = isMatchWithin30MinOrPast(match.date, match.time);
                const isWinnerEnabled = match.bettingMarkets?.matchWinner?.enabled;
                const isGoalsEnabled = match.bettingMarkets?.playerGoals?.enabled && !timeLocked;
                const isAssistsEnabled = match.bettingMarkets?.playerAssists?.enabled && !timeLocked;
                const isMatchGoalsEnabled = match.bettingMarkets?.matchGoals?.enabled && !timeLocked;

                const odds = calculateFloatingOdds(match);

                // Calculate additional markets count for badge like "8 »"
                let marketCount = 0;
                if (isWinnerEnabled) marketCount += 1;
                if (isMatchGoalsEnabled) marketCount += calculatePoissonMatchGoals(match).length * 2;
                if (isGoalsEnabled || isAssistsEnabled) {
                  const totalPlayers = (match.teamA?.length || 0) + (match.teamB?.length || 0);
                  if (isGoalsEnabled) marketCount += totalPlayers * 2;
                  if (isAssistsEnabled) marketCount += totalPlayers * 2;
                }

                return (
                  <div 
                    key={match.id}
                    onClick={() => {
                      setSelectedMatchId(match.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="p-4 sm:p-5 hover:bg-slate-800/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group"
                  >
                    {/* Left: Teams & Match Info */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-primary-yellow bg-primary-blue/60 px-2.5 py-0.5 rounded-md border border-blue-500/20">
                          {gameTitle}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400">
                          {match.date}
                        </span>
                      </div>

                      <div className="space-y-1.5 pl-0.5">
                        <div className="flex items-center gap-2.5">
                          <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0 shadow-xs shadow-blue-500/50" />
                          <span className="text-sm sm:text-base font-black text-white group-hover:text-amber-300 transition-colors">
                            Time Azul
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="w-3 h-3 rounded-full bg-amber-400 shrink-0 shadow-xs shadow-amber-400/50" />
                          <span className="text-sm sm:text-base font-black text-white group-hover:text-amber-300 transition-colors">
                            Time Amarelo
                          </span>
                        </div>
                      </div>

                      {/* Time & Markets Badge */}
                      <div className="flex items-center gap-2 pt-1 text-xs font-bold text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          {match.time}
                        </span>
                        {marketCount > 0 && (
                          <span 
                            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-md border border-emerald-500/30 flex items-center gap-1 transition-all"
                            title="Ver todos os mercados"
                          >
                            <span>+{marketCount}</span>
                            <ChevronRight className="w-3 h-3 text-emerald-400" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Odds Columns (1 X 2) */}
                    <div 
                      className="flex items-center justify-end gap-2 sm:gap-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isWinnerEnabled && odds ? (
                        <>
                          {/* 1 - Vitória Azul */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBet({
                                match,
                                market: 'matchWinner',
                                selection: 'teamA',
                                odd: odds.oddA,
                                matchInfo: `${gameTitle} - Azul vs Amarelo`,
                                selectedOutcome: 'Vitória Azul (1)'
                              });
                            }}
                            className="w-20 sm:w-24 py-2.5 bg-slate-800/90 hover:bg-slate-700 hover:border-amber-400 border border-slate-700/80 rounded-xl text-center transition-all cursor-pointer shadow-xs active:scale-95 group/btn"
                          >
                            <span className="text-[9px] font-black uppercase text-slate-400 block group-hover/btn:text-slate-300">Azul</span>
                            <span className="text-sm sm:text-base font-black text-amber-400 group-hover/btn:text-amber-300">{odds.oddA}</span>
                          </button>

                          {/* X - Empate */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBet({
                                match,
                                market: 'matchWinner',
                                selection: 'draw',
                                odd: odds.oddDraw,
                                matchInfo: `${gameTitle} - Azul vs Amarelo`,
                                selectedOutcome: 'Empate (X)'
                              });
                            }}
                            className="w-20 sm:w-24 py-2.5 bg-slate-800/90 hover:bg-slate-700 hover:border-amber-400 border border-slate-700/80 rounded-xl text-center transition-all cursor-pointer shadow-xs active:scale-95 group/btn"
                          >
                            <span className="text-[9px] font-black uppercase text-slate-400 block group-hover/btn:text-slate-300">Empate</span>
                            <span className="text-sm sm:text-base font-black text-amber-400 group-hover/btn:text-amber-300">{odds.oddDraw}</span>
                          </button>

                          {/* 2 - Vitória Amarelo */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBet({
                                match,
                                market: 'matchWinner',
                                selection: 'teamB',
                                odd: odds.oddB,
                                matchInfo: `${gameTitle} - Azul vs Amarelo`,
                                selectedOutcome: 'Vitória Amarelo (2)'
                              });
                            }}
                            className="w-20 sm:w-24 py-2.5 bg-slate-800/90 hover:bg-slate-700 hover:border-amber-400 border border-slate-700/80 rounded-xl text-center transition-all cursor-pointer shadow-xs active:scale-95 group/btn"
                          >
                            <span className="text-[9px] font-black uppercase text-slate-400 block group-hover/btn:text-slate-300">Amarelo</span>
                            <span className="text-sm sm:text-base font-black text-amber-400 group-hover/btn:text-amber-300">{odds.oddB}</span>
                          </button>
                        </>
                      ) : (
                        <div className="text-xs font-bold text-slate-500 py-2">
                          Mercado indisponível
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: GOLS NO MÊS & GOLS SOFRIDOS & MAIOR PONTUADOR */}
      {(betSettings.longTermMonthlyGoals?.enabled || betSettings.longTermMonthlyScorer?.enabled) && (
        <div className="space-y-8 pt-8 border-t border-gray-100">
          
          {/* Shared search filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black uppercase italic tracking-tight text-primary-blue flex items-center gap-2">
                <CalendarDays className="w-6 h-6 text-emerald-500" />
                Mercados Mensais de Longo Prazo
              </h3>
              <p className="text-xs text-gray-400 font-semibold mt-1">
                Acompanhe o desempenho do mês e aposte no acumulado de gols e gols sofridos.
              </p>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <input
                type="text"
                placeholder="Buscar jogador..."
                value={longTermSearch}
                onChange={e => setLongTermSearch(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-primary-blue outline-none transition-all font-semibold shadow-sm"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* SUBSECTION A: GOLS NO MÊS */}
            <div className="bg-white border border-gray-100 rounded-[2.5rem] p-6 shadow-sm space-y-6">
              <div className="border-b border-gray-50 pb-4 flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-black uppercase italic text-primary-blue flex items-center gap-2">
                    <Target className="w-5 h-5 text-rose-500" />
                    Gols no Mês
                  </h4>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">
                    Atletas de Linha - Ordenado por gols marcados
                  </p>
                </div>
                <button
                  onClick={() => setIsGolsNoMesCollapsed(!isGolsNoMesCollapsed)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-all text-gray-400 hover:text-gray-700 cursor-pointer"
                  title={isGolsNoMesCollapsed ? "Expandir Gols no Mês" : "Recolher Gols no Mês"}
                >
                  {isGolsNoMesCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
              </div>

              {!isGolsNoMesCollapsed && (
                <div className="space-y-4">
                  <div className="space-y-1.5 pr-1">
                    {(() => {
                      const nonGoalkeepers = players.filter(p => p.position !== 'goleiro' && (p.stats?.matches || 0) >= 10 && !p.bettingDisabled);
                      const currentMonthKey = new Date().toISOString().substring(0, 7);
                      const currentMonthName = MONTH_NAMES_PT[currentMonthKey.split('-')[1]] || 'Julho';

                      const sortedNonGoalkeepers = [...nonGoalkeepers]
                        .filter(p => {
                          const term = longTermSearch.toLowerCase();
                          return p.name.toLowerCase().includes(term) || p.nickname?.toLowerCase().includes(term);
                        })
                        .map(p => {
                          const ltOdds = calculateLongTermOdds(p);
                          return { player: p, ltOdds };
                        })
                        .sort((a, b) => b.ltOdds.currentGoals - a.ltOdds.currentGoals);

                      if (sortedNonGoalkeepers.length === 0) {
                        return (
                          <div className="text-center py-8 text-xs text-gray-400 font-semibold uppercase">
                            Nenhum jogador encontrado
                          </div>
                        );
                      }

                      const visiblePlayers = showAllGolsNoMes ? sortedNonGoalkeepers : sortedNonGoalkeepers.slice(0, 5);

                      return (
                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            {visiblePlayers.map(({ player, ltOdds }) => (
                              <div key={player.id} className="flex items-center justify-between border border-gray-50 rounded-xl py-1 px-2 bg-slate-50/50 hover:bg-slate-50 transition-all gap-2">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <span className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-black text-white shrink-0 ${getPositionColor(player.position)}`}>
                                    {getPositionAbbr(player.position)}
                                  </span>
                                  <div className="min-w-0">
                                    <span className="block text-xs font-black text-gray-800 uppercase tracking-tight truncate">
                                      {player.nickname || player.name}
                                    </span>
                                    <span className="block text-[9px] text-gray-400 font-bold uppercase">
                                      Gols marcados: <span className="text-gray-700 font-black">{ltOdds.currentGoals}</span>
                                    </span>
                                  </div>
                                </div>

                                {/* Odds buttons */}
                                <div className="flex gap-2 shrink-0">
                                  <button
                                    onClick={() => setSelectedBet({
                                      matchId: `longterm_${player.id}_${currentMonthKey}`,
                                      market: 'longTermMonthlyGoals',
                                      selection: 'over',
                                      odd: ltOdds.oddOver,
                                      matchInfo: `Artilharia Mensal: ${player.nickname || player.name}`,
                                      selectedOutcome: `Mais de ${ltOdds.line} Gols (${currentMonthName})`
                                    })}
                                    className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/80 rounded-xl py-1 px-2 min-w-[72px] text-center transition-all cursor-pointer shadow-sm active:scale-95 flex flex-col items-center justify-center"
                                  >
                                    <span className="text-[9.5px] font-black uppercase text-slate-700 mb-0.5 tracking-wider">+{ltOdds.line}</span>
                                    <span className="text-xs font-black text-emerald-600">@ {ltOdds.oddOver}</span>
                                  </button>
                                  <button
                                    onClick={() => setSelectedBet({
                                      matchId: `longterm_${player.id}_${currentMonthKey}`,
                                      market: 'longTermMonthlyGoals',
                                      selection: 'under',
                                      odd: ltOdds.oddUnder,
                                      matchInfo: `Artilharia Mensal: ${player.nickname || player.name}`,
                                      selectedOutcome: `Menos de ${ltOdds.line} Gols (${currentMonthName})`
                                    })}
                                    className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/80 rounded-xl py-1 px-2 min-w-[72px] text-center transition-all cursor-pointer shadow-sm active:scale-95 flex flex-col items-center justify-center"
                                  >
                                    <span className="text-[9.5px] font-black uppercase text-slate-700 mb-0.5 tracking-wider">-{ltOdds.line}</span>
                                    <span className="text-xs font-black text-emerald-600">@ {ltOdds.oddUnder}</span>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          {sortedNonGoalkeepers.length > 5 && (
                            <div className="pt-2 text-center border-t border-gray-50">
                              <button
                                onClick={() => setShowAllGolsNoMes(!showAllGolsNoMes)}
                                className="text-xs font-black uppercase tracking-wider text-primary-blue hover:text-blue-950 transition-all px-4 py-2 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-100 cursor-pointer"
                              >
                                {showAllGolsNoMes ? "Mostrar Menos ▲" : "Mostrar Mais ▼"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* SUBSECTION B: GOLS SOFRIDOS */}
            <div className="bg-white border border-gray-100 rounded-[2.5rem] p-6 shadow-sm space-y-6">
              <div className="border-b border-gray-50 pb-4 flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-black uppercase italic text-primary-blue flex items-center gap-2">
                    <Shield className="w-5 h-5 text-indigo-500" />
                    Gols Sofridos
                  </h4>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">
                    Goleiros - Ordenado por gols sofridos no mês
                  </p>
                </div>
                <button
                  onClick={() => setIsGolsSofridosCollapsed(!isGolsSofridosCollapsed)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-all text-gray-400 hover:text-gray-700 cursor-pointer"
                  title={isGolsSofridosCollapsed ? "Expandir Gols Sofridos" : "Recolher Gols Sofridos"}
                >
                  {isGolsSofridosCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
              </div>

              {!isGolsSofridosCollapsed && (
                <div className="space-y-4">
                  <div className="space-y-1.5 pr-1">
                    {(() => {
                      const goalkeepers = players.filter(p => p.position === 'goleiro' && (p.stats?.matches || 0) >= 15 && !p.bettingDisabled);
                      const currentMonthKey = new Date().toISOString().substring(0, 7);
                      const currentMonthName = MONTH_NAMES_PT[currentMonthKey.split('-')[1]] || 'Julho';

                      const sortedGoalkeepers = [...goalkeepers]
                        .filter(p => {
                          const term = longTermSearch.toLowerCase();
                          return p.name.toLowerCase().includes(term) || p.nickname?.toLowerCase().includes(term);
                        })
                        .map(p => {
                          const ltOdds = calculateLongTermConcededOdds(p);
                          return { player: p, ltOdds };
                        })
                        .sort((a, b) => b.ltOdds.currentGoals - a.ltOdds.currentGoals);

                      if (sortedGoalkeepers.length === 0) {
                        return (
                          <div className="text-center py-8 text-xs text-gray-400 font-semibold uppercase">
                            Nenhum goleiro encontrado
                          </div>
                        );
                      }

                      const visibleGoalkeepers = showAllGolsSofridos ? sortedGoalkeepers : sortedGoalkeepers.slice(0, 5);

                      return (
                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            {visibleGoalkeepers.map(({ player, ltOdds }) => (
                              <div key={player.id} className="flex items-center justify-between border border-gray-50 rounded-xl py-1 px-2 bg-slate-50/50 hover:bg-slate-50 transition-all gap-2">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <span className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-black text-white shrink-0 bg-blue-600`}>
                                    GK
                                  </span>
                                  <div className="min-w-0">
                                    <span className="block text-xs font-black text-gray-800 uppercase tracking-tight truncate">
                                      {player.nickname || player.name}
                                    </span>
                                    <span className="block text-[9px] text-gray-400 font-bold uppercase">
                                      Gols sofridos: <span className="text-red-500 font-black">{ltOdds.currentGoals}</span>
                                    </span>
                                  </div>
                                </div>

                                {/* Odds buttons */}
                                <div className="flex gap-2 shrink-0">
                                  <button
                                    onClick={() => setSelectedBet({
                                      matchId: `longterm_conceded_${player.id}_${currentMonthKey}`,
                                      market: 'longTermConcededGoals',
                                      selection: 'over',
                                      odd: ltOdds.oddOver,
                                      matchInfo: `Gols Sofridos Mensal: ${player.nickname || player.name}`,
                                      selectedOutcome: `Mais de ${ltOdds.line} Gols Sofridos (${currentMonthName})`
                                    })}
                                    className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/80 rounded-xl py-1 px-2 min-w-[72px] text-center transition-all cursor-pointer shadow-sm active:scale-95 flex flex-col items-center justify-center"
                                  >
                                    <span className="text-[9.5px] font-black uppercase text-slate-700 mb-0.5 tracking-wider">+{ltOdds.line}</span>
                                    <span className="text-xs font-black text-emerald-600">@ {ltOdds.oddOver}</span>
                                  </button>
                                  <button
                                    onClick={() => setSelectedBet({
                                      matchId: `longterm_conceded_${player.id}_${currentMonthKey}`,
                                      market: 'longTermConcededGoals',
                                      selection: 'under',
                                      odd: ltOdds.oddUnder,
                                      matchInfo: `Gols Sofridos Mensal: ${player.nickname || player.name}`,
                                      selectedOutcome: `Menos de ${ltOdds.line} Gols Sofridos (${currentMonthName})`
                                    })}
                                    className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/80 rounded-xl py-1 px-2 min-w-[72px] text-center transition-all cursor-pointer shadow-sm active:scale-95 flex flex-col items-center justify-center"
                                  >
                                    <span className="text-[9.5px] font-black uppercase text-slate-700 mb-0.5 tracking-wider">-{ltOdds.line}</span>
                                    <span className="text-xs font-black text-emerald-600">@ {ltOdds.oddUnder}</span>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          {sortedGoalkeepers.length > 5 && (
                            <div className="pt-2 text-center border-t border-gray-50">
                              <button
                                onClick={() => setShowAllGolsSofridos(!showAllGolsSofridos)}
                                className="text-xs font-black uppercase tracking-wider text-primary-blue hover:text-blue-950 transition-all px-4 py-2 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-100 cursor-pointer"
                              >
                                {showAllGolsSofridos ? "Mostrar Menos ▲" : "Mostrar Mais ▼"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SUBSECTION C: MAIOR PONTUADOR DO MÊS */}
          {betSettings.longTermMonthlyScorer?.enabled && (
            <div className="bg-white border border-gray-100 rounded-[2.5rem] p-6 shadow-sm space-y-6 mt-8">
              <div className="border-b border-gray-50 pb-4 flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-black uppercase italic text-primary-blue flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    Maior Pontuador do Mês
                  </h4>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">
                    Atletas Qualificados - Probabilidades automáticas calculadas por IA baseadas em média recente e consistência histórica
                  </p>
                </div>
                <button
                  onClick={() => setIsScorerCollapsed(!isScorerCollapsed)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-all text-gray-400 hover:text-gray-700 cursor-pointer"
                  title={isScorerCollapsed ? "Expandir" : "Recolher"}
                >
                  {isScorerCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
              </div>

              {!isScorerCollapsed && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-100/60 rounded-2xl p-4 text-xs text-amber-800 space-y-1">
                    <p className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-amber-900">
                      <TrendingUp className="w-4 h-4 text-amber-500" /> Entenda a Probabilidade:
                    </p>
                    <p className="text-amber-700 leading-relaxed font-medium">
                      O modelo analisa a pontuação acumulada do mês atual de cada jogador, projeta os jogos restantes com base em suas médias de pontos e calcula a chance de terminar no topo. O cálculo das odds é ajustado em tempo real.
                    </p>
                  </div>

                  <div className="flex flex-col border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-100">
                    {(() => {
                      const cohort = getScorerCohort()
                        .filter(item => {
                          const term = longTermSearch.toLowerCase();
                          return item.player.name.toLowerCase().includes(term) || item.player.nickname?.toLowerCase().includes(term);
                        })
                        .sort((a, b) => b.expectedTotal - a.expectedTotal);

                      if (cohort.length === 0) {
                        return (
                          <div className="text-center py-8 text-xs text-gray-400 font-bold uppercase">
                            Nenhum atleta qualificado encontrado
                          </div>
                        );
                      }

                      const currentDateObj = new Date();
                      const currentMonthKey = currentDateObj.toISOString().substring(0, 7);
                      
                      const MONTH_NAMES_PT: { [key: string]: string } = {
                        '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
                        '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
                        '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
                      };

                      const currentMonthName = MONTH_NAMES_PT[currentMonthKey.split('-')[1]] || 'Julho';
                      const prevMonths = activeMonths.filter(m => m !== currentMonthKey).slice(-2).reverse();

                      const visibleScorers = showAllScorer ? cohort : cohort.slice(0, 5);

                      return (
                        <div className="space-y-4">
                          <div className="flex flex-col divide-y divide-gray-100">
                            {visibleScorers.map(({ player, currentPoints, playedThisMonth, avgPerMatch, expectedTotal, prob, odd }) => (
                              <div key={player.id} className="flex flex-col md:flex-row md:items-center justify-between py-4 px-4 hover:bg-slate-50 transition-all gap-4">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0 shadow-sm ${getPositionColor(player.position)}`}>
                                    {getPositionAbbr(player.position)}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <span className="block text-sm font-black text-gray-800 uppercase tracking-tight truncate">
                                      {player.nickname || player.name}
                                    </span>
                                    
                                    {/* Monthly scores summary */}
                                    <div className="flex flex-wrap gap-2 mt-1.5">
                                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase">
                                        Mês Atual: <strong className="text-slate-900 font-black">{currentPoints} pts</strong> ({playedThisMonth} j)
                                      </span>

                                      {prevMonths.map(m => {
                                        const pts = playerMonthlyPoints[player.id]?.[m] || 0;
                                        const monthLabel = MONTH_NAMES_PT[m.split('-')[1]] || m;
                                        return (
                                          <span key={m} className="bg-slate-50 text-gray-500 border border-slate-150 px-2 py-0.5 rounded-md text-[10px] font-medium">
                                            {monthLabel}: <strong className="text-gray-700 font-bold">{pts} pts</strong>
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>

                                {/* Projections, Probability and Bet Button */}
                                <div className="flex flex-wrap items-center gap-4 shrink-0 justify-between md:justify-end">
                                  <div className="text-left md:text-right">
                                    <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Projeção Final</div>
                                    <div className="text-xs font-black text-emerald-600">{expectedTotal.toFixed(1)} pts</div>
                                  </div>

                                  <div className="bg-slate-150/60 rounded-xl py-1 px-3 text-center min-w-[70px]">
                                    <span className="block text-[8px] font-bold text-gray-500 tracking-wider">CHANCE</span>
                                    <span className="text-xs font-black text-slate-800">{prob.toFixed(1)}%</span>
                                  </div>

                                  <button
                                    onClick={() => setSelectedBet({
                                      matchId: `longterm_scorer_${player.id}_${currentMonthKey}`,
                                      market: 'longTermMonthlyScorer',
                                      selection: player.id,
                                      odd: odd,
                                      matchInfo: `Maior Pontuador do Mês (${currentMonthName})`,
                                      selectedOutcome: `${player.nickname || player.name} para ser o Maior Pontuador`
                                    })}
                                    className="bg-slate-900 hover:bg-slate-850 text-white rounded-xl py-2 px-4 min-w-[100px] text-center transition-all cursor-pointer shadow-sm active:scale-95 flex flex-col items-center justify-center border border-slate-800"
                                  >
                                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">APOSTAR</span>
                                    <span className="text-xs font-black text-primary-yellow leading-none">@ {odd.toFixed(2)}</span>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          {cohort.length > 5 && (
                            <div className="pt-2 text-center border-t border-gray-50">
                              <button
                                onClick={() => setShowAllScorer(!showAllScorer)}
                                className="text-xs font-black uppercase tracking-wider text-primary-blue hover:text-blue-950 transition-all px-4 py-2 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-100 cursor-pointer"
                              >
                                {showAllScorer ? "Mostrar Menos ▲" : "Mostrar Mais ▼"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}

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
                    value={Math.min(1.00, bettingParams?.maxBetAmount || 1.00)}
                    readOnly
                    className="w-full pl-12 pr-4 py-3 bg-gray-100 border border-gray-200 rounded-xl font-bold text-gray-500 focus:outline-none cursor-not-allowed"
                  />
                </div>
                <div className="text-right text-xs font-bold text-gray-500 mt-2">
                  Retorno Potencial: <span className="text-emerald-500 font-black">R$ {(Math.min(1.00, bettingParams?.maxBetAmount || 1.00) * Number(selectedBet.odd)).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setSelectedBet(null)}
                  className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                {balance >= Math.min(1.00, bettingParams?.maxBetAmount || 1.00) ? (
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
