import { db } from './src/firebase';
import { collection, getDocs } from 'firebase/firestore';

async function countDraws() {
  try {
    const snap = await getDocs(collection(db, 'matches'));
    let total = 0;
    let draws = 0;
    snap.forEach(doc => {
      const data = doc.data();
      if (data.status === 'finished') {
        total++;
        if (data.scoreA === data.scoreB) {
          draws++;
        }
      }
    });
    console.log(`Total finished matches: ${total}`);
    console.log(`Total draws: ${draws}`);
    if (total > 0) {
      console.log(`Draw probability: ${(draws / total * 100).toFixed(2)}%`);
    }
  } catch (error) {
    console.error(error);
  }
  process.exit(0);
}

countDraws();
