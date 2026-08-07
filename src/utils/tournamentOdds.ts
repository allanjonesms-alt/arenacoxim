import { Tournament, TournamentTeam, Player, Card, Match } from '../types';
import { getPlayerFinalOverall } from './playerUtils';

export interface CalculatedTeamChampionOdds {
  teamId: string;
  teamName: string;
  groupId: string;
  groupName: string;
  logoUrl?: string;
  power: number;                   // Média de overall do time (ajustado por resultados)
  groupRivalAvgPower: number;      // Média de força dos rivais do mesmo grupo
  groupDifficulty: 'Baixa' | 'Média' | 'Alta' | 'Muito Alta';
  qualifyProbability: number;      // Probabilidade (0 a 1) de se classificar entre os 2 primeiros do grupo
  qualifyProbPercent: string;      // Ex: "72.4%"
  semiFinalDifficulty: 'Favorável' | 'Neutro' | 'Desfavorável';
  semiFinalOpponentPower: number;  // Força esperada do adversário na semifinal
  championProbability: number;     // Probabilidade final de ser campeão
  championProbPercent: string;     // Ex: "28.5%"
  odd: string;                     // Ex: "2.85"
  rawOdd: number;                  // Ex: 2.85
  matchesPlayed?: number;          // Partidas concluídas
  points?: number;                 // Pontos no torneio
  betVolume?: number;              // Volume total de apostas na equipe
}

/**
 * Calcula as odds flutuantes para o Campeão do Torneio.
 * Considera:
 * 1. Power (força total/média) de cada equipe.
 * 2. Desempenho flutuante real em partidas concluídas (Vitórias/Empates/Derrotas/Gols).
 * 3. Volume de apostas realizadas nas equipes (ajuste dinâmico por fluxo de mercado).
 * 4. Margem da casa de 35% (houseMargin = 0.35) garantindo lucro da banca.
 */
