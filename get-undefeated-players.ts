import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || 'arenacoxim2');

async function run() {
  const playersRef = collection(db, 'players');
  const playersSnap = await getDocs(playersRef);
  
  const matchesRef = collection(db, 'matches');
  const matchesSnap = await getDocs(matchesRef);
  const matches = [];
  matchesSnap.forEach(doc => {
    if (doc.data().status === 'finished') {
      matches.push({ id: doc.id, ...doc.data() });
    }
  });

  const undefeated = [];
  
  playersSnap.forEach(doc => {
    const data = doc.data();
    let matchesPlayed = 0;
    let wins = 0;
    let draws = 0;
    let defeats = 0;

    matches.forEach(m => {
      const isTeamA = (m.teamA || []).includes(doc.id);
      const isTeamB = (m.teamB || []).includes(doc.id);
      const isSubA = (m.substitutesA || []).includes(doc.id);
      const isSubB = (m.substitutesB || []).includes(doc.id);

      if (isTeamA || isTeamB || isSubA || isSubB) {
        matchesPlayed++;
        
        let myTeam = isTeamA || isSubA ? 'A' : 'B';
        let winner = m.scoreA > m.scoreB ? 'A' : m.scoreB > m.scoreA ? 'B' : 'draw';
        
        if (winner === myTeam) {
          wins++;
        } else if (winner === 'draw') {
          draws++;
        } else {
          defeats++;
        }
      }
    });
    
    if (matchesPlayed > 5 && defeats === 0) {
        undefeated.push({
          name: data.nickname || data.name,
          matches: matchesPlayed,
          wins,
          draws,
          defeats
        });
    }
  });
  
  undefeated.sort((a, b) => b.matches - a.matches);
  
  console.log("=== Jogadores Invictos (> 5 jogos) ===");
  if (undefeated.length === 0) {
    console.log("Nenhum jogador encontrado com mais de 5 partidas e 0 derrotas.");
  } else {
    undefeated.forEach((z, i) => {
      console.log(`${i+1}. ${z.name}: ${z.matches} jogos (${z.wins}V, ${z.draws}E, ${z.defeats}D)`);
    });
  }
  
  process.exit(0);
}
run().catch(console.error);
