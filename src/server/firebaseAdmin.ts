import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore as getFs, type Firestore } from 'firebase-admin/firestore';
import { getStorage as getStore, type Storage } from 'firebase-admin/storage';

let app: App | undefined;

function getApp(): App {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0];
    return app;
  }

  app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  return app;
}

export function getFirestore(): Firestore {
  return getFs(getApp());
}

export function getStorage(): Storage {
  return getStore(getApp());
}
