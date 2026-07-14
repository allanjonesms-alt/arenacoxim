import { Player, Match, ScoringRules } from '../types';
import { calculateAverage } from './gradeUtils';

export interface MatchEvent {
  playerId: string;
  type: 'goal' | 'assist' | 'own_goal' | 'penalty_save' | 'penalty_miss';
}

export interface PlayerScoreResult {
  playerId: string;
  points: number;
  breakdown: {
    result: number;
    goals: number;
    goalsCount: number;
    assists: number;
    assistsCount: number;
    ownGoals: number;
    ownGoalsCount: number;
    goalkeeperBonus: number;
    penaltyMiss: number;
    penaltyMissCount: number;
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
  players: Player[],
  rules: ScoringRules
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

    const goalsScored = events ? events.filter(e => e.playerId === pid && e.type === 'goal').length : 0;
    const assistsMade = events ? events.filter(e => e.playerId === pid && e.type === 'assist').length : 0;
    const ownGoalsCommitted = events ? events.filter(e => e.playerId === pid && e.type === 'own_goal').length : 0;
    const penaltySaves = events ? events.filter(e => e.playerId === pid && e.type === 'penalty_save').length : 0;
    const penaltyMisses = events ? events.filter(e => e.playerId === pid && e.type === 'penalty_miss').length : 0;
    
    const teamGoalsScored = isTeamA ? scoreA : scoreB;
    const teamGoalsConceded = isTeamA ? scoreB : scoreA;

    // 1. Result Points
    let resultPoints = 0;
    const isSubstitute = (match.substitutesA?.includes(pid) || match.substitutesB?.includes(pid));
    
    if (!isSubstitute) {
      if (isWin) resultPoints = rules.win;
      else if (isDraw) resultPoints = rules.draw;
    }

    // 2. Participation Points
    const goalPoints = goalsScored * rules.goal;
    const assistPoints = assistsMade * rules.assist;
    const ownGoalPoints = ownGoalsCommitted * -3; // 3 points per own goal

    // 3. Goalkeeper/Defender Points
    let cleanSheetPoints = 0;
    let gdPoints = 0;
    const positionLower = (player.position || '').toLowerCase();
    const isEscaladoGoalkeeper = (isTeamA && match.goalkeeperAId === pid) || (!isTeamA && match.goalkeeperBId === pid);
    
    const penaltySavePoints = isEscaladoGoalkeeper ? penaltySaves * (rules.penaltySave !== undefined ? rules.penaltySave : 5) : 0;
    const penaltyMissPoints = penaltyMisses * -(rules.penaltyMiss !== undefined ? rules.penaltyMiss : 5);

    if (!isSubstitute) {
      const isDefensive = ['zagueiro', 'lateral'].includes(positionLower);

      if (isEscaladoGoalkeeper) {
        // Clean Sheet: starts with 7 points, reduced by each goal conceded
        cleanSheetPoints = Math.max(0, 7 - teamGoalsConceded);
      } else if (isDefensive) {
        // Clean Sheet for other defenders: starts with rules.cleanSheet (typically 5), reduced by each goal conceded
        cleanSheetPoints = Math.max(0, rules.cleanSheet - teamGoalsConceded);
      }

      // 4. Goal Difference Bonus
      if (isWin) {
        gdPoints = gd;
      } else if (isLoss) {
        gdPoints = -gd;
      }
    }

    results.push({
      playerId: pid,
      points: 0, // Will sum below
      breakdown: {
        result: resultPoints,
        goals: goalPoints,
        goalsCount: goalsScored,
        assists: assistPoints,
        assistsCount: assistsMade,
        ownGoals: ownGoalPoints,
        ownGoalsCount: ownGoalsCommitted,
        goalkeeperBonus: penaltySavePoints,
        penaltyMiss: penaltyMissPoints,
        penaltyMissCount: penaltyMisses,
        cleanSheet: cleanSheetPoints,
        goalDifference: gdPoints,
        mvp: 0 // Will set after calculating all base points
      }
    });
  });

  // Calculate base points for MVP determination
  results.forEach(r => {
    r.points = r.breakdown.result + r.breakdown.goals + r.breakdown.assists + r.breakdown.ownGoals + r.breakdown.goalkeeperBonus + r.breakdown.penaltyMiss + r.breakdown.cleanSheet + r.breakdown.goalDifference + r.breakdown.mvp;
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
      mvpResult.breakdown.mvp = rules.mvp;
      mvpResult.points += rules.mvp;
    }
  }

  return results;
};

const calculateOverall = (player: Player): number => {
  return calculateAverage(player.overallStats);
};
