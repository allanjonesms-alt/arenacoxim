import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || 'arenacoxim2');

async function run() {
  try {
    const q = collection(db, 'banners');
    const snapshot = await getDocs(q);
    console.log(`Found ${snapshot.size} banners.`);
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}
run();
