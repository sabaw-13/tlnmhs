import React from "react";
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SchoolDataProvider } from "./context/SchoolDataContext";
import { ThemeProvider } from "./context/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import "./index.css";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser, userData, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!currentUser) return <Navigate to="/login" />;
  
  if (allowedRoles && (!userData || !allowedRoles.includes(userData.role))) {
    return <Navigate to="/dashboard" />;
  }

  return children;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SchoolDataProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route 
                path="/dashboard/*" 
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />
              <Route path="/" element={<Navigate to="/dashboard" />} />
            </Routes>
          </Router>
        </SchoolDataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
