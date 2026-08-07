import { Player, Match, CartolaScoringRules, CartolaUserTeam } from '../types';

export const DEFAULT_CARTOLA_SCORING_RULES: CartolaScoringRules = {
  goal: 8.0,
  assist: 5.0,
  win: 3.0,
  draw: 1.0,
  cleanSheet: 5.0,
  yellowCard: -2.0,
  redCard: -5.0,
  ownGoal: -4.0,
  mvpBonus: 5.0,
};

export const DEFAULT_CARTOLA_SETTINGS = {
  marketStatus: 'open' as const,
  currentRound: 1,
  seasonName: 'Temporada 2026',
  maxPlayersPerTeam: 8,
  captainMultiplier: 1.5,
  scoringRules: DEFAULT_CARTOLA_SCORING_RULES,
};

/**
 * Calculates Cartola fantasy points earned by a player in a specific finished match.
 */
export function calculatePlayerMatchCartolaPoints(
  player: Player,
  match: Match,
  rules: CartolaScoringRules = DEFAULT_CARTOLA_SCORING_RULES
): {
  points: number;
  goals: number;
  assists: number;
  ownGoals: number;
  isWin: boolean;
  isDraw: boolean;
  cleanSheet: boolean;
  isMvp: boolean;
} {
  if (match.status !== 'finished') {
    return {
      points: 0,
      goals: 0,
      assists: 0,
      ownGoals: 0,
      isWin: false,
      isDraw: false,
      cleanSheet: false,
      isMvp: false,
    };
  }

  const pId = player.id;
  const inTeamA = match.teamA?.includes(pId) || match.substitutesA?.includes(pId);
  const inTeamB = match.teamB?.includes(pId) || match.substitutesB?.includes(pId);

  if (!inTeamA && !inTeamB) {
    return {
      points: 0,
      goals: 0,
      assists: 0,
      ownGoals: 0,
      isWin: false,
      isDraw: false,
      cleanSheet: false,
      isMvp: false,
    };
  }

  let goals = 0;
  let assists = 0;
  let ownGoals = 0;

  if (match.events && Array.isArray(match.events)) {
    match.events.forEach(ev => {
      if (ev.playerId === pId) {
        if (ev.type === 'goal') goals++;
        if (ev.type === 'assist') assists++;
        if (ev.type === 'own_goal') ownGoals++;
      }
    });
  }

  const playerTeamScore = inTeamA ? match.scoreA : match.scoreB;
  const opponentScore = inTeamA ? match.scoreB : match.scoreA;

  const isWin = playerTeamScore > opponentScore;
  const isDraw = playerTeamScore === opponentScore;

  // Clean sheet (SG): Goalkeeper or defender whose team conceded 0 goals
  const isGoalkeeper = player.position === 'goleiro' || match.goalkeeperAId === pId || match.goalkeeperBId === pId;
  const cleanSheet = (isGoalkeeper || player.position === 'zagueiro' || player.position === 'lateral') && opponentScore === 0;

  // MVP
  const isMvp = match.mvpId === pId;

  // Calculate points sum
  let pts = 0;
  pts += goals * (rules.goal ?? 8.0);
  pts += assists * (rules.assist ?? 5.0);
  pts += ownGoals * (rules.ownGoal ?? -4.0);

  if (isWin) pts += (rules.win ?? 3.0);
  else if (isDraw) pts += (rules.draw ?? 1.0);

  if (cleanSheet) pts += (rules.cleanSheet ?? 5.0);
  if (isMvp) pts += (rules.mvpBonus ?? 5.0);

  return {
    points: Number(pts.toFixed(1)),
    goals,
    assists,
    ownGoals,
    isWin,
    isDraw,
    cleanSheet,
    isMvp,
  };
}

/**
 * Calculates total Cartola points for a player across all given matches.
 */
export function calculatePlayerAllCartolaPoints(
  player: Player,
  matches: Match[],
  rules: CartolaScoringRules = DEFAULT_CARTOLA_SCORING_RULES
): {
  totalPoints: number;
  matchCount: number;
  totalGoals: number;
  totalAssists: number;
  cleanSheets: number;
  mvpCount: number;
} {
  let totalPoints = 0;
  let matchCount = 0;
  let totalGoals = 0;
  let totalAssists = 0;
  let cleanSheets = 0;
  let mvpCount = 0;

  matches.forEach(m => {
    if (m.status !== 'finished') return;
    const res = calculatePlayerMatchCartolaPoints(player, m, rules);
    if (res.isWin || res.isDraw || res.goals > 0 || res.assists > 0 || res.points !== 0) {
      matchCount++;
      totalPoints += res.points;
      totalGoals += res.goals;
      totalAssists += res.assists;
      if (res.cleanSheet) cleanSheets++;
      if (res.isMvp) mvpCount++;
    }
  });

  return {
    totalPoints: Number(totalPoints.toFixed(1)),
    matchCount,
    totalGoals,
    totalAssists,
    cleanSheets,
    mvpCount,
  };
}

/**
 * Calculates total score for a user's Cartola fantasy team based on chosen players' fantasy points.
 */
export function calculateTeamPoints(
  team: CartolaUserTeam,
  playerPointsMap: Record<string, number>,
  captainMultiplier: number = 1.5
): {
  totalTeamPoints: number;
  playerBreakdown: { playerId: string; basePoints: number; finalPoints: number; isCaptain: boolean }[];
} {
  let totalTeamPoints = 0;
  const playerBreakdown: { playerId: string; basePoints: number; finalPoints: number; isCaptain: boolean }[] = [];

  (team.playerIds || []).forEach(pId => {
    const basePts = playerPointsMap[pId] || 0;
    const isCaptain = team.captainId === pId;
    const finalPts = isCaptain ? Number((basePts * captainMultiplier).toFixed(1)) : basePts;

    playerBreakdown.push({
      playerId: pId,
      basePoints: basePts,
      finalPoints: finalPts,
      isCaptain,
    });

    totalTeamPoints += finalPts;
  });

  return {
    totalTeamPoints: Number(totalTeamPoints.toFixed(1)),
    playerBreakdown,
  };
}
