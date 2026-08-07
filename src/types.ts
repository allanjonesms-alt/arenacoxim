export type Position = 'goleiro' | 'zagueiro' | 'lateral' | 'meio-campo' | 'centroavante';

export interface PlayerStats {
  wins: number;
  goals: number;
  assists: number;
  matches: number;
  points: number; // Custom points calculation
}

export interface OverallStats {
  ratings?: { [adminId: string]: number }; // adminId or monthly_YYYY-MM -> rating (50-100)
  monthlyEvaluations?: { [month: string]: { score: number; date: string } };
}

export interface Player {
  id: string;
  name: string;
  nickname: string;
  position: Position;
  locationId: string; // Associated location
  photoUrl?: string;
  cardBgUrl?: string; // Optional custom background image for the player card
  fontColor?: string; // Optional custom font color for the player card
  gmail?: string; // Player's Google email for authentication linkage
  phone?: string; // Player's phone/WhatsApp number
  stats: PlayerStats;
  overallStats?: OverallStats;
  overallValue?: number; // Calculated grade value for sorting
  birthDate?: string;
  bettingDisabled?: boolean;
}

export interface Match {
  id: string;
  date: string;
  time: string;
  locationId: string; // Associated location
  teamAId?: string; // Optional associated team entity
  teamBId?: string; // Optional associated team entity
  teamA: string[]; // Player IDs
  teamB: string[]; // Player IDs
  substitutesA?: string[]; // Player IDs
  substitutesB?: string[]; // Player IDs
  confirmedPlayers?: string[]; // Player IDs for those confirmed present but not necessarily assigned to teams yet
  goalkeeperAId?: string;
  goalkeeperBId?: string;
  scoreA: number;
  scoreB: number;
  substitutesCount?: number;
  status: 'scheduled' | 'live' | 'finished';
  mvpId?: string;
  events?: { playerId: string; type: 'goal' | 'assist' | 'own_goal' | 'penalty_save' | 'penalty_miss' }[];
  bettingMarkets?: {
    matchWinner?: {
      enabled: boolean;
      baseOddA: number;
      baseOddDraw: number;
      baseOddB: number;
    };
    playerGoals?: {
      enabled: boolean;
    };
    playerAssists?: {
      enabled: boolean;
    };
    matchGoals?: {
      enabled: boolean;
      options?: {
        line: string;
        probOver: string;
        probUnder: string;
        oddOver: string;
        oddUnder: string;
      }[];
    };
  };
  createdAt: number;
}

