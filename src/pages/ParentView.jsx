import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import "./TeacherDashboard.css";

const getStatusClassName = (value) => value.toLowerCase().replace(/\s+/g, "-");
const QUARTER_OPTIONS = [
  { key: "q1", label: "Q1" },
  { key: "q2", label: "Q2" },
  { key: "q3", label: "Q3" },
  { key: "q4", label: "Q4" }
];
const ATTENDANCE_PAGE_SIZE = 10;
const formatAttendanceStatus = (status) => {
  switch (String(status || "").toLowerCase()) {
    case "present":
      return "Present";
    case "absent":
      return "Absent";
    case "late":
      return "Tardy";
    case "excused":
      return "Excused";
    case "unexcused":
      return "Unexcused";
    case "no-class":
      return "No Class";
    default:
      return "Not Marked";
  }
};
const getSubjectSnapshotGrade = (subject) => (
  subject.finalGrade
  ?? subject.q4
  ?? subject.q3
  ?? subject.q2
  ?? subject.q1
  ?? "N/A"
);

const ParentView = ({ section = "overview" }) => {
  const { currentUser } = useAuth();
  const {
    linkedStudents,
    loading,
    error,
    parentStudentAccessRequests,
    requestParentStudentAccess,
    cancelParentStudentAccessRequest,
    getClassAttendanceRecords
  } = useSchoolData();
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [accessForm, setAccessForm] = useState({
    studentNumber: "",
    studentName: ""
  });
  const [accessFeedback, setAccessFeedback] = useState(null);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [cancellingRequestId, setCancellingRequestId] = useState("");
  const [attendanceSubjectFilter, setAttendanceSubjectFilter] = useState("");
  const [attendancePage, setAttendancePage] = useState(1);
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
  const subjectGradeSnapshot = linkedStudent?.subjects?.map((subject) => ({
    id: subject.id,
    name: subject.name,
    grade: getSubjectSnapshotGrade(subject)
  })) || [];
  const attendanceReportRows = linkedStudent?.classId
    ? linkedStudent.subjects
      .flatMap((subject) => (
        getClassAttendanceRecords(linkedStudent.classId, subject.name).map((record) => ({
          id: `${subject.id}-${record.date}`,
          date: record.date,
          subject: subject.name,
          status: record.status === "no-class"
            ? "No Class"
            : formatAttendanceStatus(record.records?.[linkedStudent.id]?.status),
          notes: record.status === "no-class"
            ? (record.noClassReason || "No class")
            : (record.records?.[linkedStudent.id]?.remarks || "")
        }))
      ))
      .filter((row) => row.status && row.status !== "Not Marked")
      .sort((left, right) => String(right.date).localeCompare(String(left.date)))
    : [];
  const attendanceSubjectOptions = [...new Set(attendanceReportRows.map((row) => row.subject))];
  const filteredAttendanceRows = attendanceSubjectFilter
    ? attendanceReportRows.filter((row) => row.subject === attendanceSubjectFilter)
    : attendanceReportRows;
  const attendanceTotalPages = Math.max(1, Math.ceil(filteredAttendanceRows.length / ATTENDANCE_PAGE_SIZE));
  const currentAttendancePage = Math.min(attendancePage, attendanceTotalPages);
  const paginatedAttendanceRows = filteredAttendanceRows.slice(
    (currentAttendancePage - 1) * ATTENDANCE_PAGE_SIZE,
    currentAttendancePage * ATTENDANCE_PAGE_SIZE
  );
  const pendingAccessRequests = parentStudentAccessRequests.filter((request) => (
    request.parentId === currentUser?.uid && request.status === "pending"
  ));

  useEffect(() => {
    setAttendanceSubjectFilter("");
    setAttendancePage(1);
  }, [linkedStudent?.id]);

  useEffect(() => {
    setAttendancePage(1);
  }, [attendanceSubjectFilter]);

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
            {subjectGradeSnapshot.length ? (
              <div className="report-strip">
                {subjectGradeSnapshot.map((subject) => (
                  <div key={subject.id}>
                    <span>{subject.name}</span>
                    <strong>{subject.grade}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-copy">No subject grades available yet.</p>
            )}
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
          <table className="data-table child-report-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Teacher</th>
                <th>Quarter 1</th>
                <th>Quarter 2</th>
                <th>Quarter 3</th>
                <th>Quarter 4</th>
                <th>Final Grade</th>
                <th>Attendance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {linkedStudent.subjects.map((subject) => (
                <tr key={subject.id}>
                  <td data-label="Subject">{subject.name}</td>
                  <td data-label="Teacher">{subject.teacher}</td>
                  {QUARTER_OPTIONS.map((quarter) => (
                    <td key={quarter.key} data-label={quarter.label}>
                      <div className="quarter-score-summary">
                        <strong>{subject[quarter.key] ?? "N/A"}</strong>
                      </div>
                    </td>
                  ))}
                  <td data-label="Final Grade">{subject.finalGrade ?? "N/A"}</td>
                  <td data-label="Attendance">{subject.attendanceLabel || "N/A"}</td>
                  <td data-label="Status"><span className={`status-pill ${getStatusClassName(subject.status)}`}>{subject.status}</span></td>
                </tr>
              ))}
              {linkedStudent.subjects.length === 0 && (
                <tr>
                  <td colSpan="9">No grade records available yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {section === "attendance" && (
        <div className="panel">
          <div className="panel-header">
            <h3>Attendance Report</h3>
          </div>
          <div className="table-filter-bar report-table-controls">
            <label className="selector-field">
              <span>Subject</span>
              <select
                value={attendanceSubjectFilter}
                onChange={(event) => setAttendanceSubjectFilter(event.target.value)}
              >
                <option value="">All Subjects</option>
                {attendanceSubjectOptions.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </label>
            <div className="pagination-controls">
              <button
                type="button"
                className="secondary-btn"
                disabled={currentAttendancePage <= 1}
                onClick={() => setAttendancePage((page) => Math.max(1, page - 1))}
              >
                Previous
              </button>
              <span>Page {currentAttendancePage} of {attendanceTotalPages}</span>
              <button
                type="button"
                className="secondary-btn"
                disabled={currentAttendancePage >= attendanceTotalPages}
                onClick={() => setAttendancePage((page) => Math.min(attendanceTotalPages, page + 1))}
              >
                Next
              </button>
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAttendanceRows.map((row) => (
                <tr key={row.id}>
                  <td data-label="Date">{row.date}</td>
                  <td data-label="Subject">{row.subject}</td>
                  <td data-label="Status">{row.status}</td>
                  <td data-label="Notes">{row.notes || "-"}</td>
                </tr>
              ))}
              {filteredAttendanceRows.length === 0 && (
                <tr>
                  <td colSpan="4">No attendance report available yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};

export default ParentView;
