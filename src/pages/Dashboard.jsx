import React, { useEffect, useState } from "react";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useSchoolData } from "../context/SchoolDataContext";
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  Receipt,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  School,
  Sun,
  UserCog,
  Users,
  X
} from "lucide-react";
import AdminView from "./AdminView";
import TeacherView from "./TeacherView";
import StudentView from "./StudentView";
import ParentView from "./ParentView";
import SettingsView from "./SettingsView";
import ConfirmDialog from "../components/ConfirmDialog";
import "./Dashboard.css";

const getInitials = (name) => {
  if (!name) return "?";
  const parts = name.split(/[\s@.]/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
};

const HEADER_COPY = {
  admin: {
    dashboard: {
      eyebrow: "Dashboard",
      title: "School Operations",
      description: "Monitor enrollment, advisory assignments, parent access, and academic records."
    },
    students: {
      eyebrow: "Students",
      title: "Student Manager",
      description: "Add, import, assign, and maintain Junior High student records."
    },
    classes: {
      eyebrow: "Sections",
      title: "Grade & Section Manager",
      description: "Maintain grade levels and assign section names under the right grade."
    },
    teachers: {
      eyebrow: "Teachers",
      title: "Teacher Manager",
      description: "Create teacher accounts, assign subjects, and manage advisory sections."
    },
    parents: {
      eyebrow: "Parents",
      title: "Parent Manager",
      description: "Manage parent accounts and student record access."
    },
    reports: {
      eyebrow: "Reports",
      title: "Performance Reports",
      description: "Review section performance, attendance, and students needing intervention."
    },
    settings: {
      eyebrow: "Settings",
      title: "Account Settings",
      description: "Review account details and system preferences."
    }
  },
  teacher: {
    dashboard: {
      eyebrow: "Dashboard",
      title: "Teaching Dashboard",
      description: "Track advisory students, subjects, attendance, and academic progress."
    },
    students: {
      eyebrow: "Students",
      title: "Student Manager",
      description: "Manage the roster for your assigned advisory section."
    },
    subjects: {
      eyebrow: "Subjects",
      title: "Subject Manager",
      description: "Set up handled subjects and assign them to sections."
    },
    gradebook: {
      eyebrow: "Grades",
      title: "Input Grades",
      description: "Enter assessment scores and compute term grades for your handled subjects."
    },
    attendance: {
      eyebrow: "Attendance",
      title: "Attendance Tracker",
      description: "Record daily and monthly attendance for your subject sections."
    },
    fees: {
      eyebrow: "Fee",
      title: "Fee Manager",
      description: "Add and manage advisory class fees for your section."
    },
    reports: {
      eyebrow: "Reports",
      title: "Class Reports",
      description: "Review academic performance and students needing support."
    },
    settings: {
      eyebrow: "Settings",
      title: "Account Settings",
      description: "Review account details and system preferences."
    }
  },
  student: {
    dashboard: {
      eyebrow: "Dashboard",
      title: "Student Dashboard",
      description: "View your section, academic summary, attendance, and recent updates."
    },
    "join-class": {
      eyebrow: "Join Section",
      title: "Join Section",
      description: "Enter your section code and wait for adviser approval."
    },
    grades: {
      eyebrow: "Grades",
      title: "My Grades",
      description: "Review subject grades and quarterly progress."
    },
    attendance: {
      eyebrow: "Attendance",
      title: "My Attendance",
      description: "Check your current attendance record."
    },
    fees: {
      eyebrow: "Fees",
      title: "My Fees",
      description: "Review advisory class fees and payment status."
    },
    settings: {
      eyebrow: "Settings",
      title: "Account Settings",
      description: "Review account details and system preferences."
    }
  },
  parent: {
    dashboard: {
      eyebrow: "Dashboard",
      title: "Parent Dashboard",
      description: "Review linked student progress, attendance, and updates."
    },
    requests: {
      eyebrow: "Requests",
      title: "Student Access Requests",
      description: "Request or manage access to student records."
    },
    "child-report": {
      eyebrow: "Child Report",
      title: "Child Report",
      description: "View grades, attendance, and academic notes for your child."
    },
    attendance: {
      eyebrow: "Attendance",
      title: "Attendance",
      description: "Monitor attendance records for linked students."
    },
    fees: {
      eyebrow: "Fees",
      title: "Student Fees",
      description: "Review assigned fees and payment status for linked students."
    },
    settings: {
      eyebrow: "Settings",
      title: "Account Settings",
      description: "Review account details and system preferences."
    }
  }
};

const Dashboard = () => {
  const { userData, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { currentStudent } = useSchoolData();
  const location = useLocation();
  const navigate = useNavigate();
  const role = userData?.role;
  const roleLabel = role ? `${role.charAt(0).toUpperCase() + role.slice(1)} Portal` : "Portal";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [headerActions, setHeaderActions] = useState(null);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = isSidebarOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!isSidebarOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
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
      { path: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={19} /> }
    ];
    const settingsItem = { path: "/dashboard/settings", label: "Settings", icon: <School size={19} /> };

    if (role === "admin") {
      return [
        ...common,
        { path: "/dashboard/students", label: "Students", icon: <Users size={19} /> },
        { path: "/dashboard/classes", label: "Sections", icon: <School size={19} /> },
        { path: "/dashboard/teachers", label: "Teachers", icon: <UserCog size={19} /> },
        { path: "/dashboard/parents", label: "Parents", icon: <Users size={19} /> },
        { path: "/dashboard/reports", label: "Reports", icon: <BarChart3 size={19} /> },
        settingsItem
      ];
    }

    if (role === "teacher") {
      return [
        ...common,
        { path: "/dashboard/students", label: "Students", icon: <Users size={19} /> },
        { path: "/dashboard/subjects", label: "Subject Manager", icon: <BookOpen size={19} /> },
        { path: "/dashboard/gradebook", label: "Input Grades", icon: <GraduationCap size={19} /> },
        { path: "/dashboard/attendance", label: "Attendance", icon: <CalendarCheck size={19} /> },
        { path: "/dashboard/fees", label: "Fee", icon: <Receipt size={19} /> },
        settingsItem
      ];
    }

    if (role === "student") {
      const showJoinSection = !currentStudent?.classId;

      return [
        ...common,
        ...(showJoinSection
          ? [{ path: "/dashboard/join-class", label: "Join Section", icon: <School size={19} /> }]
          : []),
        { path: "/dashboard/grades", label: "My Grades", icon: <GraduationCap size={19} /> },
        { path: "/dashboard/attendance", label: "Attendance", icon: <ClipboardCheck size={19} /> },
        { path: "/dashboard/fees", label: "Fees", icon: <Receipt size={19} /> },
        settingsItem
      ];
    }

    if (role === "parent") {
      return [
        ...common,
        { path: "/dashboard/child-report", label: "Child Report", icon: <BookOpen size={19} /> },
        { path: "/dashboard/attendance", label: "Attendance", icon: <ClipboardCheck size={19} /> },
        { path: "/dashboard/fees", label: "Fees", icon: <Receipt size={19} /> },
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
            <Route index element={<AdminView section="dashboard" setHeaderActions={setHeaderActions} />} />
            <Route path="requests" element={<Navigate to="/dashboard/parents" replace />} />
            <Route path="students" element={<AdminView section="students" setHeaderActions={setHeaderActions} />} />
            <Route path="classes" element={<AdminView section="classes" setHeaderActions={setHeaderActions} />} />
            <Route path="teachers" element={<AdminView section="teachers" setHeaderActions={setHeaderActions} />} />
            <Route path="parents" element={<AdminView section="parents" setHeaderActions={setHeaderActions} />} />
            <Route path="repository" element={<Navigate to="/dashboard/students" replace />} />
            <Route path="reports" element={<AdminView section="reports" setHeaderActions={setHeaderActions} />} />
          </>
        );
      case "teacher":
        return (
          <>
            <Route index element={<TeacherView section="dashboard" setHeaderActions={setHeaderActions} />} />
            <Route path="students" element={<TeacherView section="students" setHeaderActions={setHeaderActions} />} />
            <Route path="subjects" element={<TeacherView section="subjects" setHeaderActions={setHeaderActions} />} />
            <Route path="gradebook" element={<TeacherView section="gradebook" setHeaderActions={setHeaderActions} />} />
            <Route path="attendance" element={<TeacherView section="attendance" setHeaderActions={setHeaderActions} />} />
            <Route path="fees" element={<TeacherView section="fees" setHeaderActions={setHeaderActions} />} />
            <Route path="reports" element={<Navigate to="/dashboard" replace />} />
          </>
        );
      case "student":
        return (
          <>
            <Route index element={<StudentView section="dashboard" />} />
            <Route path="join-class" element={<StudentView section="join" />} />
            <Route path="grades" element={<StudentView section="grades" />} />
            <Route path="attendance" element={<StudentView section="attendance" />} />
            <Route path="fees" element={<StudentView section="fees" />} />
          </>
        );
      case "parent":
        return (
          <>
            <Route index element={<ParentView section="dashboard" />} />
            <Route path="requests" element={<Navigate to="/dashboard" replace />} />
            <Route path="child-report" element={<ParentView section="report" />} />
            <Route path="attendance" element={<ParentView section="attendance" />} />
            <Route path="fees" element={<ParentView section="fees" />} />
            <Route path="updates" element={<Navigate to="/dashboard" replace />} />
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

  const displayName = userData?.displayName || userData?.email;
  const pathParts = location.pathname.split("/").filter(Boolean);
  const activeSection = pathParts[1] || "dashboard";
  const headerCopy = HEADER_COPY[role]?.[activeSection] || {
    eyebrow: roleLabel,
    title: "Dashboard",
    description: "Use the navigation to access your available tools."
  };

  return (
    <div className={`dashboard-container${isSidebarOpen ? " menu-open" : ""}`}>
      <button
        className={`sidebar-backdrop${isSidebarOpen ? " visible" : ""}`}
        type="button"
        aria-label="Close navigation menu"
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside id="dashboard-sidebar" className={`sidebar${isSidebarOpen ? " open" : ""}`}>
        <div className="sidebar-topbar">
          <div className="sidebar-header">
            <h2>TLNMHS</h2>
            <span>{roleLabel}</span>
          </div>
          <button
            className="sidebar-close-btn"
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={19} />
          </button>
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

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{getInitials(displayName)}</div>
          <div className="sidebar-user-info">
            <strong title={displayName}>
              {userData?.displayName || userData?.email?.split("@")[0]}
            </strong>
            <span>{role || "user"}</span>
          </div>
        </div>

        <button className="logout-btn" type="button" onClick={() => setIsLogoutDialogOpen(true)}>
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </aside>

      <main className="content">
        <header className="content-header">
          <div className="header-topbar">
            <div className="header-leading">
              <button
                className="mobile-nav-btn"
                type="button"
                aria-label="Open navigation menu"
                aria-controls="dashboard-sidebar"
                aria-expanded={isSidebarOpen}
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu size={19} />
              </button>
              <div className="header-copy">
                <span className="header-kicker">{headerCopy.eyebrow}</span>
                <h1>{headerCopy.title}</h1>
                <p>{headerCopy.description}</p>
              </div>
            </div>
            <div className="header-actions">
              {headerActions}
              <button
                className="icon-btn"
                type="button"
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
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
          title="Sign out from this session?"
          message="You will be signed out on this device and returned to the login screen."
          confirmLabel="Sign Out"
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
