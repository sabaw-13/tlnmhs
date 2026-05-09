import React, { useEffect, useState } from "react";
import { formatShortDate } from "../utils/reporting";
import { useSchoolData } from "../context/SchoolDataContext";
import StudentRecordModal from "../components/StudentRecordModal";
import TeacherRecordModal from "../components/TeacherRecordModal";
import AccountPasswordModal from "../components/AccountPasswordModal";
import ConfirmDialog from "../components/ConfirmDialog";
import "./TeacherDashboard.css";

const GRADE_LEVEL_OPTIONS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const BULK_STUDENT_TEMPLATE_HEADERS = "first name,last name,grade level,student id number,section,email";

const normalizeCsvHeader = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "");

const CSV_HEADER_MAP = {
  firstname: "firstName",
  givenname: "firstName",
  lastname: "lastName",
  surname: "lastName",
  familyname: "lastName",
  gradelevel: "gradeLevel",
  grade: "gradeLevel",
  studentidnumber: "studentNumber",
  studentid: "studentNumber",
  idnumber: "studentNumber",
  studentnumber: "studentNumber",
  lrn: "studentNumber",
  section: "section",
  email: "email",
  emailaddress: "email"
};

const parseCsvRows = (text) => {
  const rows = [];
  let currentCell = "";
  let currentRow = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === "\"" && inQuotes && nextCharacter === "\"") {
      currentCell += "\"";
      index += 1;
    } else if (character === "\"") {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      currentRow.push(currentCell);
      if (currentRow.some((cell) => String(cell).trim())) rows.push(currentRow);
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += character;
    }
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => String(cell).trim())) rows.push(currentRow);

  return rows;
};

const parseStudentCsv = (text) => {
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    throw new Error("CSV must include a header row and at least one student row.");
  }

  const headers = rows[0].map((header) => CSV_HEADER_MAP[normalizeCsvHeader(header)] || "");
  const requiredFields = ["firstName", "lastName", "gradeLevel", "studentNumber"];
  const missingFields = requiredFields.filter((field) => !headers.includes(field));

  if (missingFields.length) {
    throw new Error("CSV must include first name, last name, grade level, and student ID number columns.");
  }

  return rows.slice(1)
    .map((row, rowIndex) => {
      const record = { rowNumber: rowIndex + 2 };

      headers.forEach((field, columnIndex) => {
        if (!field) return;
        record[field] = String(row[columnIndex] || "").trim();
      });

      return record;
    })
    .filter((record) => Object.entries(record).some(([key, value]) => key !== "rowNumber" && String(value).trim()));
};

