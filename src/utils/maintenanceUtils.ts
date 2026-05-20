import { db } from '../firebase';
import { doc, getDoc, writeBatch, collection, getDocs } from 'firebase/firestore';
import { Match, Player, ScoringRules } from '../types';
import { calculateMatchPoints } from './scoringEngine';
import { calculateGrade } from './gradeUtils';

const DEFAULT_RULES: ScoringRules = {
  id: 'scoring',
  win: 3,
  draw: 1,
  goal: 5,
  assist: 3,
  cleanSheet: 5,
  mvp: 10,
  updatedAt: Date.now()
};

export const recalculateAllPlayerStats = async () => {
  console.log('Starting global stats recalculation...');
  
  const matchesSnap = await getDocs(collection(db, 'matches'));
  const playersSnap = await getDocs(collection(db, 'players'));
  const rulesSnap = await getDoc(doc(db, 'settings', 'scoring'));
  
  const rules = rulesSnap.exists() ? rulesSnap.data() as ScoringRules : DEFAULT_RULES;
  const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
  
  const playerStatsMap: Record<string, Player['stats']> = {};
  players.forEach(p => {
    playerStatsMap[p.id] = { points: 0, goals: 0, assists: 0, wins: 0, matches: 0 };
  });
  
  const finishedMatches = matches.filter(m => m.status === 'finished');
  
  finishedMatches.forEach(match => {
    const results = calculateMatchPoints(
      match, 
      match.scoreA, 
      match.scoreB, 
      match.events || [], 
      match.mvpId || null, 
      players,
      rules
    );
    
    const winner = match.scoreA > match.scoreB ? 'A' : match.scoreB > match.scoreA ? 'B' : 'draw';
    
    const allInvolvedPlayerIds = [...new Set([...match.teamA, ...match.teamB])];
    allInvolvedPlayerIds.forEach(pid => {
      if (playerStatsMap[pid]) {
        playerStatsMap[pid].matches++;
        
        const isTeamA = match.teamA.includes(pid);
        const isWin = (winner === 'A' && isTeamA) || (winner === 'B' && !isTeamA);
        if (isWin) playerStatsMap[pid].wins++;
      }
    });
    
    results.forEach(res => {
      if (playerStatsMap[res.playerId]) {
        playerStatsMap[res.playerId].points += res.points;
      }
    });
    
    (match.events || []).forEach(evt => {
      if (playerStatsMap[evt.playerId]) {
        if (evt.type === 'goal') playerStatsMap[evt.playerId].goals++;
        if (evt.type === 'assist') playerStatsMap[evt.playerId].assists++;
      }
    });
  });
  
  console.log('Committing updates in chunks...');
  const CHUNK_SIZE = 450;
  for (let i = 0; i < players.length; i += CHUNK_SIZE) {
    const chunk = players.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    
    chunk.forEach(p => {
      const stats = playerStatsMap[p.id];
      const avgPoints = stats.points / (stats.matches || 1);
      const { grade } = calculateGrade(p.overallStats, avgPoints);
      
      batch.update(doc(db, 'players', p.id), { 
        stats,
        overallValue: parseInt(grade) || 75
      });
    });
    
    await batch.commit();
    console.log(`Committed chunk ${Math.floor(i / CHUNK_SIZE) + 1}`);
  }
  
  console.log(`Global stats recalculation complete. Processed ${finishedMatches.length} matches and ${players.length} players.`);
  return { matchesProcessed: finishedMatches.length, playersUpdated: players.length };
};

