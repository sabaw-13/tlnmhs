import React, { useEffect, useState } from "react";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import {
  BarChart3,
  BellRing,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  Database,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings
} from "lucide-react";
import AdminView from "./AdminView";
import TeacherView from "./TeacherView";
import StudentView from "./StudentView";
import ParentView from "./ParentView";
import SettingsView from "./SettingsView";
import ConfirmDialog from "../components/ConfirmDialog";
import "./Dashboard.css";

const Dashboard = () => {
  const { userData, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const role = userData?.role;
  const roleLabel = role ? `${role.charAt(0).toUpperCase() + role.slice(1)} Portal` : "Portal";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = isSidebarOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isSidebarOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);

    try {
      await logout();
      navigate("/login");
    } finally {
      setIsLoggingOut(false);
      setIsLogoutDialogOpen(false);
    }
  };

  const getSidebarItems = () => {
    const common = [
      { path: "/dashboard", label: "Overview", icon: <LayoutDashboard size={20} /> }
    ];
    const settingsItem = { path: "/dashboard/settings", label: "Settings", icon: <Settings size={20} /> };

    if (role === "admin") {
      return [
        ...common,
        { path: "/dashboard/repository", label: "Repository", icon: <Database size={20} /> },
        { path: "/dashboard/reports", label: "Reports", icon: <BarChart3 size={20} /> },
        settingsItem
      ];
    }

    if (role === "teacher") {
      return [
        ...common,
        { path: "/dashboard/attendance", label: "Attendance", icon: <CalendarCheck size={20} /> },
        { path: "/dashboard/gradebook", label: "Gradebook", icon: <BookOpen size={20} /> },
        { path: "/dashboard/reports", label: "Reports", icon: <ClipboardCheck size={20} /> },
        settingsItem
      ];
    }

    if (role === "student") {
      return [
        ...common,
        { path: "/dashboard/grades", label: "My Grades", icon: <GraduationCap size={20} /> },
        { path: "/dashboard/attendance", label: "Attendance", icon: <ClipboardCheck size={20} /> },
        settingsItem
      ];
    }

    if (role === "parent") {
      return [
        ...common,
        { path: "/dashboard/child-report", label: "Child Report", icon: <BookOpen size={20} /> },
        { path: "/dashboard/updates", label: "Updates", icon: <BellRing size={20} /> },
        settingsItem
      ];
    }

    return [...common, settingsItem];
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
            <Route path="attendance" element={<TeacherView section="attendance" />} />
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
      <button
        className={`sidebar-backdrop${isSidebarOpen ? " visible" : ""}`}
        type="button"
        aria-label="Close navigation menu"
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside className={`sidebar${isSidebarOpen ? " open" : ""}`}>
        <div className="sidebar-topbar">
          <div className="sidebar-header">
            <h2>TLNMHS</h2>
            <span>{roleLabel}</span>
          </div>
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
        <button className="logout-btn" type="button" onClick={() => setIsLogoutDialogOpen(true)}>
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </aside>

      <main className="content">
        <header className="content-header">
          <div className="header-leading">
            <button
              className="mobile-nav-btn"
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="header-copy">
              <span className="header-kicker">{roleLabel}</span>
              <h1>{userData?.displayName || userData?.email}</h1>
            </div>
          </div>
        </header>

        <section className="view-content">
          <Routes>
            {renderRoleRoutes()}
            <Route path="settings" element={<SettingsView />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </section>
      </main>

      {isLogoutDialogOpen && (
        <ConfirmDialog
          tone="danger"
          title="Log out from this session?"
          message="You will be signed out on this device and returned to the login screen."
          confirmLabel="Log Out"
          cancelLabel="Stay Here"
          busy={isLoggingOut}
          onConfirm={handleLogout}
          onCancel={() => setIsLogoutDialogOpen(false)}
        />
      )}
    </div>
  );
};

export default Dashboard;
