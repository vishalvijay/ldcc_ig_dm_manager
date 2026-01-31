import { initializeApp, getApps, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let app: App;
let db: Firestore;

/**
 * Initialize Firebase Admin SDK.
 * Uses application default credentials when running in Firebase environment.
 */
export function initializeFirebase(): App {
  if (getApps().length === 0) {
    app = initializeApp();
  } else {
    app = getApps()[0];
  }
  return app;
}

/**
 * Get Firestore instance, initializing Firebase if needed.
 */
export function getDb(): Firestore {
  if (!db) {
    initializeFirebase();
    db = getFirestore();
  }
  return db;
}

export { app, db };