export const recalculateSpecificPlayerStats = async (playerIds: string[]) => {
  console.log(`Starting stats recalculation for ${playerIds.length} players...`);
  
  const matchesSnap = await getDocs(collection(db, 'matches'));
  const playersSnap = await getDocs(collection(db, 'players'));
  const rulesSnap = await getDoc(doc(db, 'settings', 'scoring'));
  
  const rules = rulesSnap.exists() ? rulesSnap.data() as ScoringRules : DEFAULT_RULES;
  const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
  
  // Only process requested players
  const playerStatsMap: Record<string, Player['stats']> = {};
  playerIds.forEach(pid => {
    playerStatsMap[pid] = { points: 0, goals: 0, assists: 0, wins: 0, matches: 0 };
  });

  const finishedMatches = matches.filter(m => m.status === 'finished');
  
  finishedMatches.forEach(match => {
    // Check if any of our requested players were involved
    const involvedInMatch = [...match.teamA, ...match.teamB].filter(pid => playerIds.includes(pid));
    if (involvedInMatch.length === 0) return;

    // Need ALL players to calculate points correctly (mvp determination)
    const allPlayers = playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
    
    const results = calculateMatchPoints(
      match, 
      match.scoreA, 
      match.scoreB, 
      match.events || [], 
      match.mvpId || null, 
      allPlayers,
      rules
    );
    
    const winner = match.scoreA > match.scoreB ? 'A' : match.scoreB > match.scoreA ? 'B' : 'draw';
    
    involvedInMatch.forEach(pid => {
      if (playerStatsMap[pid]) {
        playerStatsMap[pid].matches++;
        
        const isTeamA = match.teamA.includes(pid);
        const isWin = (winner === 'A' && isTeamA) || (winner === 'B' && !isTeamA);
        if (isWin) playerStatsMap[pid].wins++;
      }
    });
    
    results.filter(r => playerIds.includes(r.playerId)).forEach(res => {
      playerStatsMap[res.playerId].points += res.points;
    });
    
    (match.events || []).filter(e => playerIds.includes(e.playerId)).forEach(evt => {
      if (evt.type === 'goal') playerStatsMap[evt.playerId].goals++;
      if (evt.type === 'assist') playerStatsMap[evt.playerId].assists++;
    });
  });
  
  console.log('Committing specific player updates in chunks...');
  const CHUNK_SIZE = 450;
  for (let i = 0; i < playerIds.length; i += CHUNK_SIZE) {
    const chunkIds = playerIds.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    
    chunkIds.forEach(pid => {
      const stats = playerStatsMap[pid];
      const player = playersSnap.docs.find(d => d.id === pid)?.data() as Player;
      const avgPoints = stats.points / (stats.matches || 1);
      const { grade } = calculateGrade(player?.overallStats, avgPoints);
      
      batch.update(doc(db, 'players', pid), { 
        stats,
        overallValue: parseInt(grade) || 75
      });
    });
    
    await batch.commit();
    console.log(`Committed chunk ${Math.floor(i / CHUNK_SIZE) + 1}`);
  }
  
  console.log(`Calculation for ${playerIds.length} players complete.`);
};

export const cleanupLargeLogos = async () => {
  console.log('Searching for large logo definitions...');
  const locationsSnap = await getDocs(collection(db, 'locations'));
  const batch = writeBatch(db);
  let count = 0;

  locationsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.logoUrl && data.logoUrl.length > 1500) {
      console.log(`Found large logo in location: ${data.name || docSnap.id} (${data.logoUrl.length} bytes)`);
      batch.update(doc(db, 'locations', docSnap.id), { logoUrl: '' });
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
    console.log(`Successfully cleared ${count} large logo(s).`);
  } else {
    console.log('No large logos found.');
  }
  return { clearedCount: count };
};

export const clearAllPlayerPhotos = async () => {
  console.log('Starting global photo deletion...');
  const playersSnap = await getDocs(collection(db, 'players'));
  let updatedCount = 0;
  
  const CHUNK_SIZE = 450;
  const docs = playersSnap.docs;
  
  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    const chunk = docs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    let chunkCount = 0;
    
    chunk.forEach(docSnap => {
      const data = docSnap.data();
      if (data.photoUrl) {
        batch.update(doc(db, 'players', docSnap.id), { photoUrl: '' });
        chunkCount++;
      }
    });
    
    if (chunkCount > 0) {
      await batch.commit();
      updatedCount += chunkCount;
      console.log(`Committed photo deletion chunk ${Math.floor(i / CHUNK_SIZE) + 1}`);
    }
  }
  
  console.log(`Global photo deletion complete. ${updatedCount} players updated.`);
  return { updatedCount };
};
