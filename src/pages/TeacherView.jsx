import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { clamp, computePerformanceStatus, formatShortDate, toNumber } from "../utils/reporting";
import "./TeacherDashboard.css";

const createEmptySubject = () => ({
  id: "",
  name: "",
  teacher: "",
  q1: "",
  q2: "",
  q3: "",
  q4: ""
});

const toActivitiesArray = (activities) => {
  if (Array.isArray(activities)) return activities;
  if (activities && typeof activities === "object") return Object.values(activities);
  return [];
};

const getStatusClassName = (value) => value.toLowerCase().replace(/\s+/g, "-");

const TeacherView = ({ section = "overview" }) => {
  const { userData } = useAuth();
  const {
    error,
    loading,
    savingStudentId,
    teacherClassReports,
    updateStudentRecord
  } = useSchoolData();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [editingStudent, setEditingStudent] = useState(null);
  const [editFormData, setEditFormData] = useState({
    gpa: "",
    attendance: "",
    performanceStatus: "On Track",
    teacherRemarks: "",
    subjects: [createEmptySubject()]
  });
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
  const studentsNeedingSupport = students.filter((student) => student.performanceStatus === "Needs Support");
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
    overview: {
      title: "Teaching Overview",
      description: "Track class performance, identify at-risk learners, and monitor the live repository."
    },
    gradebook: {
      title: "Gradebook and Attendance",
      description: "Input, revise, and publish student grades, attendance, and performance remarks."
    },
    reports: {
      title: "Realtime Reports",
      description: "Review classroom trends, update history, and intervention priorities."
    }
  };

  const handleEditProgress = (student) => {
    const subjects = student.subjects.length
      ? student.subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        teacher: subject.teacher,
        q1: subject.q1 ?? "",
        q2: subject.q2 ?? "",
        q3: subject.q3 ?? "",
        q4: subject.q4 ?? ""
      }))
      : [createEmptySubject()];

    setEditingStudent(student);
    setEditFormData({
      gpa: student.gpa ?? "",
      attendance: student.attendanceRate ?? "",
      performanceStatus: student.performanceStatus || "On Track",
      teacherRemarks: student.teacherRemarks || "",
      subjects
    });
    setSaveMessage("");
  };

  const handleSaveProgress = async (event) => {
    event.preventDefault();
    if (!editingStudent) return;

    try {
      const normalizedSubjects = editFormData.subjects
        .filter((subject) => subject.name.trim())
        .map((subject, index) => {
          const quarterGrades = [
            toNumber(subject.q1),
            toNumber(subject.q2),
            toNumber(subject.q3),
            toNumber(subject.q4)
          ].filter((grade) => Number.isFinite(grade));
          const computedAverage = quarterGrades.length
            ? Number((quarterGrades.reduce((sum, grade) => sum + grade, 0) / quarterGrades.length).toFixed(1))
            : null;

          return {
            id: subject.id || `subject-${index + 1}`,
            name: subject.name.trim(),
            teacher: subject.teacher || userData?.displayName || userData?.email || "Assigned Teacher",
            q1: toNumber(subject.q1),
            q2: toNumber(subject.q2),
            q3: toNumber(subject.q3),
            q4: toNumber(subject.q4),
            finalGrade: computedAverage,
            status: computedAverage !== null && computedAverage >= 75 ? "Passed" : "Needs Attention"
          };
        });

      const attendanceRate = clamp(toNumber(editFormData.attendance) ?? 0, 0, 100);
      const computedGpa = toNumber(editFormData.gpa)
        ?? (normalizedSubjects.length
          ? Number((normalizedSubjects.reduce((sum, subject) => sum + (subject.finalGrade || 0), 0) / normalizedSubjects.length).toFixed(1))
          : null);
      const performanceStatus = editFormData.performanceStatus || computePerformanceStatus({
        gpa: computedGpa,
        attendanceRate,
        subjects: normalizedSubjects
      });
      const now = new Date().toISOString();
      const activityEntry = {
        date: formatShortDate(now),
        activity: "Teacher Update",
        result: `GPA ${computedGpa ?? "N/A"} | Attendance ${attendanceRate}%`,
        remarks: editFormData.teacherRemarks || performanceStatus
      };

      await updateStudentRecord(editingStudent.id, {
        gpa: computedGpa,
        attendance: `${attendanceRate}%`,
        attendanceRate,
        performanceStatus,
        teacherRemarks: editFormData.teacherRemarks.trim(),
        subjects: normalizedSubjects,
        activities: [activityEntry, ...toActivitiesArray(editingStudent.raw?.activities)].slice(0, 6),
        lastAttendance: formatShortDate(now)
      });

      setEditingStudent(null);
      setSaveMessage("Student progress saved to the centralized repository.");
    } catch (updateError) {
      console.error("Error updating progress:", updateError);
      setSaveMessage("Failed to update student progress. Check Firebase write permissions.");
    }
  };

  const updateSubjectField = (index, field, value) => {
    setEditFormData((previous) => ({
      ...previous,
      subjects: previous.subjects.map((subject, subjectIndex) => (
        subjectIndex === index ? { ...subject, [field]: value } : subject
      ))
    }));
  };

  const addSubjectRow = () => {
    setEditFormData((previous) => ({
      ...previous,
      subjects: [...previous.subjects, createEmptySubject()]
    }));
  };

  const removeSubjectRow = (index) => {
    setEditFormData((previous) => ({
      ...previous,
      subjects: previous.subjects.filter((_, subjectIndex) => subjectIndex !== index)
    }));
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
        <h3>{sectionMeta[section].title}</h3>
        <p>{sectionMeta[section].description}</p>
      </div>
      <label className="selector-field">
        <span>Selected Class</span>
        <select value={selectedClass?.id || ""} onChange={(event) => setSelectedClassId(event.target.value)}>
          {teacherClassReports.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classroom.name || classroom.section || classroom.id}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <div className="teacher-view">
      {error && <div className="error-container">{error}</div>}
      {saveMessage && <div className="success-banner">{saveMessage}</div>}

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
          <p>{selectedClass?.averageAttendance ? `${selectedClass.averageAttendance}%` : "N/A"}</p>
        </div>
        <div className="stat-card">
          <h4>Students Needing Support</h4>
          <p>{studentsNeedingSupport.length}</p>
        </div>
      </div>

      {renderClassSelector()}

      {section === "overview" && (
        <>
          <div className="insight-grid">
            <div className="panel">
              <h3>{selectedClass?.name || selectedClass?.section || "Selected Class"}</h3>
              <p className="muted-text">{selectedClass?.subject || selectedClass?.gradeLevel || "Live class overview"}</p>
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
                  ? `${topPerformer.name} is currently leading this class with a ${topPerformer.gpa} average.`
                  : "Add or update learner records to generate classroom insights."}
              </p>
            </div>

            <div className="panel">
              <h3>Students Needing Intervention</h3>
              {studentsNeedingSupport.length ? (
                <ul className="stack-list">
                  {studentsNeedingSupport.slice(0, 4).map((student) => (
                    <li key={student.id} className="list-row">
                      <div>
                        <strong>{student.name}</strong>
                        <p>{student.alerts[0] || "Monitor learner progress."}</p>
                      </div>
                      <button type="button" className="secondary-btn" onClick={() => handleEditProgress(student)}>
                        Update
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No active intervention alerts for this class.</p>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Live Student Snapshot</h3>
              <span className="status-pill info">Realtime</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Average</th>
                  <th>Attendance</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td>{student.name}</td>
                    <td>{student.gpa ?? "N/A"}</td>
                    <td>{student.attendanceLabel}</td>
                    <td><span className={`status-pill ${getStatusClassName(student.performanceStatus)}`}>{student.performanceStatus}</span></td>
                    <td>{student.updatedLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {section === "gradebook" && (
        <div className="panel">
          <div className="panel-header">
            <h3>Centralized Gradebook</h3>
            <span className="muted-text">Input grades, attendance, and teacher remarks in one place.</span>
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
                  <td>{student.name}</td>
                  <td>{student.q1Average ?? "N/A"}</td>
                  <td>{student.q2Average ?? "N/A"}</td>
                  <td>{student.attendanceLabel}</td>
                  <td><span className={`status-pill ${getStatusClassName(student.performanceStatus)}`}>{student.performanceStatus}</span></td>
                  <td>{student.teacherRemarks || "No remarks yet"}</td>
                  <td>
                    <button className="secondary-btn" type="button" onClick={() => handleEditProgress(student)}>
                      {savingStudentId === student.id ? "Saving..." : "Edit Record"}
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
                <p className="empty-copy">No recent updates yet for this class.</p>
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
                    <td>{student.name}</td>
                    <td>{student.gpa ?? "N/A"}</td>
                    <td>{student.attendanceLabel}</td>
                    <td><span className={`status-pill ${getStatusClassName(student.performanceStatus)}`}>{student.performanceStatus}</span></td>
                    <td>{student.alerts.join(" ") || "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editingStudent && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Edit Progress: {editingStudent.name}</h3>
            <form onSubmit={handleSaveProgress}>
              <div className="form-group">
                <label>Overall Average</label>
                <input
                  type="number"
                  step="0.01"
                  value={editFormData.gpa}
                  onChange={(event) => setEditFormData({ ...editFormData, gpa: event.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Attendance (%)</label>
                <input
                  type="number"
                  value={editFormData.attendance}
                  onChange={(event) => setEditFormData({ ...editFormData, attendance: event.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Performance Status</label>
                <select
                  value={editFormData.performanceStatus}
                  onChange={(event) => setEditFormData({ ...editFormData, performanceStatus: event.target.value })}
                >
                  <option value="Excellent">Excellent</option>
                  <option value="On Track">On Track</option>
                  <option value="Needs Support">Needs Support</option>
                </select>
              </div>
              <div className="form-group">
                <label>Teacher Remarks</label>
                <textarea
                  value={editFormData.teacherRemarks}
                  onChange={(event) => setEditFormData({ ...editFormData, teacherRemarks: event.target.value })}
                  rows="3"
                  placeholder="Add a performance note or intervention recommendation."
                />
              </div>

              <div className="subject-editor">
                <div className="panel-header">
                  <h4>Subject Grades</h4>
                  <button type="button" className="secondary-btn" onClick={addSubjectRow}>Add Subject</button>
                </div>
                {editFormData.subjects.map((subject, index) => (
                  <div key={`${subject.id || "subject"}-${index}`} className="subject-grid">
                    <input
                      type="text"
                      value={subject.name}
                      placeholder="Subject name"
                      onChange={(event) => updateSubjectField(index, "name", event.target.value)}
                    />
                    <input
                      type="text"
                      value={subject.teacher}
                      placeholder="Teacher"
                      onChange={(event) => updateSubjectField(index, "teacher", event.target.value)}
                    />
                    <input
                      type="number"
                      value={subject.q1}
                      placeholder="Q1"
                      onChange={(event) => updateSubjectField(index, "q1", event.target.value)}
                    />
                    <input
                      type="number"
                      value={subject.q2}
                      placeholder="Q2"
                      onChange={(event) => updateSubjectField(index, "q2", event.target.value)}
                    />
                    <input
                      type="number"
                      value={subject.q3}
                      placeholder="Q3"
                      onChange={(event) => updateSubjectField(index, "q3", event.target.value)}
                    />
                    <input
                      type="number"
                      value={subject.q4}
                      placeholder="Q4"
                      onChange={(event) => updateSubjectField(index, "q4", event.target.value)}
                    />
                    {editFormData.subjects.length > 1 && (
                      <button type="button" className="text-btn" onClick={() => removeSubjectRow(index)}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="modal-actions">
                <button type="submit" className="primary-btn">
                  {savingStudentId === editingStudent.id ? "Saving..." : "Save Changes"}
                </button>
                <button type="button" className="secondary-btn" onClick={() => setEditingStudent(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherView;
