import React from "react";
import { Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import {
  BarChart3,
  BellRing,
  BookOpen,
  ClipboardCheck,
  Database,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Settings
} from "lucide-react";
import AdminView from "./AdminView";
import TeacherView from "./TeacherView";
import StudentView from "./StudentView";
import ParentView from "./ParentView";
import "./Dashboard.css";

const Dashboard = () => {
  const { userData, logout } = useAuth();
  const { repositorySummary, error: repositoryError } = useSchoolData();
  const navigate = useNavigate();
  const role = userData?.role;

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const getSidebarItems = () => {
    const common = [
      { path: "/dashboard", label: "Overview", icon: <LayoutDashboard size={20} /> }
    ];

    if (role === "admin") {
      return [
        ...common,
        { path: "/dashboard/repository", label: "Repository", icon: <Database size={20} /> },
        { path: "/dashboard/reports", label: "Reports", icon: <BarChart3 size={20} /> }
      ];
    }

    if (role === "teacher") {
      return [
        ...common,
        { path: "/dashboard/gradebook", label: "Gradebook", icon: <BookOpen size={20} /> },
        { path: "/dashboard/reports", label: "Reports", icon: <ClipboardCheck size={20} /> }
      ];
    }

    if (role === "student") {
      return [
        ...common,
        { path: "/dashboard/grades", label: "My Grades", icon: <GraduationCap size={20} /> },
        { path: "/dashboard/attendance", label: "Attendance", icon: <ClipboardCheck size={20} /> }
      ];
    }

    if (role === "parent") {
      return [
        ...common,
        { path: "/dashboard/child-report", label: "Child Report", icon: <BookOpen size={20} /> },
        { path: "/dashboard/updates", label: "Updates", icon: <BellRing size={20} /> }
      ];
    }

    return common;
  };

  const renderRoleRoutes = () => {
    switch (role) {
      case "admin":
        return (
          <>
            <Route index element={<AdminView section="overview" />} />
            <Route path="repository" element={<AdminView section="repository" />} />
            <Route path="reports" element={<AdminView section="reports" />} />
          </>
        );
      case "teacher":
        return (
          <>
            <Route index element={<TeacherView section="overview" />} />
            <Route path="gradebook" element={<TeacherView section="gradebook" />} />
            <Route path="reports" element={<TeacherView section="reports" />} />
          </>
        );
      case "student":
        return (
          <>
            <Route index element={<StudentView section="overview" />} />
            <Route path="grades" element={<StudentView section="grades" />} />
            <Route path="attendance" element={<StudentView section="attendance" />} />
          </>
        );
      case "parent":
        return (
          <>
            <Route index element={<ParentView section="overview" />} />
            <Route path="child-report" element={<ParentView section="report" />} />
            <Route path="updates" element={<ParentView section="updates" />} />
          </>
        );
      default:
        return (
          <Route
            index
            element={(
              <div className="empty-state">
                <h3>Profile setup required</h3>
                <p>This account does not have an assigned role yet. Update the Firebase user profile to continue.</p>
              </div>
            )}
          />
        );
    }
  };

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>TLNMHS</h2>
          <span>{role && role.charAt(0).toUpperCase() + role.slice(1)} Portal</span>
        </div>
        <nav className="sidebar-nav">
          {getSidebarItems().map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/dashboard"}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <button className="logout-btn" type="button" onClick={handleLogout}>
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </aside>

      <main className="content">
        <header className="content-header">
          <div>
            <h1>Welcome, {userData?.displayName || userData?.email}</h1>
            <p className="header-subtitle">
              {repositoryError
                ? repositoryError
                : `Live repository connected${repositorySummary?.classes ? ` | ${repositorySummary.classes} classes tracked` : ""}`}
            </p>
          </div>
          <div className="header-actions">
            <button className="icon-btn" type="button" aria-label="Repository status">
              <Settings size={20} />
            </button>
          </div>
        </header>

        <section className="view-content">
          <Routes>
            {renderRoleRoutes()}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
