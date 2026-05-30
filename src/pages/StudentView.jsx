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

const StudentView = ({ section = "overview" }) => {
  const { currentUser } = useAuth();
  const {
    classes,
    currentStudent,
    loading,
    error,
    requestClassJoin,
    getClassAttendanceRecords
  } = useSchoolData();
  const [classCode, setClassCode] = useState("");
  const [joinFeedback, setJoinFeedback] = useState(null);
  const [joiningClass, setJoiningClass] = useState(false);
  const [attendanceSubjectFilter, setAttendanceSubjectFilter] = useState("");
  const [attendancePage, setAttendancePage] = useState(1);
  const isDashboardSection = section === "dashboard" || section === "overview";

  const pendingRequest = classes
    .map((classroom) => ({
      className: classroom.name || classroom.section || "Section",
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
        message: `Request sent to ${classroom.name || classroom.section || "section"}.`
      });
    } catch (joinError) {
      setJoinFeedback({
        type: "error",
        message: joinError?.message || "Section request could not be sent."
      });
    } finally {
      setJoiningClass(false);
    }
  };

  const renderClassCodePanel = () => (
    <form className="panel" onSubmit={handleJoinClass}>
      <div className="panel-header">
        <h3>Join a Section</h3>
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
              <span>Section Code</span>
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

  useEffect(() => {
    setAttendanceSubjectFilter("");
    setAttendancePage(1);
  }, [currentStudent?.id]);

  useEffect(() => {
    setAttendancePage(1);
  }, [attendanceSubjectFilter]);

  if (loading) return <div className="loading-container">Loading academic records...</div>;
  if (error) return <div className="error-container">{error}</div>;
  if (!currentStudent) {
    return (
      <div className="student-view">
        {section === "join" && renderClassCodePanel()}
        <div className="empty-state">
          <h3>No student record found</h3>
          <p>Use Join Section to enter your section code and wait for teacher approval.</p>
        </div>
      </div>
    );
  }

  const focusSubjects = [...currentStudent.subjects]
    .sort((left, right) => (left.finalGrade ?? 0) - (right.finalGrade ?? 0))
    .slice(0, 3);
  const subjectGradeSnapshot = currentStudent.subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    grade: getSubjectSnapshotGrade(subject)
  }));
  const attendanceReportRows = currentStudent.classId
    ? currentStudent.subjects
      .flatMap((subject) => (
        getClassAttendanceRecords(currentStudent.classId, subject.name).map((record) => ({
          id: `${subject.id}-${record.date}`,
          date: record.date,
          subject: subject.name,
          status: record.status === "no-class"
            ? "No Class"
            : formatAttendanceStatus(record.records?.[currentStudent.id]?.status),
          notes: record.status === "no-class"
            ? (record.noClassReason || "No class")
            : (record.records?.[currentStudent.id]?.remarks || "")
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
        </>
      )}

      {section === "grades" && (
        <div className="panel">
          <h3>My Academic Record</h3>
          <table className="data-table student-academic-table">
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
              {currentStudent.subjects.map((subject) => (
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
              {currentStudent.subjects.length === 0 && (
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

          {filteredAttendanceRows.length ? (
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
              </tbody>
            </table>
          ) : (
            <p className="empty-copy">No attendance report available yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default StudentView;
