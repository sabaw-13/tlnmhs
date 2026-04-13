import React from "react";
import { useSchoolData } from "../context/SchoolDataContext";
import "./TeacherDashboard.css";

const getStatusClassName = (value) => value.toLowerCase().replace(/\s+/g, "-");

const StudentView = ({ section = "overview" }) => {
  const { currentStudent, loading, error } = useSchoolData();

  if (loading) return <div className="loading-container">Loading academic records...</div>;
  if (error) return <div className="error-container">{error}</div>;
  if (!currentStudent) {
    return (
      <div className="empty-state">
        <h3>No student record found</h3>
        <p>Link this account to a student entry in Firebase under <code>students</code> to unlock live reports.</p>
      </div>
    );
  }

  const focusSubjects = [...currentStudent.subjects]
    .sort((left, right) => (left.finalGrade ?? 0) - (right.finalGrade ?? 0))
    .slice(0, 3);

  return (
    <div className="student-view">
      {section === "overview" && (
        <div className="stats-grid">
          <div className="stat-card">
            <h4>Current GPA</h4>
            <p>{currentStudent.gpa ?? "N/A"}</p>
          </div>
          <div className="stat-card">
            <h4>Attendance Rate</h4>
            <p>{currentStudent.attendanceLabel}</p>
          </div>
          <div className="stat-card">
            <h4>Performance</h4>
            <p>{currentStudent.performanceStatus}</p>
          </div>
        </div>
      )}

      {section === "overview" && (
        <>
          <div className="insight-grid">
            <div className="panel">
              <div className="panel-header">
                <h3>Live Progress Snapshot</h3>
                {currentStudent.className && <span className="meta-badge">{currentStudent.className}</span>}
              </div>
              <div className="report-strip">
                <div>
                  <span>Q1 Average</span>
                  <strong>{currentStudent.q1Average ?? "N/A"}</strong>
                </div>
                <div>
                  <span>Q2 Average</span>
                  <strong>{currentStudent.q2Average ?? "N/A"}</strong>
                </div>
                <div>
                  <span>Last Update</span>
                  <strong>{currentStudent.updatedLabel}</strong>
                </div>
              </div>
              <p className="mt-4">{currentStudent.teacherRemarks || "No teacher note yet."}</p>
            </div>

            <div className="panel">
              <h3>Focus Areas</h3>
              {focusSubjects.length ? (
                <ul className="stack-list">
                  {focusSubjects.map((subject) => (
                    <li key={subject.id} className="list-row">
                      <div>
                        <strong>{subject.name}</strong>
                        <p>{subject.teacher}</p>
                      </div>
                      <span>{subject.finalGrade ?? "N/A"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No subjects available yet.</p>
              )}
            </div>
          </div>

          <div className="panel">
            <h3>Recent Updates</h3>
            {currentStudent.recentActivity.length ? (
              <ul className="stack-list">
                {currentStudent.recentActivity.map((activity, index) => (
                  <li key={`${activity.date}-${index}`} className="list-row">
                    <div>
                      <strong>{activity.activity}</strong>
                      <p>{activity.remarks || activity.result}</p>
                    </div>
                    <span>{activity.date}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">No recent updates.</p>
            )}
          </div>
        </>
      )}

      {section === "grades" && (
        <div className="panel">
          <h3>My Academic Record</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Teacher</th>
                <th>Quarter 1</th>
                <th>Quarter 2</th>
                <th>Final Grade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {currentStudent.subjects.map((subject) => (
                <tr key={subject.id}>
                  <td data-label="Subject">{subject.name}</td>
                  <td data-label="Teacher">{subject.teacher}</td>
                  <td data-label="Quarter 1">{subject.q1 ?? "N/A"}</td>
                  <td data-label="Quarter 2">{subject.q2 ?? "N/A"}</td>
                  <td data-label="Final Grade">{subject.finalGrade ?? "N/A"}</td>
                  <td data-label="Status"><span className={`status-pill ${getStatusClassName(subject.status)}`}>{subject.status}</span></td>
                </tr>
              ))}
              {currentStudent.subjects.length === 0 && (
                <tr>
                  <td colSpan="6">No grade records available yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {section === "attendance" && (
        <div className="insight-grid">
          <div className="panel">
            <h3>Attendance Overview</h3>
            <div className="progress-track large">
              <div className="progress-fill" style={{ width: `${currentStudent.attendanceRate || 0}%` }} />
            </div>
            <p className="mt-4">Current attendance: <strong>{currentStudent.attendanceLabel}</strong></p>
          </div>

          <div className="panel">
            <h3>Alerts</h3>
            {currentStudent.alerts.length ? (
              <ul className="stack-list">
                {currentStudent.alerts.map((alert) => (
                  <li key={alert} className="list-row">
                    <strong>{alert}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">No active alerts.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentView;
