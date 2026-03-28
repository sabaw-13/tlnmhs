import React from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import "./TeacherDashboard.css";

const getStatusClassName = (value) => value.toLowerCase().replace(/\s+/g, "-");

const ParentView = ({ section = "overview" }) => {
  const { linkedStudent, loading, error } = useSchoolData();
  const { userData } = useAuth();

  if (loading) return <div className="loading-container">Loading child records...</div>;
  if (error) return <div className="error-container">{error}</div>;
  if (!linkedStudent) {
    return (
      <div className="empty-state">
        <h3>No linked child account</h3>
        <p>Assign <code>studentId</code> to this parent profile in Firebase to access academic reports.</p>
      </div>
    );
  }

  return (
    <div className="parent-view">
      <div className="panel hero-panel">
        <h3>Child: <span className="text-primary">{linkedStudent.name}</span></h3>
        <p className="text-secondary">{linkedStudent.className}</p>
        <p className="muted-text">Parent access for {userData?.displayName || userData?.email}</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h4>Academic Average</h4>
          <p>{linkedStudent.gpa ?? "N/A"}</p>
        </div>
        <div className="stat-card">
          <h4>Attendance</h4>
          <p>{linkedStudent.attendanceLabel}</p>
        </div>
        <div className="stat-card">
          <h4>Performance</h4>
          <p>{linkedStudent.performanceStatus}</p>
        </div>
      </div>

      {section === "overview" && (
        <div className="insight-grid">
          <div className="panel">
            <h3>Parent Summary</h3>
            <p className="muted-text">Review the latest academic standing and teacher remarks.</p>
            <div className="report-strip">
              <div>
                <span>Q1 Average</span>
                <strong>{linkedStudent.q1Average ?? "N/A"}</strong>
              </div>
              <div>
                <span>Q2 Average</span>
                <strong>{linkedStudent.q2Average ?? "N/A"}</strong>
              </div>
              <div>
                <span>Updated</span>
                <strong>{linkedStudent.updatedLabel}</strong>
              </div>
            </div>
            <p className="mt-4">{linkedStudent.teacherRemarks || "No remarks have been published yet."}</p>
          </div>

          <div className="panel">
            <h3>Alerts and Recommendations</h3>
            {linkedStudent.alerts.length ? (
              <ul className="stack-list">
                {linkedStudent.alerts.map((alert) => (
                  <li key={alert} className="list-row">
                    <strong>{alert}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">No intervention alerts. Your child is currently on track.</p>
            )}
          </div>
        </div>
      )}

      {section === "report" && (
        <div className="panel">
          <h3>Child Academic Report</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Teacher</th>
                <th>Q1</th>
                <th>Q2</th>
                <th>Final Grade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {linkedStudent.subjects.map((subject) => (
                <tr key={subject.id}>
                  <td>{subject.name}</td>
                  <td>{subject.teacher}</td>
                  <td>{subject.q1 ?? "N/A"}</td>
                  <td>{subject.q2 ?? "N/A"}</td>
                  <td>{subject.finalGrade ?? "N/A"}</td>
                  <td><span className={`status-pill ${getStatusClassName(subject.status)}`}>{subject.status}</span></td>
                </tr>
              ))}
              {linkedStudent.subjects.length === 0 && (
                <tr>
                  <td colSpan="6">No grade records available yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {section === "updates" && (
        <div className="panel">
          <h3>Recent Performance Notifications</h3>
          {linkedStudent.recentActivity.length ? (
            <ul className="stack-list">
              {linkedStudent.recentActivity.map((activity, index) => (
                <li key={`${activity.date}-${index}`} className="list-row">
                  <div>
                    <strong>{activity.activity}</strong>
                    <p>{activity.result}</p>
                  </div>
                  <span>{activity.date}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">No recent notifications yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default ParentView;