const AdminView = ({ section = "overview" }) => {
  const {
    classReports,
    error,
    loading,
    parentAccountRequests,
    parentStudentAccessRequests,
    approveParentAccountRequest,
    rejectParentAccountRequest,
    approveParentStudentAccessRequest,
    rejectParentStudentAccessRequest,
    deleteStudentRecord,
    deleteTeacherRecord,
    deleteParentRecord,
    repositorySummary,
    resetUserPassword,
    importBulkStudents,
    saveClassRecord,
    saveStudentRecord,
    saveTeacherRecord,
    savingClass,
    savingStudentId,
    savingTeacherId,
    students,
    teacherUsers,
    users
  } = useSchoolData();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [managingStudent, setManagingStudent] = useState(null);
  const [managingTeacher, setManagingTeacher] = useState(null);
  const [resettingAccount, setResettingAccount] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(null);
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingParentRequestId, setSavingParentRequestId] = useState("");
  const [savingAccessRequestId, setSavingAccessRequestId] = useState("");
  const [showClassForm, setShowClassForm] = useState(false);
  const [editingClassId, setEditingClassId] = useState("");
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkImportResult, setBulkImportResult] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentGradeFilter, setStudentGradeFilter] = useState("");
  const [studentClassFilter, setStudentClassFilter] = useState("");
  const [classForm, setClassForm] = useState({
    section: "",
    gradeLevel: "",
    classCode: "",
    teacherId: ""
  });
  const [feedback, setFeedback] = useState(null);

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
  const parentUsers = users
    .filter((user) => user.role === "parent")
    .map((parent) => {
      const linkedStudentIds = new Set([
        parent.studentId,
        ...Object.keys(parent.studentIds || {}).filter((studentId) => parent.studentIds[studentId])
      ].filter(Boolean));
      const linkedStudentRecords = students.filter((student) => (
        linkedStudentIds.has(student.id) || student.parentId === parent.id
      ));
      const pendingRequests = parentStudentAccessRequests.filter((request) => (
        request.parentId === parent.id && request.status === "pending"
      ));

      return {
        ...parent,
        name: parent.displayName || parent.name || parent.email || "Parent",
        linkedStudentRecords,
        pendingRequests
      };
    });
  const unlinkedParents = users.filter((user) => (
    user.role === "parent"
    && !user.studentId
    && !(user.studentIds && Object.values(user.studentIds).some(Boolean))
  ));
  const classesWithoutTeacher = classReports.filter((classroom) => !classroom.teacherEmail && !classroom.teacherId && !classroom.teacherUid);
  const atRiskStudents = students.filter((student) => student.performanceStatus === "Needs Support");
  const pendingParentAccountRequests = parentAccountRequests.filter((request) => request.status === "pending");
  const pendingParentStudentAccessRequests = parentStudentAccessRequests.filter((request) => request.status === "pending");
  const selectedClass = classReports.find((classroom) => classroom.id === selectedClassId) || classReports[0] || null;
  const selectedClassTeacher = selectedClass?.teacherName || selectedClass?.adviserName || selectedClass?.teacherEmail || selectedClass?.adviserEmail || "Unassigned";
  const studentSearchTerm = studentSearch.trim().toLowerCase();
  const adminStudentRows = students.filter((student) => {
    const matchesSearch = !studentSearchTerm || [
      student.name,
      student.email,
      student.studentNumber,
      student.gradeLevel,
      student.className,
      student.teacherName
    ].some((value) => String(value || "").toLowerCase().includes(studentSearchTerm));
    const matchesGrade = !studentGradeFilter || student.gradeLevel === studentGradeFilter;
    const matchesClass = !studentClassFilter
      || (studentClassFilter === "__unassigned" ? !student.classId : student.classId === studentClassFilter);

    return matchesSearch && matchesGrade && matchesClass;
  });
  const availableAdviserOptions = teacherUsers.filter((teacher) => (
    !teacher.advisoryClassId
    || teacher.advisoryClassId === editingClassId
  ));

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

    try {
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
      setFeedback({
        type: "success",
        message: managingStudent?.id
          ? "Student record updated."
          : `Student added. The new account password is the ID number: ${formData.studentNumber}.`
      });
    } catch (saveError) {
      setFeedback({
        type: "error",
        message: saveError?.message || "Student details could not be saved."
      });
    }
  };

  const resetBulkImportState = () => {
    setBulkFileName("");
    setBulkRows([]);
    setBulkImportResult(null);
  };

  const handleBulkStudentFile = async (event) => {
    const file = event.target.files?.[0] || null;
    setBulkImportResult(null);

    if (!file) {
      resetBulkImportState();
      return;
    }

    try {
      const text = await file.text();
      const rows = parseStudentCsv(text);

      setBulkFileName(file.name);
      setBulkRows(rows);
    } catch (parseError) {
      setBulkFileName(file.name);
      setBulkRows([]);
      setBulkImportResult({
        imported: [],
        skipped: [],
        failed: [{
          rowNumber: "-",
          name: file.name,
          reason: parseError?.message || "CSV could not be read."
        }],
        warnings: []
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleBulkStudentImport = async (event) => {
    event.preventDefault();

    if (!bulkRows.length) {
      setBulkImportResult({
        imported: [],
        skipped: [],
        failed: [{
          rowNumber: "-",
          name: bulkFileName || "CSV",
          reason: "Upload a valid CSV before importing."
        }],
        warnings: []
      });
      return;
    }

    setBulkImporting(true);

    try {
      const result = await importBulkStudents({ rows: bulkRows });

      setBulkImportResult(result);
      const skippedCount = result.skipped?.length || 0;
      setFeedback({
        type: result.failed.length ? "error" : "success",
        message: `${result.imported.length} student${result.imported.length === 1 ? "" : "s"} imported. ${skippedCount} skipped. ${result.failed.length} failed.`
      });

      if (!result.failed.length) {
        setBulkRows([]);
        setBulkFileName("");
      }
    } catch (importError) {
      setBulkImportResult({
        imported: [],
        skipped: [],
        failed: [{
          rowNumber: "-",
          name: bulkFileName || "CSV",
          reason: importError?.message || "Students could not be imported."
        }],
        warnings: []
      });
    } finally {
      setBulkImporting(false);
    }
  };

  const handleSaveTeacher = async (formData) => {
    setSavingTeacher(true);

    try {
      await saveTeacherRecord({
        teacherId: managingTeacher?.id,
        payload: formData
      });

      setManagingTeacher(null);
      setFeedback({
        type: "success",
        message: managingTeacher?.id
          ? "Teacher profile updated."
          : "Teacher profile added and login account created."
      });
    } catch (saveError) {
      setFeedback({
        type: "error",
        message: saveError?.message || "Teacher details could not be saved."
      });
    } finally {
      setSavingTeacher(false);
    }
  };

  const handleSaveClass = async (event) => {
    event.preventDefault();

    try {
      const classId = await saveClassRecord({
        classId: editingClassId,
        payload: classForm
      });

      setSelectedClassId(classId);
      setClassForm({
        section: "",
        gradeLevel: "",
        classCode: "",
        teacherId: ""
      });
      setEditingClassId("");
      setShowClassForm(false);
      setFeedback({
        type: "success",
        message: editingClassId ? "Class updated." : "Class added."
      });
    } catch (saveError) {
      setFeedback({
        type: "error",
        message: saveError?.message || "Class could not be saved."
      });
    }
  };

  const openClassForm = (classroom = null) => {
    setEditingClassId(classroom?.id || "");
    setClassForm({
      section: classroom?.section || "",
      gradeLevel: classroom?.gradeLevel || "",
      classCode: classroom?.classCode || "",
      teacherId: classroom?.teacherId || classroom?.teacherUid || classroom?.adviserId || ""
    });
    setShowClassForm(true);
  };

  const handleResetPassword = async (password) => {
    if (!resettingAccount?.id) {
      throw new Error("No account was selected for password reset.");
    }

    setSavingPassword(true);

    try {
      await resetUserPassword({
        userId: resettingAccount.id,
        password
      });

      setResettingAccount(null);
      setFeedback({
        type: "success",
        message: `${resettingAccount.name}'s password has been updated.`
      });
    } catch (saveError) {
      setFeedback({
        type: "error",
        message: saveError?.message || "Password could not be updated."
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletingAccount?.id) {
      throw new Error("No account was selected for deletion.");
    }

    try {
      if (deletingAccount.role === "student") {
        await deleteStudentRecord(deletingAccount.id);
      } else if (deletingAccount.role === "teacher") {
        await deleteTeacherRecord(deletingAccount.id);
      } else if (deletingAccount.role === "parent") {
        await deleteParentRecord(deletingAccount.id);
      }

      setFeedback({
        type: "success",
        message: `${deletingAccount.name} has been deleted.`
      });
      setDeletingAccount(null);
    } catch (deleteError) {
      setFeedback({
        type: "error",
        message: deleteError?.message || "Account could not be deleted."
      });
    }
  };

  const handleParentAccountDecision = async (request, action) => {
    setSavingParentRequestId(request.id);

    try {
      if (action === "accept") {
        await approveParentAccountRequest(request.id);
      } else {
        await rejectParentAccountRequest(request.id);
      }

      setFeedback({
        type: "success",
        message: action === "accept"
          ? `${request.name || request.email}'s parent account was created.`
          : `${request.name || request.email}'s parent account request was declined.`
      });
    } catch (saveError) {
      setFeedback({
        type: "error",
        message: saveError?.message || "Parent account request could not be updated."
      });
    } finally {
      setSavingParentRequestId("");
    }
  };

  const handleStudentAccessDecision = async (request, action) => {
    setSavingAccessRequestId(request.id);

    try {
      if (action === "accept") {
        await approveParentStudentAccessRequest(request.id);
      } else {
        await rejectParentStudentAccessRequest(request.id);
      }

      setFeedback({
        type: "success",
        message: action === "accept"
          ? `${request.parentName || "Parent"} can now view ${request.studentName}.`
          : `${request.parentName || "Parent"}'s access request was declined.`
      });
    } catch (saveError) {
      setFeedback({
        type: "error",
        message: saveError?.message || "Parent access request could not be updated."
      });
    } finally {
      setSavingAccessRequestId("");
    }
  };

  return (
    <div className="admin-view">
      {feedback && (
        <div className={feedback.type === "error" ? "error-banner" : "success-banner"}>
          {feedback.message}
        </div>
      )}

      {(section === "dashboard" || section === "overview") && (
        <div className="admin-dashboard-hero panel">
          <div>
            <span className="meta-badge">Dashboard</span>
            <h3>School Operations</h3>
            <p className="muted-text">
              Monitor enrollment, advisory assignments, parent access, and academic records from one control center.
            </p>
          </div>
          <div className="dashboard-signal-grid">
            <div>
              <span>Pending Requests</span>
              <strong>{pendingParentAccountRequests.length + pendingParentStudentAccessRequests.length}</strong>
            </div>
            <div>
              <span>Unassigned Students</span>
              <strong>{orphanStudents.length}</strong>
            </div>
            <div>
              <span>Classes Needing Adviser</span>
              <strong>{classesWithoutTeacher.length}</strong>
            </div>
          </div>
        </div>
      )}

      {(section === "dashboard" || section === "overview") && (
        <div className="stats-grid">
          <div className="stat-card"><h4>Total Teachers</h4><p>{repositorySummary.teachers}</p></div>
          <div className="stat-card"><h4>Total Students</h4><p>{repositorySummary.students}</p></div>
          <div className="stat-card"><h4>Total Parents</h4><p>{repositorySummary.parents}</p></div>
          <div className="stat-card"><h4>Total Classes</h4><p>{repositorySummary.classes}</p></div>
        </div>
      )}

      {(section === "dashboard" || section === "overview") && (
        <div className="insight-grid">
          <div className="panel">
            <h3>Academic Snapshot</h3>
            <div className="report-strip">
              <div>
                <span>Students with Class</span>
                <strong>{repositorySummary.studentsWithClasses}/{repositorySummary.students}</strong>
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

      {section === "requests" && (
        <div className="insight-grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Parent Account Requests</h3>
              <span className="meta-badge">{pendingParentAccountRequests.length} pending</span>
            </div>
            {pendingParentAccountRequests.length ? (
              <ul className="stack-list">
                {pendingParentAccountRequests.map((request) => (
                  <li key={request.id} className="list-row">
                    <div>
                      <strong>{request.name || "Parent"}</strong>
                      <p>{request.email || "No email provided"}</p>
                    </div>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="primary-btn"
                        disabled={savingParentRequestId === request.id}
                        onClick={() => handleParentAccountDecision(request, "accept")}
                      >
                        {savingParentRequestId === request.id ? "Saving..." : "Accept"}
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={savingParentRequestId === request.id}
                        onClick={() => handleParentAccountDecision(request, "reject")}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">No parent accounts are waiting for approval.</p>
            )}
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Student Access Requests</h3>
              <span className="meta-badge">{pendingParentStudentAccessRequests.length} pending</span>
            </div>
            {pendingParentStudentAccessRequests.length ? (
              <ul className="stack-list">
                {pendingParentStudentAccessRequests.map((request) => (
                  <li key={request.id} className="list-row">
                    <div>
                      <strong>{request.parentName || "Parent"}</strong>
                      <p>{request.studentName || "Student"} {request.studentNumber ? `(${request.studentNumber})` : ""}</p>
                    </div>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="primary-btn"
                        disabled={savingAccessRequestId === request.id}
                        onClick={() => handleStudentAccessDecision(request, "accept")}
                      >
                        {savingAccessRequestId === request.id ? "Saving..." : "Accept"}
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={savingAccessRequestId === request.id}
                        onClick={() => handleStudentAccessDecision(request, "reject")}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">No student access requests are waiting for approval.</p>
            )}
          </div>
        </div>
      )}

      {section === "students" && (
        <>
          <div className="toolbar">
            <div>
              <h3>Student Manager</h3>
            </div>
            <div className="toolbar-actions">
              <button type="button" className="primary-btn" onClick={() => setManagingStudent({})}>
                Add Student
              </button>
              <button type="button" className="secondary-btn" onClick={() => {
                resetBulkImportState();
                setShowBulkImport(true);
              }}>
                Import CSV
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
            <div className="panel-header">
              <h3>Student Records</h3>
              <span className="meta-badge">{adminStudentRows.length} shown</span>
            </div>
            <div className="table-filter-bar">
              <label className="selector-field">
                <span>Search</span>
                <input
                  type="search"
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="Name, ID, email, class"
                />
              </label>
              <label className="selector-field">
                <span>Grade</span>
                <select value={studentGradeFilter} onChange={(event) => setStudentGradeFilter(event.target.value)}>
                  <option value="">All Grades</option>
                  {GRADE_LEVEL_OPTIONS.map((gradeLevel) => (
                    <option key={gradeLevel} value={gradeLevel}>{gradeLevel}</option>
                  ))}
                </select>
              </label>
              <label className="selector-field">
                <span>Class</span>
                <select value={studentClassFilter} onChange={(event) => {
                  setStudentClassFilter(event.target.value);
                  if (event.target.value && event.target.value !== "__unassigned") setSelectedClassId(event.target.value);
                }}>
                  <option value="">All Classes</option>
                  <option value="__unassigned">No Class / Unassigned</option>
                  {classReports.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name || `${classroom.gradeLevel || "Grade"} - ${classroom.section || classroom.id}`}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setStudentSearch("");
                  setStudentGradeFilter("");
                  setStudentClassFilter("");
                }}
              >
                Clear
              </button>
            </div>
            <table className="data-table student-records-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Grade</th>
                  <th>Class</th>
                  <th>ID Number</th>
                  <th>Average</th>
                  <th>Attendance</th>
                  <th>Teacher</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {adminStudentRows.map((student) => (
                  <tr key={student.id}>
                    <td data-label="Student" className="student-name-cell">
                      <strong>{student.name}</strong>
                      <span>{student.email || "No email"}</span>
                    </td>
                    <td data-label="Grade">
                      <span className="record-badge">{student.gradeLevel || "N/A"}</span>
                    </td>
                    <td data-label="Class">
                      <span className={`record-badge ${student.classId ? "" : "muted"}`}>
                        {student.className || "Unassigned"}
                      </span>
                    </td>
                    <td data-label="ID Number">{student.studentNumber || "N/A"}</td>
                    <td data-label="Average">{student.gpa ?? "N/A"}</td>
                    <td data-label="Attendance">{student.attendanceLabel}</td>
                    <td data-label="Teacher">{student.teacherName}</td>
                    <td data-label="Action">
                      <div className="table-actions">
                        <button className="secondary-btn" type="button" onClick={() => setManagingStudent(student)}>
                          Edit
                        </button>
                        <button
                          className="primary-btn"
                          type="button"
                          onClick={() => setResettingAccount({
                            id: student.id,
                            name: student.name,
                            role: "student",
                            defaultPassword: student.studentNumber || ""
                          })}
                        >
                          Reset Password
                        </button>
                        <button
                          className="secondary-btn"
                          type="button"
                          disabled={savingStudentId === student.id}
                          onClick={() => setDeletingAccount({
                            id: student.id,
                            name: student.name,
                            role: "student"
                          })}
                        >
                          {savingStudentId === student.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {adminStudentRows.length === 0 && (
                  <tr>
                    <td colSpan="8">No students match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </>
      )}

      {section === "classes" && (
        <>
          <div className="toolbar">
            <div>
              <h3>Class Manager</h3>
              <p className="muted-text">Create sections, assign advisers, and manage class codes.</p>
            </div>
            <div className="toolbar-actions">
              <button type="button" className="primary-btn" onClick={() => openClassForm()}>
                Add Class
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>Classes</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Grade</th>
                  <th>Section</th>
                  <th>Code</th>
                  <th>Adviser</th>
                  <th>Students</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {classReports.map((classroom) => (
                  <tr key={classroom.id}>
                    <td data-label="Class">{classroom.name || classroom.section || classroom.id}</td>
                    <td data-label="Grade">{classroom.gradeLevel || "N/A"}</td>
                    <td data-label="Section">{classroom.section || "N/A"}</td>
                    <td data-label="Code">{classroom.classCode || "N/A"}</td>
                    <td data-label="Adviser">{classroom.teacherName || classroom.adviserName || "Unassigned"}</td>
                    <td data-label="Students">{classroom.students.length}</td>
                    <td data-label="Action">
                      <button className="secondary-btn" type="button" onClick={() => openClassForm(classroom)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {classReports.length === 0 && (
                  <tr>
                    <td colSpan="7">No classes available yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {section === "teachers" && (
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
                <th>Advisory</th>
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
                  <td data-label="Advisory">{teacher.advisoryClassName || "No Advisory"}</td>
                  <td data-label="Classes">{teacher.classCount}</td>
                  <td data-label="Action">
                    <div className="table-actions">
                      <button className="secondary-btn" type="button" onClick={() => setManagingTeacher(teacher)}>
                        Edit
                      </button>
                      <button
                        className="primary-btn"
                        type="button"
                        onClick={() => setResettingAccount({
                          id: teacher.id,
                          name: teacher.name,
                          role: "teacher",
                          defaultPassword: ""
                        })}
                      >
                        Reset Password
                      </button>
                      <button
                        className="secondary-btn"
                        type="button"
                        disabled={savingTeacherId === teacher.id}
                        onClick={() => setDeletingAccount({
                          id: teacher.id,
                          name: teacher.name,
                          role: "teacher"
                        })}
                      >
                        {savingTeacherId === teacher.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {teacherUsers.length === 0 && (
                <tr>
                  <td colSpan="6">No teacher profiles available yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {section === "parents" && (
        <div className="panel">
          <div className="panel-header">
            <h3>Parent Manager</h3>
            <span className="meta-badge">{parentUsers.length} accounts</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Parent</th>
                <th>Email</th>
                <th>Linked Students</th>
                <th>Pending Requests</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {parentUsers.map((parent) => (
                <tr key={parent.id}>
                  <td data-label="Parent">{parent.name}</td>
                  <td data-label="Email">{parent.email || "N/A"}</td>
                  <td data-label="Linked Students">
                    {parent.linkedStudentRecords.length
                      ? parent.linkedStudentRecords.map((student) => student.name).join(", ")
                      : "No linked students"}
                  </td>
                  <td data-label="Pending Requests">{parent.pendingRequests.length}</td>
                  <td data-label="Action">
                    <div className="table-actions">
                      <button
                        className="primary-btn"
                        type="button"
                        onClick={() => setResettingAccount({
                          id: parent.id,
                          name: parent.name,
                          role: "parent",
                          defaultPassword: ""
                        })}
                      >
                        Reset Password
                      </button>
                      <button
                        className="secondary-btn"
                        type="button"
                        onClick={() => setDeletingAccount({
                          id: parent.id,
                          name: parent.name,
                          role: "parent"
                        })}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {parentUsers.length === 0 && (
                <tr>
                  <td colSpan="5">No parent accounts available yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

      {showBulkImport && (
        <div className="modal-overlay">
          <div className="modal-content bulk-import-modal">
            <div className="panel-header">
              <h3>Import Students CSV</h3>
              <span className="meta-badge">Bulk Add</span>
            </div>
            <form onSubmit={handleBulkStudentImport}>
              <div className="form-group">
                <label>CSV File</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleBulkStudentFile}
                />
              </div>

              <div className="form-group">
                <label>Columns</label>
                <input type="text" value={BULK_STUDENT_TEMPLATE_HEADERS} readOnly />
              </div>

              {bulkFileName && (
                <div className="success-banner compact">
                  {bulkRows.length ? `${bulkFileName}: ${bulkRows.length} row${bulkRows.length === 1 ? "" : "s"} ready.` : `${bulkFileName}: no rows ready.`}
                </div>
              )}

              {bulkRows.length > 0 && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Student</th>
                      <th>Grade</th>
                      <th>Section</th>
                      <th>ID Number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.slice(0, 5).map((row) => (
                      <tr key={row.rowNumber}>
                        <td data-label="Row">{row.rowNumber}</td>
                        <td data-label="Student">{row.firstName} {row.lastName}</td>
                        <td data-label="Grade">{row.gradeLevel}</td>
                        <td data-label="Section">{row.section || "None"}</td>
                        <td data-label="ID Number">{row.studentNumber}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {bulkImportResult && (
                <div className="bulk-import-result">
                  {bulkImportResult.imported.length > 0 && (
                    <div className="success-banner compact">
                      Imported {bulkImportResult.imported.length} student{bulkImportResult.imported.length === 1 ? "" : "s"}.
                    </div>
                  )}
                  {(bulkImportResult.skipped?.length || 0) > 0 && (
                    <div className="success-banner compact">
                      Skipped {bulkImportResult.skipped.length} existing student{bulkImportResult.skipped.length === 1 ? "" : "s"} by student ID.
                    </div>
                  )}
                  {bulkImportResult.warnings.map((warning) => (
                    <div key={warning} className="success-banner compact">
                      {warning}
                    </div>
                  ))}
                  {bulkImportResult.failed.length > 0 && (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Student</th>
                          <th>Issue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkImportResult.failed.map((failure) => (
                          <tr key={`${failure.rowNumber}-${failure.name}-${failure.reason}`}>
                            <td data-label="Row">{failure.rowNumber}</td>
                            <td data-label="Student">{failure.name}</td>
                            <td data-label="Issue">{failure.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              <div className="modal-actions bulk-import-actions">
                <button type="submit" className="primary-btn" disabled={!bulkRows.length || bulkImporting}>
                  {bulkImporting ? "Importing..." : "Import Students"}
                </button>
                <button type="button" className="secondary-btn" onClick={() => {
                  setShowBulkImport(false);
                  resetBulkImportState();
                }}>
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showClassForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="panel-header">
              <h3>{editingClassId ? "Edit Class" : "Add Class"}</h3>
            </div>
            <form onSubmit={handleSaveClass}>
              <div className="modal-form-grid">
                <div className="form-group">
                  <label>Section</label>
                  <input
                    type="text"
                    value={classForm.section}
                    onChange={(event) => setClassForm({ ...classForm, section: event.target.value })}
                    placeholder="Example: Mahogany"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Grade Level</label>
                  <select
                    value={classForm.gradeLevel}
                    onChange={(event) => setClassForm({ ...classForm, gradeLevel: event.target.value })}
                    required
                  >
                    <option value="">Select grade</option>
                    {GRADE_LEVEL_OPTIONS.map((gradeLevel) => (
                      <option key={gradeLevel} value={gradeLevel}>
                        {gradeLevel}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Class Code</label>
                  <input
                    type="text"
                    value={classForm.classCode}
                    onChange={(event) => setClassForm({ ...classForm, classCode: event.target.value.toUpperCase() })}
                    placeholder="Auto-generated if blank"
                  />
                </div>
                <div className="form-group">
                  <label>Adviser</label>
                  <select
                    value={classForm.teacherId}
                    onChange={(event) => setClassForm({ ...classForm, teacherId: event.target.value })}
                    required
                  >
                    <option value="">Select adviser</option>
                    {availableAdviserOptions.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button type="submit" className="primary-btn" disabled={savingClass}>
                  {savingClass ? "Saving..." : editingClassId ? "Save Class" : "Add Class"}
                </button>
                <button type="button" className="secondary-btn" onClick={() => {
                  setShowClassForm(false);
                  setEditingClassId("");
                }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
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
          defaultGradeLevel={selectedClass?.gradeLevel || ""}
          showClassSelector
          showGradeLevelSelector
          allowTeacherSelection
          accountFieldsOnly={!managingStudent.id}
          saving={Boolean(savingStudentId)}
          submitLabel={managingStudent.id ? "Save Changes" : "Add Student"}
          onClose={() => setManagingStudent(null)}
          onSubmit={handleSaveStudent}
        />
      )}

      {managingTeacher && (
        <TeacherRecordModal
          teacher={managingTeacher.id ? managingTeacher : null}
          classOptions={classReports.filter((classroom) => {
            const assignedTeacherId = classroom.teacherId || classroom.teacherUid || classroom.adviserId || "";
            return !assignedTeacherId || assignedTeacherId === managingTeacher?.id;
          })}
          saving={savingTeacher || Boolean(savingTeacherId)}
          onClose={() => setManagingTeacher(null)}
          onSubmit={handleSaveTeacher}
        />
      )}

      {resettingAccount && (
        <AccountPasswordModal
          accountLabel={resettingAccount.role}
          defaultPassword={resettingAccount.defaultPassword}
          description={resettingAccount.role === "student"
            ? "Student accounts can be reset back to the current ID number or changed to another password."
            : `Set a new password for this ${resettingAccount.role} account.`}
          saving={savingPassword}
          title={`Reset Password: ${resettingAccount.name}`}
          onClose={() => setResettingAccount(null)}
          onSubmit={handleResetPassword}
        />
      )}

      {deletingAccount && (
        <ConfirmDialog
          tone="danger"
          title={`Delete ${deletingAccount.name}?`}
          message={deletingAccount.role === "student"
            ? "This will delete the student account, student record, class roster link, and pending parent access requests."
            : deletingAccount.role === "teacher"
            ? "This will delete the teacher account and remove advisory assignment from any class."
            : "This will delete the parent account and remove links to student records and pending access requests."}
          confirmLabel={`Delete ${deletingAccount.role.charAt(0).toUpperCase() + deletingAccount.role.slice(1)}`}
          cancelLabel="Cancel"
          busy={deletingAccount.role === "student"
            ? savingStudentId === deletingAccount.id
            : deletingAccount.role === "teacher"
            ? savingTeacherId === deletingAccount.id
            : false}
          onConfirm={handleDeleteAccount}
          onCancel={() => setDeletingAccount(null)}
        />
      )}
    </div>
  );
};

export default AdminView;
