import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import "./TeacherDashboard.css";

const getStatusClassName = (value) => value.toLowerCase().replace(/\s+/g, "-");
const formatScoreList = (scores) => {
  if (!Array.isArray(scores) || !scores.length) return "N/A";

  return scores
    .map((score, index) => `${index + 1}: ${score === "" || score === null || score === undefined ? "-" : score}`)
    .join(", ");
};

const StudentView = ({ section = "overview" }) => {
  const { currentUser } = useAuth();
  const {
    classes,
    currentStudent,
    loading,
    error,
    requestClassJoin
  } = useSchoolData();
  const [classCode, setClassCode] = useState("");
  const [joinFeedback, setJoinFeedback] = useState(null);
  const [joiningClass, setJoiningClass] = useState(false);
  const isDashboardSection = section === "dashboard" || section === "overview";

  const pendingRequest = classes
    .map((classroom) => ({
      className: classroom.name || classroom.section || "Class",
      classCode: classroom.classCode || classroom.id,
      request: classroom.joinRequests?.[currentUser?.uid]
    }))
    .find((item) => item.request?.status === "pending");

  const handleJoinClass = async (event) => {
    event.preventDefault();
    setJoiningClass(true);
    setJoinFeedback(null);

    try {
      const classroom = await requestClassJoin(classCode);
      setClassCode("");
      setJoinFeedback({
        type: "success",
        message: `Request sent to ${classroom.name || classroom.section || "class"}.`
      });
    } catch (joinError) {
      setJoinFeedback({
        type: "error",
        message: joinError?.message || "Class request could not be sent."
      });
    } finally {
      setJoiningClass(false);
    }
  };

  const renderClassCodePanel = () => (
    <form className="panel" onSubmit={handleJoinClass}>
      <div className="panel-header">
        <h3>Join a Class</h3>
        {pendingRequest && <span className="meta-badge">Pending</span>}
      </div>
      {pendingRequest ? (
        <p className="muted-text">
          Your request for {pendingRequest.className} is waiting for teacher approval.
        </p>
      ) : (
        <>
          {joinFeedback && (
            <div className={joinFeedback.type === "error" ? "error-banner compact" : "success-banner compact"}>
              {joinFeedback.message}
            </div>
          )}
          <div className="join-code-row">
            <label className="selector-field">
              <span>Class Code</span>
              <input
                type="text"
                value={classCode}
                onChange={(event) => setClassCode(event.target.value.toUpperCase())}
                placeholder="Enter code"
                required
              />
            </label>
            <button type="submit" className="primary-btn" disabled={joiningClass}>
              {joiningClass ? "Sending..." : "Request Join"}
            </button>
          </div>
        </>
      )}
    </form>
  );

  if (loading) return <div className="loading-container">Loading academic records...</div>;
  if (error) return <div className="error-container">{error}</div>;
  if (!currentStudent) {
    return (
      <div className="student-view">
        {section === "join" && renderClassCodePanel()}
        <div className="empty-state">
          <h3>No student record found</h3>
          <p>Use Join Class to enter your class code and wait for teacher approval.</p>
        </div>
      </div>
    );
  }

  const focusSubjects = [...currentStudent.subjects]
    .sort((left, right) => (left.finalGrade ?? 0) - (right.finalGrade ?? 0))
    .slice(0, 3);

  return (
    <div className="student-view">
      {section === "join" && renderClassCodePanel()}

      {isDashboardSection && (
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

      {isDashboardSection && (
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
                <th>Activities</th>
                <th>Quizzes</th>
                <th>Exams</th>
                <th>Quarter 1</th>
                <th>Quarter 2</th>
                <th>Quarter 3</th>
                <th>Quarter 4</th>
                <th>Final Grade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {currentStudent.subjects.map((subject) => (
                <tr key={subject.id}>
                  <td data-label="Subject">{subject.name}</td>
                  <td data-label="Teacher">{subject.teacher}</td>
                  <td data-label="Activities">{formatScoreList(subject.activities)}</td>
                  <td data-label="Quizzes">{formatScoreList(subject.quizzes)}</td>
                  <td data-label="Exams">{formatScoreList(subject.exams)}</td>
                  <td data-label="Quarter 1">{subject.q1 ?? "N/A"}</td>
                  <td data-label="Quarter 2">{subject.q2 ?? "N/A"}</td>
                  <td data-label="Quarter 3">{subject.q3 ?? "N/A"}</td>
                  <td data-label="Quarter 4">{subject.q4 ?? "N/A"}</td>
                  <td data-label="Final Grade">{subject.finalGrade ?? "N/A"}</td>
                  <td data-label="Status"><span className={`status-pill ${getStatusClassName(subject.status)}`}>{subject.status}</span></td>
                </tr>
              ))}
              {currentStudent.subjects.length === 0 && (
                <tr>
                  <td colSpan="11">No grade records available yet.</td>
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
