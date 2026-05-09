import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import "./TeacherDashboard.css";

const getStatusClassName = (value) => value.toLowerCase().replace(/\s+/g, "-");

const ParentView = ({ section = "overview" }) => {
  const { currentUser } = useAuth();
  const {
    linkedStudents,
    loading,
    error,
    parentStudentAccessRequests,
    requestParentStudentAccess,
    cancelParentStudentAccessRequest
  } = useSchoolData();
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [accessForm, setAccessForm] = useState({
    studentNumber: "",
    studentName: ""
  });
  const [accessFeedback, setAccessFeedback] = useState(null);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [cancellingRequestId, setCancellingRequestId] = useState("");
  const isDashboardSection = section === "dashboard" || section === "overview";

  useEffect(() => {
    if (!linkedStudents.length) {
      setSelectedStudentId("");
      return;
    }

    const hasSelectedStudent = linkedStudents.some((student) => student.id === selectedStudentId);
    if (!selectedStudentId || !hasSelectedStudent) {
      setSelectedStudentId(linkedStudents[0].id);
    }
  }, [linkedStudents, selectedStudentId]);

  const linkedStudent = linkedStudents.find((student) => student.id === selectedStudentId) || linkedStudents[0] || null;
  const pendingAccessRequests = parentStudentAccessRequests.filter((request) => (
    request.parentId === currentUser?.uid && request.status === "pending"
  ));

  const handleRequestAccess = async (event) => {
    event.preventDefault();
    setRequestingAccess(true);
    setAccessFeedback(null);

    try {
      const student = await requestParentStudentAccess(accessForm);
      setAccessForm({
        studentNumber: "",
        studentName: ""
      });
      setAccessFeedback({
        type: "success",
        message: `Access request sent for ${student.name}.`
      });
    } catch (requestError) {
      setAccessFeedback({
        type: "error",
        message: requestError?.message || "Student access request could not be sent."
      });
    } finally {
      setRequestingAccess(false);
    }
  };

  const handleCancelAccessRequest = async (request) => {
    setCancellingRequestId(request.id);
    setAccessFeedback(null);

    try {
      await cancelParentStudentAccessRequest(request.id);
      setAccessFeedback({
        type: "success",
        message: `Access request for ${request.studentName || "student"} cancelled.`
      });
    } catch (cancelError) {
      setAccessFeedback({
        type: "error",
        message: cancelError?.message || "Access request could not be cancelled."
      });
    } finally {
      setCancellingRequestId("");
    }
  };

  const renderAccessRequestPanel = () => (
    <form className="panel" onSubmit={handleRequestAccess}>
      <div className="panel-header">
        <h3>Request Student Access</h3>
        {pendingAccessRequests.length > 0 && <span className="meta-badge">{pendingAccessRequests.length} pending</span>}
      </div>
      {accessFeedback && (
        <div className={accessFeedback.type === "error" ? "error-banner compact" : "success-banner compact"}>
          {accessFeedback.message}
        </div>
      )}
      {pendingAccessRequests.length > 0 && (
        <ul className="stack-list">
          {pendingAccessRequests.map((request) => (
            <li key={request.id} className="list-row">
              <div>
                <strong>{request.studentName}</strong>
                <p>Waiting for admin approval</p>
              </div>
              <button
                type="button"
                className="secondary-btn"
                disabled={cancellingRequestId === request.id}
                onClick={() => handleCancelAccessRequest(request)}
              >
                {cancellingRequestId === request.id ? "Cancelling..." : "Cancel"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="modal-form-grid">
        <div className="form-group">
          <label>Student ID Number</label>
          <input
            type="text"
            value={accessForm.studentNumber}
            onChange={(event) => setAccessForm({ ...accessForm, studentNumber: event.target.value })}
            placeholder="Enter student ID"
          />
        </div>
        <div className="form-group">
          <label>Student Name</label>
          <input
            type="text"
            value={accessForm.studentName}
            onChange={(event) => setAccessForm({ ...accessForm, studentName: event.target.value })}
            placeholder="Or enter full name"
          />
        </div>
      </div>
      <div className="modal-actions">
        <button type="submit" className="primary-btn" disabled={requestingAccess}>
          {requestingAccess ? "Sending..." : "Request Access"}
        </button>
      </div>
    </form>
  );

  if (loading) return <div className="loading-container">Loading child records...</div>;
  if (error) return <div className="error-container">{error}</div>;
  if (!linkedStudent) {
    return (
      <div className="parent-view">
        {section === "requests" && renderAccessRequestPanel()}
        <div className="empty-state">
          <h3>No linked student yet</h3>
          <p>Use Requests to find your student and ask for access. Admin approval is required before records appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="parent-view">
      {section === "requests" && renderAccessRequestPanel()}

      {section !== "requests" && linkedStudents.length > 1 && (
        <div className="toolbar">
          <div>
            <h3>My Students</h3>
          </div>
          <div className="toolbar-actions">
            <label className="selector-field">
              <span>Student</span>
              <select value={linkedStudent.id} onChange={(event) => setSelectedStudentId(event.target.value)}>
                {linkedStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {section !== "requests" && (
        <div className="panel hero-panel">
          <div className="panel-header">
            <h3>Child: <span className="text-primary">{linkedStudent.name}</span></h3>
            {linkedStudent.className && <span className="meta-badge">{linkedStudent.className}</span>}
          </div>
        </div>
      )}

      {isDashboardSection && (
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
      )}

      {isDashboardSection && (
        <div className="insight-grid">
          <div className="panel">
            <h3>Parent Summary</h3>
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
            <p className="mt-4">{linkedStudent.teacherRemarks || "No teacher note yet."}</p>
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
              <p className="empty-copy">No active alerts.</p>
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
                <th>Activities</th>
                <th>Quizzes</th>
                <th>Exams</th>
                <th>Q1</th>
                <th>Q2</th>
                <th>Q3</th>
                <th>Q4</th>
                <th>Final Grade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {linkedStudent.subjects.map((subject) => (
                <tr key={subject.id}>
                  <td data-label="Subject">{subject.name}</td>
                  <td data-label="Teacher">{subject.teacher}</td>
                  <td data-label="Activities">{subject.activities ?? "N/A"}</td>
                  <td data-label="Quizzes">{subject.quizzes ?? "N/A"}</td>
                  <td data-label="Exams">{subject.exams ?? "N/A"}</td>
                  <td data-label="Q1">{subject.q1 ?? "N/A"}</td>
                  <td data-label="Q2">{subject.q2 ?? "N/A"}</td>
                  <td data-label="Q3">{subject.q3 ?? "N/A"}</td>
                  <td data-label="Q4">{subject.q4 ?? "N/A"}</td>
                  <td data-label="Final Grade">{subject.finalGrade ?? "N/A"}</td>
                  <td data-label="Status"><span className={`status-pill ${getStatusClassName(subject.status)}`}>{subject.status}</span></td>
                </tr>
              ))}
              {linkedStudent.subjects.length === 0 && (
                <tr>
                  <td colSpan="11">No grade records available yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {section === "updates" && (
        <div className="panel">
          <h3>Recent Updates</h3>
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
            <p className="empty-copy">No recent updates.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default ParentView;
