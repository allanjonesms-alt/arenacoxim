import admin from 'firebase-admin';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
admin.initializeApp({
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket
});

async function run() {
  try {
    const bucket = admin.storage().bucket();
    const [files] = await bucket.getFiles({ maxResults: 1 });
    console.log("Success! Found:", files.length);
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}
run();
