import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { normalizeStoredScoreEntry, TERM_OPTIONS as QUARTER_OPTIONS } from "../utils/reporting";
import {
  formatSubjectAttendanceAverage,
  getCurrentStudentSubjects,
  mergeSubjectAttendanceRecords
} from "../utils/studentSubjects";
import "./TeacherDashboard.css";

const getStatusClassName = (value) => String(value || "N/A").toLowerCase().replace(/\s+/g, "-");
const SUBJECT_PANEL_COLORS = [
  "#2563eb",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f97316"
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
  ?? subject.q3
  ?? subject.q2
  ?? subject.q1
  ?? "N/A"
);
const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "N/A";

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};
const normalizeOptionalScoreArray = (value) => {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value.map((score) => normalizeStoredScoreEntry(score));
  return [normalizeStoredScoreEntry(value)];
};
const getQuarterScoreBreakdown = (subject, quarterKey) => {
  const quarter = subject?.quarters?.[quarterKey] || {};

  return {
    quizzes: normalizeOptionalScoreArray(quarter.writtenWork?.quizzes ?? quarter.quizzes),
    longTests: normalizeOptionalScoreArray(quarter.writtenWork?.longTests),
    activities: normalizeOptionalScoreArray(quarter.performanceTask?.activities ?? quarter.activities),
    projects: normalizeOptionalScoreArray(quarter.performanceTask?.projects),
    exams: normalizeOptionalScoreArray(quarter.finalExam?.exams ?? quarter.exams)
  };
};
const formatScoreListForDisplay = (values = []) => {
  const normalizedValues = values
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return normalizedValues.length ? normalizedValues.join(", ") : "N/A";
};

