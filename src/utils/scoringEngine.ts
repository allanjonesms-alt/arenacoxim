import { Player, Match } from '../types';

export interface MatchEvent {
  playerId: string;
  type: 'goal' | 'assist';
}

export interface PlayerScoreResult {
  playerId: string;
  points: number;
  breakdown: {
    result: number;
    goals: number;
    assists: number;
    goalkeeperBonus: number;
    cleanSheet: number;
    goalDifference: number;
    mvp: number;
  };
}

export const calculateMatchPoints = (
  match: Match,
  scoreA: number,
  scoreB: number,
  events: MatchEvent[],
  mvpId: string | null,
  players: Player[]
): PlayerScoreResult[] => {
  const results: PlayerScoreResult[] = [];
  const winner = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'draw';
  const gd = Math.abs(scoreA - scoreB);

  const allMatchPlayerIds = [...match.teamA, ...match.teamB];

  allMatchPlayerIds.forEach(pid => {
    const player = players.find(p => p.id === pid);
    if (!player) return;

    const isTeamA = match.teamA.includes(pid);
    const isWin = (winner === 'A' && isTeamA) || (winner === 'B' && !isTeamA);
    const isDraw = winner === 'draw';
    const isLoss = !isWin && !isDraw;

    const goalsScored = events.filter(e => e.playerId === pid && e.type === 'goal').length;
    const assistsMade = events.filter(e => e.playerId === pid && e.type === 'assist').length;
    
    const teamGoalsScored = isTeamA ? scoreA : scoreB;
    const teamGoalsConceded = isTeamA ? scoreB : scoreA;

    // 1. Result Points
    let resultPoints = 0;
    if (isWin) resultPoints = 3;
    else if (isDraw) resultPoints = 1;

    // 2. Participation Points
    const goalPoints = goalsScored * 2;
    const assistPoints = assistsMade * 1;

    // 3. Goalkeeper Points
    let goalkeeperBonus = 0;
    let cleanSheetPoints = 0;

    if (player.position === 'goleiro') {
      // Clean Sheet
      if (teamGoalsConceded === 0) {
        cleanSheetPoints = 3;
      }

      // Initial Bonus + Win Formula
      // "Todo goleiro começa a partida com +3 pontos de bônus"
      // "Se o time vencer a partida, aplica-se a seguinte fórmula: Pontuação final do bônus = 3 − gols sofridos"
      if (isWin) {
        goalkeeperBonus = 3 - teamGoalsConceded;
      } else {
        // If they didn't win, do they keep the +3? 
        // The rule says "Todo goleiro começa a partida com +3 pontos de bônus"
        // Usually this means it's a starting value.
        // If they lose/draw, maybe it stays 3? Or maybe it's only for winners?
        // Let's assume it's 3 for everyone, but winners get the formula.
        // Wait, "Vitória sofrendo 5 gols: -2". This implies the bonus can become negative.
        // If they lose 0-5, do they get +3? That would be unfair.
        // I'll assume the bonus is 3 for everyone, but for winners it's 3 - conceded.
        // Actually, let's check if there's a penalty for conceded goals for losers.
        // The prompt says: "Se o time vencer a partida, aplica-se a seguinte fórmula: Pontuação final do bônus = 3 − gols sofridos"
        // I will stick to: 3 for non-winners, (3 - conceded) for winners.
        goalkeeperBonus = 3; 
      }
    }

    // 4. Goal Difference Bonus
    let gdPoints = 0;
    if (isWin) {
      gdPoints = gd;
    } else if (isLoss) {
      gdPoints = -gd;
    }

    results.push({
      playerId: pid,
      points: 0, // Will sum below
      breakdown: {
        result: resultPoints,
        goals: goalPoints,
        assists: assistPoints,
        goalkeeperBonus,
        cleanSheet: cleanSheetPoints,
        goalDifference: gdPoints,
        mvp: 0 // Will set after calculating all base points
      }
    });
  });

  // Calculate base points for MVP determination
  results.forEach(r => {
    r.points = Object.values(r.breakdown).reduce((a, b) => a + b, 0);
  });

  // 5. MVP (Craque da Partida)
  // If mvpId is provided manually, use it. 
  // If not, we could calculate it, but the prompt says "Ao final da partida será definido o Craque do Jogo."
  // And "O jogador com maior pontuação total na partida recebe: +2 pontos de bônus"
  // This implies we should find the one with the highest points.
  
  let finalMvpId = mvpId;
  if (!finalMvpId) {
    const sortedForMvp = [...results].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      
      const playerA = players.find(p => p.id === a.playerId)!;
      const playerB = players.find(p => p.id === b.playerId)!;
      
      // Tie-breaker 1: Winner
      const isWinA = a.breakdown.result === 3;
      const isWinB = b.breakdown.result === 3;
      if (isWinA && !isWinB) return -1;
      if (!isWinA && isWinB) return 1;
      
      // Tie-breaker 2: Season Avg (stats.points / stats.matches)
      const avgA = (playerA.stats.points || 0) / (playerA.stats.matches || 1);
      const avgB = (playerB.stats.points || 0) / (playerB.stats.matches || 1);
      if (avgB !== avgA) return avgB - avgA;
      
      // Tie-breaker 3: Lower Overall
      const overallA = calculateOverall(playerA);
      const overallB = calculateOverall(playerB);
      return overallA - overallB;
    });
    
    if (sortedForMvp.length > 0) {
      finalMvpId = sortedForMvp[0].playerId;
    }
  }

  if (finalMvpId) {
    const mvpResult = results.find(r => r.playerId === finalMvpId);
    if (mvpResult) {
      mvpResult.breakdown.mvp = 2;
      mvpResult.points += 2;
    }
  }

  return results;
};

const calculateOverall = (player: Player): number => {
  if (!player.overallStats) return 0;
  const stats = player.overallStats;
  return (stats.speed + stats.stamina + stats.strength + stats.shooting + stats.dribbling + stats.passing) / 6;
};
