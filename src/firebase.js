import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

export const firebaseConfig = {
  apiKey: "AIzaSyAIVjWOeeaoOM_zirtt26pQU8-dTljjD38",
  authDomain: "e-track-50646.firebaseapp.com",
  projectId: "e-track-50646",
  databaseURL: "https://e-track-50646-default-rtdb.firebaseio.com/",
  storageBucket: "e-track-50646.firebasestorage.app",
  messagingSenderId: "116855178504",
  appId: "1:116855178504:web:e84450b4d52ea2db4d98bd",
  measurementId: "G-JHMFRKHY6J"
};

const app = initializeApp(firebaseConfig);
let analytics = null;

if (typeof window !== "undefined") {
  import("firebase/analytics")
    .then(async ({ getAnalytics, isSupported }) => {
      if (await isSupported()) {
        analytics = getAnalytics(app);
      }
    })
    .catch((error) => {
      console.warn("Firebase analytics unavailable in this environment:", error);
    });
}

export { app, analytics };
export const auth = getAuth(app);
export const db = getDatabase(app);
