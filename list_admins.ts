import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || 'arenacoxim2');

async function run() {
  try {
    const snapAwards = await getDocs(collection(db, 'monthlyAwards'));
    console.log("Awards count:", snapAwards.size);
    snapAwards.forEach(d => console.log("Award:", d.id, JSON.stringify(d.data(), null, 2)));

    const snapPlayers = await getDocs(collection(db, 'players'));
    console.log("Players count:", snapPlayers.size);
  } catch (err) {
    console.error("Failed to list admins:", err);
  }
  process.exit(0);
}
run();
