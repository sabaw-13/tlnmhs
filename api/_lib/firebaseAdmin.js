import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

const DEFAULT_PROJECT_ID = "e-track-50646";
const DEFAULT_DATABASE_URL = "https://e-track-50646-default-rtdb.firebaseio.com/";

const formatPrivateKey = (value = "") => value.replace(/\\n/g, "\n").trim();

const getFirebaseAdminApp = () => {
  if (getApps().length) {
    return getApps()[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
  const privateKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  const databaseURL = process.env.FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL;

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin credentials are missing. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey
    }),
    databaseURL
  });
};

export const adminAuth = () => getAuth(getFirebaseAdminApp());
export const adminDb = () => getDatabase(getFirebaseAdminApp());
