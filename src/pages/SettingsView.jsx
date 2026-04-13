import React from "react";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { useTheme } from "../context/ThemeContext";
import "./TeacherDashboard.css";

const SettingsView = () => {
  const { currentUser, userData } = useAuth();
  const { repositorySummary, teacherUsers, classes } = useSchoolData();
  const { theme, toggleTheme } = useTheme();
  const isDarkMode = theme === "dark";

  return (
    <div className="admin-view">
      <div className="stats-grid">
        <div className="stat-card">
          <h4>Teachers</h4>
          <p>{teacherUsers.length}</p>
        </div>
        <div className="stat-card">
          <h4>Classes</h4>
          <p>{classes.length}</p>
        </div>
      </div>

      <div className="insight-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>Appearance</h3>
            <span className="meta-badge">{isDarkMode ? "Dark Mode" : "Light Mode"}</span>
          </div>
          <p className="empty-copy">Choose the interface style that feels best on your device.</p>
          <button className="primary-btn wide-btn" type="button" onClick={toggleTheme}>
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            <span>{isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}</span>
          </button>
        </div>

        <div className="panel">
          <h3>Account</h3>
          <ul className="stack-list">
            <li className="list-row">
              <strong>Name</strong>
              <span>{userData?.displayName || currentUser?.displayName || "Not set"}</span>
            </li>
            <li className="list-row">
              <strong>Email</strong>
              <span>{userData?.email || currentUser?.email || "Not set"}</span>
            </li>
            <li className="list-row">
              <strong>Role</strong>
              <span>{userData?.role || "Not assigned"}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="panel">
        <h3>Repository Snapshot</h3>
        <div className="report-strip">
          <div>
            <span>Students</span>
            <strong>{repositorySummary.students}</strong>
          </div>
          <div>
            <span>Parents</span>
            <strong>{repositorySummary.parents}</strong>
          </div>
          <div>
            <span>Live Reports</span>
            <strong>{repositorySummary.liveReports}</strong>
          </div>
          <div>
            <span>Health</span>
            <strong>{repositorySummary.health}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
