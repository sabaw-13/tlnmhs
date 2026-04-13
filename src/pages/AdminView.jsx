import React, { useEffect, useState } from "react";
import { formatShortDate } from "../utils/reporting";
import { useSchoolData } from "../context/SchoolDataContext";
import StudentRecordModal from "../components/StudentRecordModal";
import TeacherRecordModal from "../components/TeacherRecordModal";
import "./TeacherDashboard.css";

const AdminView = ({ section = "overview" }) => {
  const {
    classReports,
    error,
    loading,
    repositorySummary,
    saveStudentRecord,
    saveTeacherRecord,
    savingStudentId,
    students,
    teacherUsers,
    users
  } = useSchoolData();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [managingStudent, setManagingStudent] = useState(null);
  const [managingTeacher, setManagingTeacher] = useState(null);
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (!classReports.length) {
      setSelectedClassId("");
      return;
    }

    const hasSelectedClass = classReports.some((classroom) => classroom.id === selectedClassId);
    if (!selectedClassId || !hasSelectedClass) {
      setSelectedClassId(classReports[0].id);
    }
  }, [classReports, selectedClassId]);

  if (loading) return <div className="loading-container">Loading system stats...</div>;
  if (error) return <div className="error-container">{error}</div>;

  const recentUpdates = [...students]
    .filter((student) => student.updatedAt || student.recentActivity.length)
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
    .slice(0, 6);
  const orphanStudents = students.filter((student) => !student.classId);
  const unlinkedParents = users.filter((user) => user.role === "parent" && !user.studentId);
  const classesWithoutTeacher = classReports.filter((classroom) => !classroom.teacherEmail && !classroom.teacherId && !classroom.teacherUid);
  const atRiskStudents = students.filter((student) => student.performanceStatus === "Needs Support");
  const selectedClass = classReports.find((classroom) => classroom.id === selectedClassId) || classReports[0] || null;
  const selectedClassTeacher = selectedClass?.teacherName || selectedClass?.adviserName || selectedClass?.teacherEmail || selectedClass?.adviserEmail || "Unassigned";

  const handleSaveStudent = async (formData) => {
    const now = new Date().toISOString();
    const classId = formData.classId || selectedClass?.id || "";
    const activityEntry = {
      date: formatShortDate(now),
      activity: managingStudent?.id ? "Admin Update" : "Student Added",
      result: formData.gpa !== "" || formData.attendance !== ""
        ? `GPA ${formData.gpa || "N/A"} | Attendance ${formData.attendance || "N/A"}%`
        : "Student repository record updated",
      remarks: formData.teacherRemarks || formData.performanceStatus
    };

    await saveStudentRecord({
      studentId: managingStudent?.id,
      payload: {
        ...formData,
        classId,
        activities: managingStudent?.id
          ? [activityEntry, ...(Array.isArray(managingStudent?.raw?.activities)
            ? managingStudent.raw.activities
            : Object.values(managingStudent?.raw?.activities || {}))].slice(0, 6)
          : [activityEntry]
      }
    });

    setManagingStudent(null);
    setSaveMessage(managingStudent?.id ? "Student record updated." : "Student added to the selected class.");
  };

  const handleSaveTeacher = async (formData) => {
    setSavingTeacher(true);

    try {
      await saveTeacherRecord({
        teacherId: managingTeacher?.id,
        payload: formData
      });

      setManagingTeacher(null);
      setSaveMessage(managingTeacher?.id ? "Teacher profile updated." : "Teacher profile added.");
    } finally {
      setSavingTeacher(false);
    }
  };

  return (
    <div className="admin-view">
      {saveMessage && <div className="success-banner">{saveMessage}</div>}

      {section === "overview" && (
        <div className="stats-grid">
          <div className="stat-card"><h4>Total Teachers</h4><p>{repositorySummary.teachers}</p></div>
          <div className="stat-card"><h4>Total Students</h4><p>{repositorySummary.students}</p></div>
          <div className="stat-card"><h4>Total Parents</h4><p>{repositorySummary.parents}</p></div>
          <div className="stat-card"><h4>System Health</h4><p>{repositorySummary.health}</p></div>
        </div>
      )}

      {section === "overview" && (
        <div className="insight-grid">
          <div className="panel">
            <h3>Centralized Repository Health</h3>
            <div className="report-strip">
              <div>
                <span>Classes</span>
                <strong>{repositorySummary.classes}</strong>
              </div>
              <div>
                <span>Live Reports</span>
                <strong>{repositorySummary.liveReports}</strong>
              </div>
              <div>
                <span>At Risk</span>
                <strong>{repositorySummary.atRiskStudents}</strong>
              </div>
            </div>
            <p className="mt-4">
              Average GPA is <strong>{repositorySummary.averageGpa ?? "N/A"}</strong> and average attendance is{" "}
              <strong>{repositorySummary.averageAttendance ? `${repositorySummary.averageAttendance}%` : "N/A"}</strong>.
            </p>
          </div>

          <div className="panel">
            <h3>Recent Repository Activity</h3>
            {recentUpdates.length ? (
              <ul className="stack-list">
                {recentUpdates.map((student) => (
                  <li key={student.id} className="list-row">
                    <div>
                      <strong>{student.name}</strong>
                      <p>{student.recentActivity[0]?.result || "Student record updated."}</p>
                    </div>
                    <span>{student.updatedLabel}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">No repository updates captured yet.</p>
            )}
          </div>
        </div>
      )}

      {section === "repository" && (
        <>
          <div className="toolbar">
            <div>
              <h3>Roster Manager</h3>
            </div>
            <div className="toolbar-actions">
              <label className="selector-field">
                <span>Class</span>
                <select value={selectedClass?.id || ""} onChange={(event) => setSelectedClassId(event.target.value)}>
                  {classReports.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name || classroom.section || classroom.id}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="primary-btn" onClick={() => setManagingStudent({})}>
                Add Student
              </button>
            </div>
          </div>

          <div className="insight-grid">
            <div className="panel">
              <div className="panel-header">
                <h3>{selectedClass?.name || selectedClass?.section || "Selected Class"}</h3>
                <span className="meta-badge">{selectedClassTeacher}</span>
              </div>
              <div className="report-strip">
                <div>
                  <span>Students</span>
                  <strong>{selectedClass?.students.length ?? 0}</strong>
                </div>
                <div>
                  <span>Completion</span>
                  <strong>{selectedClass?.completionRate ?? 0}%</strong>
                </div>
                <div>
                  <span>Average GPA</span>
                  <strong>{selectedClass?.averageGpa ?? "N/A"}</strong>
                </div>
              </div>
            </div>

            <div className="panel">
              <h3>Data Integrity Checks</h3>
              <ul className="stack-list">
                <li className="list-row"><strong>Students with class assignment</strong><span>{repositorySummary.studentsWithClasses}/{repositorySummary.students}</span></li>
                <li className="list-row"><strong>Parents linked to a student</strong><span>{repositorySummary.studentsWithParents}</span></li>
                <li className="list-row"><strong>Orphan student records</strong><span>{orphanStudents.length}</span></li>
                <li className="list-row"><strong>Unlinked parent accounts</strong><span>{unlinkedParents.length}</span></li>
                <li className="list-row"><strong>Classes without teacher assignment</strong><span>{classesWithoutTeacher.length}</span></li>
              </ul>
            </div>
          </div>

          <div className="panel">
            <h3>Selected Class Roster</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Email</th>
                  <th>Average</th>
                  <th>Attendance</th>
                  <th>Teacher</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(selectedClass?.students || []).map((student) => (
                  <tr key={student.id}>
                    <td data-label="Student">{student.name}</td>
                    <td data-label="Email">{student.email || "N/A"}</td>
                    <td data-label="Average">{student.gpa ?? "N/A"}</td>
                    <td data-label="Attendance">{student.attendanceLabel}</td>
                    <td data-label="Teacher">{student.teacherName}</td>
                    <td data-label="Action">
                      <button className="secondary-btn" type="button" onClick={() => setManagingStudent(student)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {(selectedClass?.students || []).length === 0 && (
                  <tr>
                    <td colSpan="6">No students assigned to this class.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Teacher Manager</h3>
              <button type="button" className="primary-btn" onClick={() => setManagingTeacher({})}>
                Add Teacher
              </button>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Email</th>
                  <th>Subjects</th>
                  <th>Classes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {teacherUsers.map((teacher) => (
                  <tr key={teacher.id}>
                    <td data-label="Teacher">{teacher.name}</td>
                    <td data-label="Email">{teacher.email || "N/A"}</td>
                    <td data-label="Subjects">{teacher.subjects.length ? teacher.subjects.join(", ") : "None"}</td>
                    <td data-label="Classes">{teacher.classCount}</td>
                    <td data-label="Action">
                      <button className="secondary-btn" type="button" onClick={() => setManagingTeacher(teacher)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {teacherUsers.length === 0 && (
                  <tr>
                    <td colSpan="5">No teacher profiles available yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {section === "reports" && (
        <>
          <div className="panel">
            <h3>School-wide Performance Report</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Students</th>
                  <th>Average GPA</th>
                  <th>Attendance</th>
                  <th>Needs Support</th>
                </tr>
              </thead>
              <tbody>
                {classReports.map((classroom) => (
                  <tr key={classroom.id}>
                    <td data-label="Class">{classroom.name || classroom.section || classroom.id}</td>
                    <td data-label="Students">{classroom.students.length}</td>
                    <td data-label="Average GPA">{classroom.averageGpa ?? "N/A"}</td>
                    <td data-label="Attendance">{classroom.averageAttendance ? `${classroom.averageAttendance}%` : "N/A"}</td>
                    <td data-label="Needs Support">{classroom.atRiskCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h3>Students Requiring Intervention</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Average</th>
                  <th>Attendance</th>
                  <th>Alerts</th>
                </tr>
              </thead>
              <tbody>
                {atRiskStudents.map((student) => (
                  <tr key={student.id}>
                    <td data-label="Student">{student.name}</td>
                    <td data-label="Class">{student.className}</td>
                    <td data-label="Average">{student.gpa ?? "N/A"}</td>
                    <td data-label="Attendance">{student.attendanceLabel}</td>
                    <td data-label="Alerts">{student.alerts.join(" ")}</td>
                  </tr>
                ))}
                {atRiskStudents.length === 0 && (
                  <tr>
                    <td colSpan="5">No at-risk students identified from the current repository data.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {managingStudent && (
        <StudentRecordModal
          title={managingStudent.id ? `Edit Student: ${managingStudent.name}` : "Add Student"}
          student={managingStudent.id ? managingStudent : null}
          classOptions={classReports}
          teacherOptions={teacherUsers}
          defaultClassId={selectedClass?.id || ""}
          defaultTeacherId={selectedClass?.teacherId || selectedClass?.teacherUid || ""}
          defaultTeacherName={selectedClassTeacher}
          showClassSelector
          allowTeacherSelection
          saving={Boolean(savingStudentId)}
          submitLabel={managingStudent.id ? "Save Changes" : "Add Student"}
          onClose={() => setManagingStudent(null)}
          onSubmit={handleSaveStudent}
        />
      )}

      {managingTeacher && (
        <TeacherRecordModal
          teacher={managingTeacher.id ? managingTeacher : null}
          saving={savingTeacher}
          onClose={() => setManagingTeacher(null)}
          onSubmit={handleSaveTeacher}
        />
      )}
    </div>
  );
};

export default AdminView;
