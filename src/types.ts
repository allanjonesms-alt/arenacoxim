export type Position = 'goleiro' | 'zagueiro' | 'lateral' | 'meio-campo' | 'centroavante';

export interface PlayerStats {
  wins: number;
  goals: number;
  assists: number;
  matches: number;
  points: number; // Custom points calculation
}

export interface OverallStats {
  ratings?: { [adminId: string]: number }; // adminId -> rating (50-100)
}

export interface Player {
  id: string;
  name: string;
  nickname: string;
  position: Position;
  locationId: string; // Associated location
  photoUrl?: string;
  stats: PlayerStats;
  overallStats?: OverallStats;
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
  events?: { playerId: string; type: 'goal' | 'assist' }[];
  createdAt: number;
}

export interface Admin {
  id: string;
  name: string;
  email: string;
  locationId: string; // Associated location
  role: string;
  createdAt: number;
  updatedAt?: number;
}

export interface Team {
  id: string;
  name: string;
  locationId: string; // Associated location
  color: string;
  playerCount?: number; // Number of players for this team in a match
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
}

export interface ScoringRules {
  id: string;
  win: number;
  draw: number;
  goal: number;
  assist: number;
  cleanSheet: number;
  mvp: number;
  updatedAt: number;
}