const StudentView = ({ section = "overview" }) => {
  const { currentUser } = useAuth();
  const {
    classes,
    currentStudent,
    teacherUsers,
    loading,
    error,
    requestClassJoin,
    getClassAttendanceRecords
  } = useSchoolData();
  const [classCode, setClassCode] = useState("");
  const [joinFeedback, setJoinFeedback] = useState(null);
  const [joiningClass, setJoiningClass] = useState(false);
  const [gradeSubjectFilter, setGradeSubjectFilter] = useState("");
  const [attendanceSubjectFilter, setAttendanceSubjectFilter] = useState("");
  const [attendancePage, setAttendancePage] = useState(1);
  const isDashboardSection = section === "dashboard" || section === "overview";
  const shouldShowJoinPanel = section === "join" || (isDashboardSection && !currentStudent?.classId);

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
    setGradeSubjectFilter("");
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
        {shouldShowJoinPanel && renderClassCodePanel()}
        <div className="empty-state">
          <h3>No student record found</h3>
          <p>Use Join Section to enter your section code and wait for teacher approval.</p>
        </div>
      </div>
    );
  }

  const visibleSubjects = getCurrentStudentSubjects({ student: currentStudent, teacherUsers });
  const visibleAttendanceLabel = formatSubjectAttendanceAverage(visibleSubjects, currentStudent.attendanceLabel);
  const dashboardSubjects = visibleSubjects.map((subject, index) => ({
    id: subject.id,
    name: subject.name,
    teacher: subject.teacher || "Teacher not assigned",
    color: SUBJECT_PANEL_COLORS[index % SUBJECT_PANEL_COLORS.length]
  }));
  const gradeSubjectOptions = [...new Set(visibleSubjects.map((subject) => subject.name))];
  const filteredGradeSubjects = gradeSubjectFilter
    ? visibleSubjects.filter((subject) => subject.name === gradeSubjectFilter)
    : visibleSubjects;
  const gradeTableRows = filteredGradeSubjects.flatMap((subject) => QUARTER_OPTIONS.map((quarter) => {
    const scores = getQuarterScoreBreakdown(subject, quarter.key);

    return {
      id: `${subject.id}-${quarter.key}`,
      subjectName: subject.name,
      teacherName: subject.teacher || "Teacher not assigned",
      quarterLabel: quarter.label,
      quarterGrade: subject?.[quarter.key] ?? "N/A",
      quizzes: formatScoreListForDisplay(scores.quizzes),
      longTests: formatScoreListForDisplay(scores.longTests),
      activities: formatScoreListForDisplay(scores.activities),
      projects: formatScoreListForDisplay(scores.projects),
      exams: formatScoreListForDisplay(scores.exams),
      finalGrade: subject.finalGrade ?? "N/A",
      attendanceLabel: subject.attendanceLabel || "N/A"
    };
  }));
  const currentClass = classes.find((classroom) => classroom.id === currentStudent.classId) || null;
  const classFees = Object.entries(currentClass?.fees || {})
    .map(([id, fee]) => {
      const payment = fee?.payments?.[currentStudent.id] || null;
      return {
        id,
        ...fee,
        status: payment?.paid ? "Paid" : "Unpaid",
        paidAt: payment?.paidAt || ""
      };
    })
    .sort((left, right) => (
      String(left.dueDate || "").localeCompare(String(right.dueDate || ""))
      || String(left.name || "").localeCompare(String(right.name || ""))
    ));
  const unpaidFeeCount = classFees.filter((fee) => fee.status !== "Paid").length;
  const attendanceReportRows = currentStudent.classId
    ? visibleSubjects
      .flatMap((subject) => {
        const primaryRecords = getClassAttendanceRecords(
          currentStudent.classId,
          subject.name,
          subject.code || subject.subjectCode || ""
        );
        const legacyRecords = subject.legacyName && subject.legacyName !== subject.name
          ? getClassAttendanceRecords(currentStudent.classId, subject.legacyName)
          : [];

        return mergeSubjectAttendanceRecords([primaryRecords, legacyRecords]).map((record) => ({
          id: `${subject.id}-${record.date}`,
          date: record.date,
          subject: subject.name,
          status: record.status === "no-class"
            ? "No Class"
            : formatAttendanceStatus(record.records?.[currentStudent.id]?.status),
          notes: record.status === "no-class"
            ? (record.noClassReason || "No class")
            : (record.records?.[currentStudent.id]?.remarks || "")
        }));
      })
      .filter((row) => row.status && row.status !== "Not Marked")
      .sort((left, right) => String(right.date).localeCompare(String(left.date)))
    : [];
  const attendanceSubjectOptions = [...new Set(visibleSubjects.map((subject) => subject.name).filter(Boolean))];
  const filteredAttendanceRows = attendanceSubjectFilter
    ? attendanceReportRows.filter((row) => row.subject === attendanceSubjectFilter)
    : attendanceReportRows;
  const countedAttendanceRows = filteredAttendanceRows.filter((row) => row.status !== "No Class");
  const attendanceSummary = {
    classDays: countedAttendanceRows.length,
    present: countedAttendanceRows.filter((row) => ["Present", "Tardy", "Excused"].includes(row.status)).length,
    absent: countedAttendanceRows.filter((row) => ["Absent", "Unexcused"].includes(row.status)).length
  };
  const attendanceTotalPages = Math.max(1, Math.ceil(filteredAttendanceRows.length / ATTENDANCE_PAGE_SIZE));
  const currentAttendancePage = Math.min(attendancePage, attendanceTotalPages);
  const paginatedAttendanceRows = filteredAttendanceRows.slice(
    (currentAttendancePage - 1) * ATTENDANCE_PAGE_SIZE,
    currentAttendancePage * ATTENDANCE_PAGE_SIZE
  );
  return (
    <div className="student-view">
      {shouldShowJoinPanel && renderClassCodePanel()}

      {isDashboardSection && (
        <div className="stats-grid">
          <div className="stat-card">
            <h4>Total Subjects</h4>
            <p>{visibleSubjects.length}</p>
          </div>
          <div className="stat-card">
            <h4>Attendance Rate</h4>
            <p>{visibleAttendanceLabel}</p>
          </div>
        </div>
      )}

      {isDashboardSection && (
        <>
          <div className="insight-grid">
            <div className="panel">
              <div className="panel-header">
                <h3>Subjects</h3>
                <span className="meta-badge">{dashboardSubjects.length} total</span>
              </div>
              {dashboardSubjects.length ? (
                <div className="handled-subject-list">
                  {dashboardSubjects.map((subject) => (
                    <div key={subject.id} className="handled-subject-item static">
                      <span className="handled-subject-accent" style={{ backgroundColor: subject.color }} />
                      <div className="handled-subject-copy">
                        <strong>{subject.name}</strong>
                        <p>{subject.teacher}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-copy">No subjects assigned yet.</p>
              )}
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Fees</h3>
                <span className="meta-badge">{unpaidFeeCount} unpaid</span>
              </div>
              {classFees.length ? (
                <ul className="stack-list">
                  {classFees.slice(0, 4).map((fee) => (
                    <li key={fee.id} className="list-row">
                      <div>
                        <strong>{fee.name || "Class fee"}</strong>
                        <p>{fee.dueDate ? `Due ${fee.dueDate}` : "No due date"}</p>
                      </div>
                      <span>{fee.status === "Paid" ? "Paid" : formatCurrency(fee.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No fees assigned yet.</p>
              )}
            </div>
          </div>
        </>
      )}

      {section === "grades" && (
        <div className="panel">
          <h3>My Academic Record</h3>
          <div className="table-filter-bar">
            <label className="selector-field">
              <span>Subject</span>
              <select
                value={gradeSubjectFilter}
                onChange={(event) => setGradeSubjectFilter(event.target.value)}
              >
                <option value="">All Subjects</option>
                {gradeSubjectOptions.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <table className="data-table student-academic-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Teacher</th>
                <th>Term</th>
                <th>Grade</th>
                <th>Quizzes</th>
                <th>Long Tests</th>
                <th>Activities</th>
                <th>Projects</th>
                <th>Exams</th>
                <th>Final Grade</th>
                <th>Attendance</th>
              </tr>
            </thead>
            <tbody>
              {gradeTableRows.map((row) => (
                <tr key={row.id}>
                  <td data-label="Subject">{row.subjectName}</td>
                  <td data-label="Teacher">{row.teacherName}</td>
                  <td data-label="Term">{row.quarterLabel}</td>
                  <td data-label="Grade">{row.quarterGrade}</td>
                  <td data-label="Quizzes">{row.quizzes}</td>
                  <td data-label="Long Tests">{row.longTests}</td>
                  <td data-label="Activities">{row.activities}</td>
                  <td data-label="Projects">{row.projects}</td>
                  <td data-label="Exams">{row.exams}</td>
                  <td data-label="Final Grade">{row.finalGrade}</td>
                  <td data-label="Attendance">{row.attendanceLabel}</td>
                </tr>
              ))}
              {gradeTableRows.length === 0 && (
                <tr>
                  <td colSpan="11">No grade records available yet.</td>
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
          <div className="stats-grid attendance-summary-grid">
            <div className="stat-card">
              <h4>Class Days</h4>
              <p>{attendanceSummary.classDays}</p>
            </div>
            <div className="stat-card">
              <h4>Present</h4>
              <p>{attendanceSummary.present}</p>
            </div>
            <div className="stat-card">
              <h4>Absent</h4>
              <p>{attendanceSummary.absent}</p>
            </div>
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

      {section === "fees" && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>My Fees</h3>
              <p className="muted-text">{currentClass?.name || currentClass?.section || currentStudent.className || "Assigned class only"}</p>
            </div>
            <span className="meta-badge">{classFees.length} fee{classFees.length === 1 ? "" : "s"}</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Fee</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Paid At</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {classFees.map((fee) => (
                <tr key={fee.id}>
                  <td data-label="Fee">{fee.name || "N/A"}</td>
                  <td data-label="Amount">{formatCurrency(fee.amount)}</td>
                  <td data-label="Due Date">{fee.dueDate || "N/A"}</td>
                  <td data-label="Status">
                    <span className={`status-pill ${getStatusClassName(fee.status === "Paid" ? "on track" : "needs support")}`}>
                      {fee.status}
                    </span>
                  </td>
                  <td data-label="Paid At">{fee.paidAt ? fee.paidAt.slice(0, 10) : "N/A"}</td>
                  <td data-label="Notes">{fee.notes || "N/A"}</td>
                </tr>
              ))}
              {!classFees.length && (
                <tr>
                  <td colSpan="6">No fees assigned to your class yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};

export default StudentView;
