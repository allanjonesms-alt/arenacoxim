import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || 'arenacoxim2');

async function run() {
  try {
    const payload = {
      imageUrlDesktop: 'data:image/jpeg;base64,123',
      imageUrlMobile: 'data:image/jpeg;base64,123',
      link: 'https://shopee.com.br',
      active: true,
      clicks: 0,
      createdAt: serverTimestamp()
    };
    
    await setDoc(doc(db, 'banners', 'test_banner'), payload, { merge: true });
    console.log("Banner saved successfully.");
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}
run();
