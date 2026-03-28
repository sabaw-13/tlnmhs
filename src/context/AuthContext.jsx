import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut 
} from "firebase/auth";
import { get, ref } from "firebase/database";
import { auth, db } from "../firebase";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = () => {
    return signOut(auth);
  };

  useEffect(() => {
    let isMounted = true;
    const loadingTimeout = window.setTimeout(() => {
      if (isMounted) {
        console.warn("Firebase auth initialization timed out. Continuing to login screen.");
        setLoading(false);
        setAuthError("Authentication is taking longer than expected. You can still try logging in.");
      }
    }, 5000);

    let unsubscribe = () => {};

    try {
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!isMounted) return;

        setCurrentUser(user);
        setAuthError("");

        if (user) {
          try {
            const userSnap = await get(ref(db, `users/${user.uid}`));

            if (!isMounted) return;
            setUserData(userSnap.exists() ? userSnap.val() : null);
          } catch (error) {
            console.error("Error fetching user profile:", error);
            if (isMounted) {
              setUserData(null);
              setAuthError("Signed in, but profile data could not be loaded.");
            }
          }
        } else {
          setUserData(null);
        }

        if (isMounted) {
          window.clearTimeout(loadingTimeout);
          setLoading(false);
        }
      });
    } catch (error) {
      console.error("Error subscribing to Firebase auth state:", error);
      setAuthError("Authentication could not be initialized.");
      setLoading(false);
      window.clearTimeout(loadingTimeout);
    }

    return () => {
      isMounted = false;
      window.clearTimeout(loadingTimeout);
      unsubscribe();
    };
  }, []);

  const value = {
    currentUser,
    userData,
    login,
    logout,
    loading,
    authError
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="app-status-screen">
          <div className="app-status-card">
            <h1>TLNMHS Progress Tracker</h1>
            <p>Initializing application...</p>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};
