import { db } from './src/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

async function run() {
  const ref = doc(db, 'settings', 'oddsEngine');
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};
  
  if (!data.matchWinner) {
    data.matchWinner = {};
  }
  
  data.matchWinner.drawBaseProbability = 0.25;
  data.matchWinner.drawDiffDenominator = 15;
  data.matchWinner.amplificationPower = 5;
  data.matchWinner.margin = 1.25;
  
  await setDoc(ref, data, { merge: true });
  console.log("Updated config to increase draw probabilities.");
  process.exit(0);
}

run();
