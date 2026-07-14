import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
admin.initializeApp({ projectId: firebaseConfig.projectId });
const db = getFirestore(admin.apps[0], firebaseConfig.firestoreDatabaseId || 'arenacoxim2');

async function run() {
  const q = await db.collection('admins').where('email', '==', 'luceilton.cb41@gmail.com').get();
  console.log(`Found ${q.size} admins by email luceilton.cb41@gmail.com`);
  q.forEach(doc => console.log(doc.id, '=>', doc.data()));
  
  const docRef = await db.collection('admins').doc('FYtFXGEtESQ7UkYbL5m447fo5iu1').get();
  console.log(`Doc FYtFXGEtESQ7UkYbL5m447fo5iu1 exists? ${docRef.exists}`);
  if (docRef.exists) console.log(docRef.data());
}
run();
