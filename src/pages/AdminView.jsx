import React from "react";
import { useSchoolData } from "../context/SchoolDataContext";
import "./TeacherDashboard.css";

const AdminView = ({ section = "overview" }) => {
  const {
    classReports,
    error,
    loading,
    repositorySummary,
    students,
    users
  } = useSchoolData();

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

  return (
    <div className="admin-view">
      <div className="stats-grid">
        <div className="stat-card"><h4>Total Teachers</h4><p>{repositorySummary.teachers}</p></div>
        <div className="stat-card"><h4>Total Students</h4><p>{repositorySummary.students}</p></div>
        <div className="stat-card"><h4>Total Parents</h4><p>{repositorySummary.parents}</p></div>
        <div className="stat-card"><h4>System Health</h4><p>{repositorySummary.health}</p></div>
      </div>

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
          <div className="insight-grid">
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

            <div className="panel">
              <h3>Repository Actions</h3>
              <div className="class-cards compact">
                <div className="class-item-card">
                  <h4>User Profiles</h4>
                  <p>Maintain role-based access and verify that every teacher, student, and parent account is assigned correctly.</p>
                </div>
                <div className="class-item-card">
                  <h4>Class Rosters</h4>
                  <p>Ensure every class has linked learners and a teacher owner to keep reports consistent.</p>
                </div>
                <div className="class-item-card">
                  <h4>Data Reviews</h4>
                  <p>Audit gaps in grades, attendance, and profile linkage before reporting cycles.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3>Class Repository</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Teacher</th>
                  <th>Students</th>
                  <th>Completion</th>
                  <th>Average GPA</th>
                </tr>
              </thead>
              <tbody>
                {classReports.map((classroom) => (
                  <tr key={classroom.id}>
                    <td>{classroom.name || classroom.section || classroom.id}</td>
                    <td>{classroom.teacherEmail || classroom.adviserEmail || "Unassigned"}</td>
                    <td>{classroom.students.length}</td>
                    <td>{classroom.completionRate}%</td>
                    <td>{classroom.averageGpa ?? "N/A"}</td>
                  </tr>
                ))}
                {classReports.length === 0 && (
                  <tr>
                    <td colSpan="5">No classes found in the repository.</td>
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
                    <td>{classroom.name || classroom.section || classroom.id}</td>
                    <td>{classroom.students.length}</td>
                    <td>{classroom.averageGpa ?? "N/A"}</td>
                    <td>{classroom.averageAttendance ? `${classroom.averageAttendance}%` : "N/A"}</td>
                    <td>{classroom.atRiskCount}</td>
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
                    <td>{student.name}</td>
                    <td>{student.className}</td>
                    <td>{student.gpa ?? "N/A"}</td>
                    <td>{student.attendanceLabel}</td>
                    <td>{student.alerts.join(" ")}</td>
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
    </div>
  );
};

export default AdminView;