export function calculateTournamentChampionOdds(
  tournament: Tournament | null,
  allPlayers: Player[],
  allCards: Card[] = [],
  houseMargin: number = 0.35, // 35% de margem de lucro da banca
  matches: Match[] = [],
  allBets: any[] = []
): CalculatedTeamChampionOdds[] {
  let teams: TournamentTeam[] = tournament?.teams || [];

  // Se não houver times no torneio cadastrado, gera 6 equipes padrão do Torneio ACS 2026
  if (!teams || teams.length === 0) {
    teams = [
      { id: 'team_acs_1', name: 'Amigos do Coxim FC', groupId: 'A', playerIds: [] },
      { id: 'team_acs_2', name: 'Real Pantanal', groupId: 'A', playerIds: [] },
      { id: 'team_acs_3', name: 'Inter Taquari', groupId: 'A', playerIds: [] },
      { id: 'team_acs_4', name: 'Atlético Coxinense', groupId: 'B', playerIds: [] },
      { id: 'team_acs_5', name: 'União Arena', groupId: 'B', playerIds: [] },
      { id: 'team_acs_6', name: 'Sport Piraputanga', groupId: 'B', playerIds: [] },
    ];
  }

  const playerMap = new Map<string, Player>(allPlayers.map(p => [p.id, p]));

  // A) Cálculo de desempenho em partidas concluídas do torneio
  const finishedMatches = (matches || []).filter(m => m.status === 'finished' || (m.scoreA !== undefined && m.scoreB !== undefined));

  const teamPerfMap = new Map<string, { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; points: number }>();
  teams.forEach(t => {
    teamPerfMap.set(t.id, { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 });
  });

  finishedMatches.forEach(m => {
    let teamAId = m.teamAId;
    let teamBId = m.teamBId;

    // Fallback: se a partida não tiver ID direto de equipe, verifica a composição do elenco
    if (!teamAId || !teamBId) {
      teams.forEach(t => {
        if (t.playerIds && t.playerIds.length > 0) {
          const overlapA = m.teamA?.filter(pId => t.playerIds.includes(pId)).length || 0;
          const overlapB = m.teamB?.filter(pId => t.playerIds.includes(pId)).length || 0;
          if (overlapA > overlapB && overlapA >= 2) teamAId = t.id;
          else if (overlapB > overlapA && overlapB >= 2) teamBId = t.id;
        }
      });
    }

    if (teamAId && teamPerfMap.has(teamAId)) {
      const statsA = teamPerfMap.get(teamAId)!;
      statsA.played += 1;
      statsA.goalsFor += m.scoreA || 0;
      statsA.goalsAgainst += m.scoreB || 0;
      if (m.scoreA > m.scoreB) { statsA.wins += 1; statsA.points += 3; }
      else if (m.scoreA === m.scoreB) { statsA.draws += 1; statsA.points += 1; }
      else { statsA.losses += 1; }
    }

    if (teamBId && teamPerfMap.has(teamBId)) {
      const statsB = teamPerfMap.get(teamBId)!;
      statsB.played += 1;
      statsB.goalsFor += m.scoreB || 0;
      statsB.goalsAgainst += m.scoreA || 0;
      if (m.scoreB > m.scoreA) { statsB.wins += 1; statsB.points += 3; }
      else if (m.scoreB === m.scoreA) { statsB.draws += 1; statsB.points += 1; }
      else { statsB.losses += 1; }
    }
  });

  // B) Volume de apostas por equipe para calibrar o mercado flutuante
  const teamBetVolumeMap = new Map<string, number>();
  let totalBetVolume = 0;

  (allBets || []).forEach(b => {
    if (b.status !== 'cancelled' && (b.market === 'longTermTournamentChampion' || b.selectedOutcome?.includes('Campeão:'))) {
      const sel = String(b.selection || '').toLowerCase();
      const amount = Number(b.amount || b.betAmount || 1) || 1;
      
      const matchedTeam = teams.find(t => t.name.toLowerCase() === sel || sel.includes(t.name.toLowerCase()) || t.id === b.selection);
      if (matchedTeam) {
        const current = teamBetVolumeMap.get(matchedTeam.id) || 0;
        teamBetVolumeMap.set(matchedTeam.id, current + amount);
        totalBetVolume += amount;
      }
    }
  });

  // 1. Cálculo da Força (Power) de cada Equipe com ajuste flutuante por resultados
  const teamPowers = teams.map((team, idx) => {
    let sumOverall = 0;
    let count = 0;

    if (team.playerIds && team.playerIds.length > 0) {
      team.playerIds.forEach(pId => {
        const p = playerMap.get(pId);
        if (p) {
          sumOverall += getPlayerFinalOverall(p, allCards);
          count++;
        }
      });
    }

    const baseOverall = count > 0 
      ? (sumOverall / count) 
      : (75 + (idx % 3) * 2 - Math.floor(idx / 3) * 1.5);

    // Ajuste flutuante no Power baseado no aproveitamento dos jogos encerrados
    const perf = teamPerfMap.get(team.id);
    let resultPowerModifier = 0;
    if (perf && perf.played > 0) {
      const ppm = perf.points / perf.played; // Pontos por jogo (0 a 3)
      const gdpm = (perf.goalsFor - perf.goalsAgainst) / perf.played; // Saldo de gols por jogo
      resultPowerModifier = (ppm - 1.25) * 3.5 + (gdpm * 1.2);
    }

    const effectivePower = Math.max(50, Math.min(99, baseOverall + resultPowerModifier));

    return {
      team,
      power: Number(effectivePower.toFixed(1)),
      perf
    };
  });

  // Mapear equipes por Grupo (ex: Grupo A e Grupo B)
  const groupsMap = new Map<string, typeof teamPowers>();
  teamPowers.forEach(tp => {
    const gId = tp.team.groupId || 'A';
    if (!groupsMap.has(gId)) groupsMap.set(gId, []);
    groupsMap.get(gId)!.push(tp);
  });

  // Identifica a equipe com maior Power no torneio
  const sortedOverall = [...teamPowers].sort((a, b) => b.power - a.power);
  const overallTopTeam = sortedOverall[0] || teamPowers[0];

  const qualifiersPerGroup = tournament?.qualifiersPerGroup || 2;

  // 2. Cálculo da Dificuldade de Classificação e Caminho na Semifinal
  const rawProbabilities = teamPowers.map(tp => {
    const gId = tp.team.groupId || 'A';
    const groupMembers = groupsMap.get(gId) || [tp];
    const rivalsInGroup = groupMembers.filter(m => m.team.id !== tp.team.id);

    const groupRivalAvgPower = rivalsInGroup.length > 0
      ? rivalsInGroup.reduce((acc, r) => acc + r.power, 0) / rivalsInGroup.length
      : tp.power;

    const powerDiffGroup = tp.power - groupRivalAvgPower;

    const baseGroupRatio = qualifiersPerGroup / Math.max(groupMembers.length, qualifiersPerGroup);
    let qualifyProb = baseGroupRatio + (powerDiffGroup * 0.048);
    qualifyProb = Math.min(0.95, Math.max(0.18, qualifyProb));

    let groupDifficulty: 'Baixa' | 'Média' | 'Alta' | 'Muito Alta' = 'Média';
    if (groupRivalAvgPower >= 78) groupDifficulty = 'Muito Alta';
    else if (groupRivalAvgPower >= 75) groupDifficulty = 'Alta';
    else if (groupRivalAvgPower >= 72) groupDifficulty = 'Média';
    else groupDifficulty = 'Baixa';

    // 3. Probabilidade do Cruzamento na Semifinal
    const otherGroupIds = Array.from(groupsMap.keys()).filter(id => id !== gId);
    const oppositeGroupId = otherGroupIds[0] || gId;
    const oppositeGroupTeams = groupsMap.get(oppositeGroupId) || [];

    const isTopTeamInOppositeGroup = oppositeGroupTeams.some(m => m.team.id === overallTopTeam.team.id);

    let semiFinalOpponentPower = oppositeGroupTeams.length > 0
      ? oppositeGroupTeams.reduce((acc, r) => acc + r.power, 0) / oppositeGroupTeams.length
      : tp.power;

    if (isTopTeamInOppositeGroup && tp.team.id !== overallTopTeam.team.id) {
      semiFinalOpponentPower = Math.max(semiFinalOpponentPower, overallTopTeam.power * 0.96);
    }

    const semiPowerDiff = tp.power - semiFinalOpponentPower;
    const semiWinProb = Math.min(0.90, Math.max(0.12, 0.50 + (semiPowerDiff * 0.052)));

    const allRivalsInTournament = teamPowers.filter(m => m.team.id !== tp.team.id);
    const tournamentAvgPower = allRivalsInTournament.length > 0
      ? allRivalsInTournament.reduce((acc, r) => acc + r.power, 0) / allRivalsInTournament.length
      : tp.power;

    const finalPowerDiff = tp.power - tournamentAvgPower;
    const finalWinProb = Math.min(0.90, Math.max(0.12, 0.50 + (finalPowerDiff * 0.050)));

    let rawChampionProb = qualifyProb * semiWinProb * finalWinProb;

    // Multiplicador direto por resultados de pontuação na fase de grupos
    if (tp.perf && tp.perf.played > 0) {
      const pointsEfficiency = tp.perf.points / (tp.perf.played * 3);
      rawChampionProb *= (0.75 + pointsEfficiency * 0.5);
    }

    let semiFinalDifficulty: 'Favorável' | 'Neutro' | 'Desfavorável' = 'Neutro';
    if (semiPowerDiff >= 1.8) semiFinalDifficulty = 'Favorável';
    else if (semiPowerDiff <= -1.8) semiFinalDifficulty = 'Desfavorável';

    return {
      teamId: tp.team.id,
      teamName: tp.team.name,
      groupId: gId,
      groupName: `Grupo ${gId}`,
      logoUrl: tp.team.logoUrl,
      power: tp.power,
      groupRivalAvgPower: Number(groupRivalAvgPower.toFixed(1)),
      groupDifficulty,
      qualifyProbability: qualifyProb,
      qualifyProbPercent: `${(qualifyProb * 100).toFixed(1)}%`,
      semiFinalDifficulty,
      semiFinalOpponentPower: Number(semiFinalOpponentPower.toFixed(1)),
      rawChampionProb,
      perf: tp.perf,
      betVolume: teamBetVolumeMap.get(tp.team.id) || 0
    };
  });

  // 4. Normalização e Calibração por Volume de Apostas (Parimutuel Balancing)
  const sumRawProbs = rawProbabilities.reduce((acc, p) => acc + p.rawChampionProb, 0) || 1;

  // Fator de pagamento da casa com 35% de margem garantida (houseMargin = 0.35 => payoutFactor = 0.65)
  const payoutFactor = Math.max(0.40, 1 - houseMargin);

  const result: CalculatedTeamChampionOdds[] = rawProbabilities.map(p => {
    let normalizedChampionProb = p.rawChampionProb / sumRawProbs;

    // Se houver volume de apostas registrado no mercado, equilibra probabilidade técnica com fluxo de apostas
    if (totalBetVolume > 0) {
      const betShare = (p.betVolume || 0) / totalBetVolume;
      const marketWeight = Math.min(0.35, Math.max(0.08, totalBetVolume / 80));
      normalizedChampionProb = ((1 - marketWeight) * normalizedChampionProb) + (marketWeight * betShare);
    }

    normalizedChampionProb = Math.max(0.01, Math.min(0.95, normalizedChampionProb));

    // Fórmula da Odd com a margem da banca de 35%
    let rawOdd = payoutFactor / normalizedChampionProb;

    // Limites de segurança para odds
    rawOdd = Math.min(30.0, Math.max(1.10, rawOdd));

    return {
      teamId: p.teamId,
      teamName: p.teamName,
      groupId: p.groupId,
      groupName: p.groupName,
      logoUrl: p.logoUrl,
      power: p.power,
      groupRivalAvgPower: p.groupRivalAvgPower,
      groupDifficulty: p.groupDifficulty,
      qualifyProbability: p.qualifyProbability,
      qualifyProbPercent: p.qualifyProbPercent,
      semiFinalDifficulty: p.semiFinalDifficulty,
      semiFinalOpponentPower: p.semiFinalOpponentPower,
      championProbability: normalizedChampionProb,
      championProbPercent: `${(normalizedChampionProb * 100).toFixed(1)}%`,
      odd: rawOdd.toFixed(2),
      rawOdd,
      matchesPlayed: p.perf?.played || 0,
      points: p.perf?.points || 0,
      betVolume: p.betVolume || 0
    };
  });

  // Ordena por favorito (menor odd / maior chance de título)
  result.sort((a, b) => a.rawOdd - b.rawOdd);

  return result;
}