export interface Admin {
  id: string;
  name: string;
  email: string;
  phone?: string;
  locationId: string; // Associated location
  role: string;
  mustChangePassword?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface Team {
  id: string;
  name: string;
  locationId: string; // Associated location
  color: string;
  playerCount?: number; // Number of players for this team in a match
  logoUrl?: string; // Crest / Escudo base64 or URL
}

export interface Location {
  id: string;
  name: string;
  address?: string;
  logoUrl?: string;
  playerCount?: number; // Players per team in a match (e.g., 5 for 5x5)
  gameDuration?: number; // Duration in minutes
  allowSubstitutes?: boolean;
  substitutesCount?: number;
}

export interface AdminData {
  role: 'master' | 'admin';
  locationId: string | null;
  name?: string;
  email?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface ScoringRules {
  id: string;
  win: number;
  draw: number;
  goal: number;
  assist: number;
  cleanSheet: number;
  mvp: number;
  penaltySave?: number;
  penaltyMiss?: number;
  updatedAt: number;
}

export interface News {
  id: string;
  title: string;
  content: string;
  imageUrl: string;
  createdAt: number;
  date?: string;
  time?: string;
  link?: string;
}

export interface OddsEngineConfig {
  matchWinner?: {
    drawBaseProbability: number;
    drawDiffDenominator: number;
    amplificationPower: number;
    margin: number;
  };
  floatingOdds?: {
    enabled: boolean;
    liquidityFactor: number;
  };
  societyGoalFrequencyMultiplier: number;
  societyAssistFrequencyMultiplier: number;
  oneGoalMultiplier?: number;
  margins: {
    almostCertain: number;
    probable: number;
    medium: number;
    improbable: number;
    veryImprobable: number;
  };
  maxOdd: number;
  baseGoals: {
    centroavante: number;
    meioCampo: number;
    zagueiro: number;
    lateral: number;
    goleiro: number;
    default: number;
  };
  baseAssists: {
    centroavante: number;
    meioCampo: number;
    zagueiro: number;
    lateral: number;
    goleiro: number;
    default: number;
  };
}

export interface Card {
  id: string;
  name: string;
  imageUrl: string;
  fontColor?: string; // Optional custom font color for the card
  createdAt: number;
  isDefault?: boolean;
  increaseOverall?: number;
  description?: string; // How the athlete can receive the card
  expirationDate?: string; // Optional expiration date in YYYY-MM-DD
}

export type AwardCategory = 'ARTILHEIRO DO MÊS' | 'ASSISTENTE DO MÊS' | 'MELHOR GOLEIRO' | 'MELHOR DEFENSOR' | 'MELHOR LATERAL';

export interface MonthlyAward {
  id: string;
  month: string; // YYYY-MM
  locationId: string;
  category: AwardCategory;
  playerId: string;
  cardId: string; // ID of the Card to show
  createdAt: number;
}

export interface OddsSimulationHistory {
  id: string;
  timestamp: string;
  adminId: string;
  adminName: string;
  matchId?: string;
  matchDate?: string;
  teamAPower: string;
  teamBPower: string;
  volA: number;
  volDraw: number;
  volB: number;
  oddA: string;
  oddDraw: string;
  oddB: string;
}

export interface BoostedBetSubItem {
  betType: string;
  targetName: string;
  targetType?: 'player' | 'team' | 'other';
  requiredValue: string;
}

export interface BoostedBet {
  id?: string;
  title?: string;
  items?: BoostedBetSubItem[];
  betType: string;
  targetName: string;
  targetType?: 'player' | 'team' | 'other';
  targetId?: string;
  requiredValue: string;
  odd: number;
  displayText: string;
  active: boolean;
  status?: 'pending' | 'won' | 'lost';
  createdAt?: number;
}

export interface TournamentTeam {
  id: string;
  name: string;
  groupId?: string; // e.g., "A", "B"
  playerIds: string[]; // List of player IDs registered at this location
  logoUrl?: string; // Crest / Escudo base64 or URL
}

export interface TournamentMatchEvent {
  playerId: string;
  teamId?: string;
  type: 'goal' | 'assist' | 'own_goal' | 'penalty_save' | 'penalty_miss';
}

export interface TournamentMatch {
  id: string;
  stage: 'group' | 'playoff';
  groupId?: string;
  groupName?: string; // e.g., "Grupo A"
  roundName?: string; // e.g., "Quartas de Final", "Semifinal", "Final"
  roundIndex?: number;
  teamAId: string;
  teamBId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  scoreA?: number;
  scoreB?: number;
  penaltiesA?: number;
  penaltiesB?: number;
  status: 'scheduled' | 'live' | 'finished';
  mvpId?: string;
  events?: TournamentMatchEvent[];
  winnerTeamId?: string;
}

export interface TournamentGroup {
  id: string; // "A", "B", "C"
  name: string; // "Grupo A", "Grupo B"
}



export interface Tournament {
  id: string;
  name: string;
  locationId: string; // Associated Location ID
  status: 'planejamento' | 'em_andamento' | 'finalizado';
  format: 'GRUPOS' | 'PLAYOFFS' | 'GRUPOS_E_PLAYOFFS';
  groupMatchFormat?: 'NORMAL' | 'CRUZADO'; // NORMAL: times jogam dentro do grupo | CRUZADO: Grupo A enfrenta Grupo B
  groupsCount: number; // e.g. 1, 2, 4
  qualifiersPerGroup: number; // e.g. 2 teams qualify from each group
  teams: TournamentTeam[];
  groups: TournamentGroup[];
  matches: TournamentMatch[];
  createdAt: number;
  updatedAt?: number;
}

// --- CARTOLA ARENA FANTASY TYPES ---
export interface CartolaScoringRules {
  goal: number;         // default: 8.0
  assist: number;       // default: 5.0
  win: number;          // default: 3.0
  draw: number;         // default: 1.0
  cleanSheet: number;   // default: 5.0 (for Goalkeeper)
  yellowCard: number;   // default: -2.0
  redCard: number;      // default: -5.0
  ownGoal: number;      // default: -4.0
  mvpBonus: number;     // default: 5.0
}

export interface CartolaSettings {
  marketStatus: 'open' | 'closed';
  currentRound: number;
  seasonName: string;
  maxPlayersPerTeam: number; // default 8
  captainMultiplier: number; // default 1.5 or 2.0
  scoringRules: CartolaScoringRules;
  updatedAt?: number;
}

export interface CartolaUserTeam {
  id: string; // doc ID (e.g. userId or auto)
  userId: string;
  userName: string;
  userEmail?: string;
  userPhotoUrl?: string;
  teamName: string;
  badgeUrl?: string;
  badgeColor?: string;
  playerIds: string[]; // Up to 8 player IDs selected
  captainId?: string;  // Player ID of chosen captain
  totalPoints: number; // Sum of points
  roundScores?: { [roundNumber: string]: number };
  subscriptionExpiresAt?: number;
  subscriptionPaidAt?: number;
  subscriptionActive?: boolean;
  updatedAt: number;
  createdAt: number;
}

export interface CartolaPlayerRoundScore {
  playerId: string;
  roundNumber: number;
  matchCount: number;
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  cleanSheets: number;
  mvps: number;
  points: number;
}


