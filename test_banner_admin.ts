import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
if (!admin.apps.length) {
    admin.initializeApp({ projectId: firebaseConfig.projectId });
}
const db = getFirestore(admin.apps[0], firebaseConfig.firestoreDatabaseId || 'arenacoxim2');

async function run() {
  try {
    const payload = {
      imageUrlDesktop: 'data:image/jpeg;base64,123',
      imageUrlMobile: 'data:image/jpeg;base64,123',
      link: 'https://shopee.com.br',
      active: true,
      clicks: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('banners').doc('test_banner').set(payload, { merge: true });
    console.log("Banner saved successfully.");
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}
run();
