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

  const zagueiros = [];
  
  playersSnap.forEach(doc => {
    const data = doc.data();
    if (data.position && data.position.toLowerCase() === 'zagueiro') {
      let matchesPlayed = 0;
      let wins = 0;
      let draws = 0;

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
          }
        }
      });
      
      let aproveitamento = 0;
      let totalPoints = (wins * 3) + draws;
      let possiblePoints = matchesPlayed * 3;
      
      if (matchesPlayed > 0) {
        aproveitamento = (totalPoints / possiblePoints) * 100;
      }
      
      if (matchesPlayed > 5) {
          zagueiros.push({
            name: data.nickname || data.name,
            matches: matchesPlayed,
            wins,
            draws,
            aproveitamento
          });
      }
    }
  });
  
  zagueiros.sort((a, b) => b.aproveitamento - a.aproveitamento);
  
  console.log("=== Aproveitamento dos Zagueiros (> 5 jogos) ===");
  zagueiros.forEach((z, i) => {
    console.log(`${i+1}. ${z.name}: ${z.aproveitamento.toFixed(2)}% (${z.wins}V, ${z.draws}E em ${z.matches} jogos)`);
  });
  
  process.exit(0);
}
run().catch(console.error);
