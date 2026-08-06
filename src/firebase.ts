import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
  memoryLocalCache, 
  getDoc, 
  getDocFromCache, 
  DocumentReference, 
  DocumentData, 
  DocumentSnapshot 
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use persistentLocalCache for instant load times and offline responsiveness
let firestoreCache;
try {
  firestoreCache = persistentLocalCache();
} catch (e) {
  console.warn("Persistent cache not supported in this environment, falling back to memoryLocalCache", e);
  firestoreCache = memoryLocalCache();
}

export const db = initializeFirestore(app, {
  localCache: firestoreCache,
}, firebaseConfig.firestoreDatabaseId);

export const storage = getStorage(app);

// Helper for safe doc retrieval with offline cache fallback
export async function safeGetDoc<T = DocumentData>(docRef: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  try {
    return await getDoc(docRef);
  } catch (error: any) {
    if (error?.code === 'unavailable' || error?.message?.includes('offline')) {
      try {
        const cached = await getDocFromCache(docRef);
        if (cached.exists()) return cached;
      } catch {
        // Ignore cache miss
      }
    }
    throw error;
  }
}

