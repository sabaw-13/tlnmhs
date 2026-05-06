import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { formatShortDate } from "../utils/reporting";
import StudentRecordModal from "../components/StudentRecordModal";
import "./TeacherDashboard.css";

const getStatusClassName = (value) => value.toLowerCase().replace(/\s+/g, "-");
const ATTENDANCE_STATUS_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" }
];
const ATTENDED_STATUSES = new Set(["present", "late", "excused"]);

const getLocalDateValue = () => {
  const date = new Date();
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
};

const formatDateLabel = (dateValue) => {
  if (!dateValue) return "Selected date";

  return formatShortDate(`${dateValue}T00:00:00`);
};

const TeacherView = ({ section = "overview" }) => {
  const { userData, currentUser } = useAuth();
  const {
    error,
    loading,
    savingStudentId,
    savingAttendanceKey,
    teacherClassReports,
    getAttendanceRecord,
    saveDailyAttendanceRecord,
    saveStudentRecord
  } = useSchoolData();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [managingStudent, setManagingStudent] = useState(null);
  const [attendanceDate, setAttendanceDate] = useState(getLocalDateValue);
  const [dailyAttendanceDrafts, setDailyAttendanceDrafts] = useState({});
  const [isNoClassDay, setIsNoClassDay] = useState(false);
  const [noClassReason, setNoClassReason] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (!teacherClassReports.length) {
      setSelectedClassId("");
      return;
    }

    const hasSelectedClass = teacherClassReports.some((classroom) => classroom.id === selectedClassId);
    if (!selectedClassId || !hasSelectedClass) {
      setSelectedClassId(teacherClassReports[0].id);
    }
  }, [teacherClassReports, selectedClassId]);

  const selectedClass = teacherClassReports.find((classroom) => classroom.id === selectedClassId) || teacherClassReports[0] || null;
  const students = selectedClass?.students || [];
  const studentRosterKey = students.map((student) => student.id).join("|");
  const selectedAttendanceRecord = selectedClass ? getAttendanceRecord(selectedClass.id, attendanceDate) : null;

  useEffect(() => {
    setIsNoClassDay(selectedAttendanceRecord?.status === "no-class");
    setNoClassReason(selectedAttendanceRecord?.noClassReason || "");
    setDailyAttendanceDrafts((currentDrafts) => {
      const nextDrafts = {};

      students.forEach((student) => {
        nextDrafts[student.id] = selectedAttendanceRecord
          ? selectedAttendanceRecord.records?.[student.id]?.status || "present"
          : "present";
      });

      if (JSON.stringify(nextDrafts) === JSON.stringify(currentDrafts)) {
        return currentDrafts;
      }

      return nextDrafts;
    });
  }, [attendanceDate, selectedClassId, selectedAttendanceRecord, studentRosterKey]);

  const studentsNeedingSupport = students.filter((student) => student.performanceStatus === "Needs Support");
  const dailyPresentCount = isNoClassDay
    ? 0
    : students.filter((student) => ATTENDED_STATUSES.has(dailyAttendanceDrafts[student.id] || "present")).length;
  const dailyAbsentCount = isNoClassDay
    ? 0
    : students.filter((student) => (dailyAttendanceDrafts[student.id] || "present") === "absent").length;
  const topPerformer = [...students]
    .filter((student) => Number.isFinite(student.gpa))
    .sort((left, right) => right.gpa - left.gpa)[0] || null;
  const recentUpdates = [...students]
    .filter((student) => student.updatedAt || student.recentActivity.length)
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
    .slice(0, 5);
  const gradeDistribution = [
    { label: "Excellent", count: students.filter((student) => Number.isFinite(student.gpa) && student.gpa >= 90).length },
    { label: "On Track", count: students.filter((student) => Number.isFinite(student.gpa) && student.gpa >= 80 && student.gpa < 90).length },
    { label: "Needs Support", count: students.filter((student) => !Number.isFinite(student.gpa) || student.gpa < 80).length }
  ];
  const sectionMeta = {
    overview: "Teaching Overview",
    attendance: "Attendance",
    gradebook: "Gradebook",
    reports: "Reports"
  };
  const classTeacherName = selectedClass?.teacherName
    || selectedClass?.adviserName
    || userData?.displayName
    || userData?.email
    || currentUser?.email
    || "Assigned Teacher";

  const openStudentModal = (student = null) => {
    setManagingStudent(student || {});
    setSaveMessage("");
  };

  const handleDailyAttendanceChange = (studentId, value) => {
    setDailyAttendanceDrafts((currentDrafts) => ({
      ...currentDrafts,
      [studentId]: value
    }));
  };

  const handleMarkAll = (status) => {
    setDailyAttendanceDrafts(students.reduce((drafts, student) => ({
      ...drafts,
      [student.id]: status
    }), {}));
  };

  const handleSaveDailyAttendance = async () => {
    await saveDailyAttendanceRecord({
      classId: selectedClass?.id,
      className: selectedClass?.name || selectedClass?.section || "",
      date: attendanceDate,
      isNoClass: isNoClassDay,
      noClassReason,
      entries: students.map((student) => ({
        studentId: student.id,
        studentName: student.name,
        status: dailyAttendanceDrafts[student.id] || "present"
      }))
    });

    setSaveMessage(isNoClassDay
      ? `${formatDateLabel(attendanceDate)} marked as no class.`
      : `Attendance saved for ${formatDateLabel(attendanceDate)}.`);
  };

  const handleSaveStudent = async (formData) => {
    const now = new Date().toISOString();
    const summaryParts = [];

    if (formData.gpa !== "") summaryParts.push(`GPA ${formData.gpa}`);
    if (formData.attendance !== "") summaryParts.push(`Attendance ${formData.attendance}%`);

    const activityEntry = {
      date: formatShortDate(now),
      activity: managingStudent?.id ? "Teacher Update" : "Student Added",
      result: summaryParts.length ? summaryParts.join(" | ") : "Student record updated",
      remarks: formData.teacherRemarks || formData.performanceStatus
    };

    await saveStudentRecord({
      studentId: managingStudent?.id,
      payload: {
        ...formData,
        classId: selectedClass?.id,
        teacherId: selectedClass?.teacherId || selectedClass?.teacherUid || "",
        teacherEmail: selectedClass?.teacherEmail || selectedClass?.adviserEmail || "",
        teacherName: classTeacherName,
        activities: managingStudent?.id
          ? [activityEntry, ...(Array.isArray(managingStudent?.raw?.activities)
            ? managingStudent.raw.activities
            : Object.values(managingStudent?.raw?.activities || {}))].slice(0, 6)
          : [activityEntry]
      }
    });

    setManagingStudent(null);
    setSaveMessage(managingStudent?.id ? "Student record updated." : "Student added to this class.");
  };

  if (loading) return <div className="loading-container">Loading dashboard...</div>;
  if (!teacherClassReports.length) {
    return (
      <div className="empty-state">
        <h3>No classes assigned</h3>
        <p>Add class records in Firebase under <code>classes</code> and assign the teacher UID or email to begin tracking student progress.</p>
      </div>
    );
  }

  const renderClassSelector = () => (
    <div className="toolbar">
      <div>
        <h3>{sectionMeta[section]}</h3>
      </div>
      <div className="toolbar-actions">
        <label className="selector-field">
          <span>Class</span>
          <select value={selectedClass?.id || ""} onChange={(event) => setSelectedClassId(event.target.value)}>
            {teacherClassReports.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name || classroom.section || classroom.id}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );

  return (
    <div className="teacher-view">
      {error && <div className="error-container">{error}</div>}
      {saveMessage && <div className="success-banner">{saveMessage}</div>}

      {section === "overview" && (
        <div className="stats-grid">
          <div className="stat-card">
            <h4>Assigned Classes</h4>
            <p>{teacherClassReports.length}</p>
          </div>
          <div className="stat-card">
            <h4>Class Average</h4>
            <p>{selectedClass?.averageGpa ?? "N/A"}</p>
          </div>
          <div className="stat-card">
            <h4>Attendance Average</h4>
            <p>{Number.isFinite(selectedClass?.averageAttendance) ? `${selectedClass.averageAttendance}%` : "N/A"}</p>
          </div>
          <div className="stat-card">
            <h4>Students in Class</h4>
            <p>{students.length}</p>
          </div>
        </div>
      )}

      {renderClassSelector()}

      {section === "overview" && (
        <>
          <div className="insight-grid">
            <div className="panel">
              <div className="panel-header">
                <h3>{selectedClass?.name || selectedClass?.section || "Selected Class"}</h3>
                <div className="inline-actions">
                  {(selectedClass?.subject || selectedClass?.gradeLevel) && (
                    <span className="meta-badge">{selectedClass?.subject || selectedClass?.gradeLevel}</span>
                  )}
                  <span className="meta-badge">{classTeacherName}</span>
                </div>
              </div>
              <div className="report-strip">
                <div>
                  <span>Students</span>
                  <strong>{students.length}</strong>
                </div>
                <div>
                  <span>Completion</span>
                  <strong>{selectedClass?.completionRate ?? 0}%</strong>
                </div>
                <div>
                  <span>Excellence</span>
                  <strong>{selectedClass?.excellentCount ?? 0}</strong>
                </div>
              </div>
              <p className="mt-4">
                {topPerformer
                  ? `${topPerformer.name} is leading this class with a ${topPerformer.gpa} average.`
                  : "Add students to start building this class roster."}
              </p>
            </div>

            <div className="panel">
              <h3>Support Watchlist</h3>
              {studentsNeedingSupport.length ? (
                <ul className="stack-list">
                  {studentsNeedingSupport.slice(0, 4).map((student) => (
                    <li key={student.id} className="list-row">
                      <div>
                        <strong>{student.name}</strong>
                        <p>{student.alerts[0] || "Monitor learner progress."}</p>
                      </div>
                      <button type="button" className="secondary-btn" onClick={() => openStudentModal(student)}>
                        Edit
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No current alerts.</p>
              )}
            </div>
          </div>

          <div className="panel">
            <h3>Class Roster</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Average</th>
                  <th>Attendance</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td data-label="Name">{student.name}</td>
                    <td data-label="Average">{student.gpa ?? "N/A"}</td>
                    <td data-label="Attendance">{student.attendanceLabel}</td>
                    <td data-label="Status"><span className={`status-pill ${getStatusClassName(student.performanceStatus)}`}>{student.performanceStatus}</span></td>
                    <td data-label="Action">
                      <button className="secondary-btn" type="button" onClick={() => openStudentModal(student)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td colSpan="5">No students found for this class.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {section === "gradebook" && (
        <div className="panel">
          <div className="panel-header">
            <h3>Class Gradebook</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Q1 Avg</th>
                <th>Q2 Avg</th>
                <th>Attendance</th>
                <th>Performance</th>
                <th>Remarks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td data-label="Name">{student.name}</td>
                  <td data-label="Q1 Avg">{student.q1Average ?? "N/A"}</td>
                  <td data-label="Q2 Avg">{student.q2Average ?? "N/A"}</td>
                  <td data-label="Attendance">{student.attendanceLabel}</td>
                  <td data-label="Performance"><span className={`status-pill ${getStatusClassName(student.performanceStatus)}`}>{student.performanceStatus}</span></td>
                  <td data-label="Remarks">{student.teacherRemarks || "None"}</td>
                  <td data-label="Action">
                    <button className="secondary-btn" type="button" onClick={() => openStudentModal(student)}>
                      {savingStudentId === student.id ? "Saving..." : "Edit"}
                    </button>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan="7">No students found for this class.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {section === "attendance" && (
        <>
          <div className="panel attendance-sheet">
            <div className="panel-header">
              <div>
                <h3>Attendance Sheet</h3>
                <p className="muted-text">{selectedClass?.name || selectedClass?.section || "Selected Class"} - {formatDateLabel(attendanceDate)}</p>
              </div>
              <span className="meta-badge">{students.length} students</span>
            </div>

            <div className="attendance-sheet-toolbar">
              <label className="selector-field">
                <span>Date</span>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(event) => setAttendanceDate(event.target.value)}
                />
              </label>
              <label className="attendance-toggle">
                <input
                  type="checkbox"
                  checked={isNoClassDay}
                  onChange={(event) => setIsNoClassDay(event.target.checked)}
                />
                <span>No Class</span>
              </label>
              {!isNoClassDay && (
                <div className="attendance-mark-all">
                  <button type="button" className="secondary-btn" onClick={() => handleMarkAll("present")}>
                    All Present
                  </button>
                  <button type="button" className="secondary-btn" onClick={() => handleMarkAll("absent")}>
                    All Absent
                  </button>
                </div>
              )}
            </div>

            {isNoClassDay ? (
              <div className="form-group">
                <label>Reason</label>
                <textarea
                  value={noClassReason}
                  onChange={(event) => setNoClassReason(event.target.value)}
                  rows="3"
                  placeholder="Example: Holiday, school activity, or class suspension"
                />
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id}>
                      <td data-label="Student">{student.name}</td>
                      <td data-label="Attendance">
                        <div className="attendance-options" role="group" aria-label={`Attendance for ${student.name}`}>
                          {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`attendance-option ${option.value}${(dailyAttendanceDrafts[student.id] || "present") === option.value ? " active" : ""}`}
                              onClick={() => handleDailyAttendanceChange(student.id, option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {students.length === 0 && (
                    <tr>
                      <td colSpan="2">No students found for this class.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {!isNoClassDay && (
              <div className="attendance-sheet-summary">
                <span>Present/Credited: <strong>{dailyPresentCount}</strong></span>
                <span>Absent: <strong>{dailyAbsentCount}</strong></span>
              </div>
            )}

            <button
              type="button"
              className="primary-btn attendance-save-btn"
              disabled={savingAttendanceKey === `${selectedClass?.id}-${attendanceDate}`}
              onClick={handleSaveDailyAttendance}
            >
              {savingAttendanceKey === `${selectedClass?.id}-${attendanceDate}` ? "Saving..." : "Save Attendance"}
            </button>
          </div>
        </>
      )}

      {section === "reports" && (
        <>
          <div className="insight-grid">
            <div className="panel">
              <h3>Grade Distribution</h3>
              <div className="distribution-list">
                {gradeDistribution.map((item) => {
                  const percentage = students.length ? Math.round((item.count / students.length) * 100) : 0;

                  return (
                    <div key={item.label} className="distribution-item">
                      <div className="list-row">
                        <strong>{item.label}</strong>
                        <span>{item.count} students</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <h3>Recent Updates</h3>
              {recentUpdates.length ? (
                <ul className="stack-list">
                  {recentUpdates.map((student) => (
                    <li key={student.id} className="list-row">
                      <div>
                        <strong>{student.name}</strong>
                        <p>{student.recentActivity[0]?.result || `Updated ${student.updatedLabel}`}</p>
                      </div>
                      <span>{student.updatedLabel}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No recent updates.</p>
              )}
            </div>
          </div>

          <div className="panel">
            <h3>Performance Report</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Overall Average</th>
                  <th>Attendance</th>
                  <th>Status</th>
                  <th>Alerts</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td data-label="Student">{student.name}</td>
                    <td data-label="Overall Average">{student.gpa ?? "N/A"}</td>
                    <td data-label="Attendance">{student.attendanceLabel}</td>
                    <td data-label="Status"><span className={`status-pill ${getStatusClassName(student.performanceStatus)}`}>{student.performanceStatus}</span></td>
                    <td data-label="Alerts">{student.alerts.join(" ") || "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {managingStudent && (
        <StudentRecordModal
          title={managingStudent.id ? `Edit Student: ${managingStudent.name}` : "Add Student"}
          student={managingStudent.id ? managingStudent : null}
          defaultClassId={selectedClass?.id || ""}
          defaultTeacherId={selectedClass?.teacherId || selectedClass?.teacherUid || ""}
          defaultTeacherName={classTeacherName}
          lockIdentityFields
          saving={Boolean(savingStudentId)}
          submitLabel={managingStudent.id ? "Save Changes" : "Add Student"}
          onClose={() => setManagingStudent(null)}
          onSubmit={handleSaveStudent}
        />
      )}
    </div>
  );
};

export default TeacherView;
