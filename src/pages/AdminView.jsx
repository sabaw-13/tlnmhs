import React, { useEffect, useState } from "react";
import { Inbox, PencilLine, Plus, Power } from "lucide-react";
import { formatPersonName, formatShortDate } from "../utils/reporting";
import { useSchoolData } from "../context/SchoolDataContext";
import StudentRecordModal from "../components/StudentRecordModal";
import TeacherRecordModal from "../components/TeacherRecordModal";
import AccountPasswordModal from "../components/AccountPasswordModal";
import ConfirmDialog from "../components/ConfirmDialog";
import "./TeacherDashboard.css";

const BULK_STUDENT_TEMPLATE_HEADERS = "last name,first name,middle initial,grade level,student id number,section,email";
const noopHeaderActions = () => {};
const ADMIN_DASHBOARD_COLORS = [
  "#2563eb",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f97316"
];
const CALENDAR_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const getSectionOnlyLabel = (value) => {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) return "";

  const parts = trimmedValue.split(" - ").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || trimmedValue;
};
const getGradeLevelRank = (gradeLevel, gradeLevelOptions = []) => {
  const index = gradeLevelOptions.indexOf(gradeLevel);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

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
  middleinitial: "middleInitial",
  middle: "middleInitial",
  middlename: "middleInitial",
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

const getBulkStudentDisplayName = (row) => formatPersonName({
  firstName: row.firstName,
  lastName: row.lastName,
  middleInitial: row.middleInitial,
  fallback: "Unnamed student"
});

const AdminView = ({ section = "overview", setHeaderActions = noopHeaderActions }) => {
  const {
    classReports,
    gradeLevels,
    gradeLevelRecords,
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
    saveGradeLevelRecord,
    deactivateGradeLevelRecord,
    saveClassRecord,
    saveStudentRecord,
    saveTeacherRecord,
    savingClass,
    savingGradeLevelName,
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
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingParentRequestId, setSavingParentRequestId] = useState("");
  const [savingAccessRequestId, setSavingAccessRequestId] = useState("");
  const [showClassForm, setShowClassForm] = useState(false);
  const [showGradeLevelForm, setShowGradeLevelForm] = useState(false);
  const [editingClassId, setEditingClassId] = useState("");
  const [gradeLevelFormName, setGradeLevelFormName] = useState("");
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
  const [showRequestsModal, setShowRequestsModal] = useState(false);
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

  useEffect(() => {
    if (!feedback) return undefined;

    const timeoutId = window.setTimeout(() => {
      setFeedback(null);
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  const resetBulkImportState = () => {
    setBulkFileName("");
    setBulkRows([]);
    setBulkImportResult(null);
  };

  const openClassForm = (classroom = null, gradeLevel = "") => {
    setEditingClassId(classroom?.id || "");
    setClassForm({
      section: classroom?.section || "",
      gradeLevel: classroom?.gradeLevel || gradeLevel,
      classCode: classroom?.classCode || "",
      teacherId: classroom?.teacherId || classroom?.teacherUid || classroom?.adviserId || ""
    });
    setShowClassForm(true);
  };

  const closeGradeLevelForm = () => {
    setShowGradeLevelForm(false);
    setGradeLevelFormName("");
  };

  const handleSaveGradeLevel = async (event) => {
    event.preventDefault();

    try {
      await saveGradeLevelRecord({ name: gradeLevelFormName });
      setFeedback({
        type: "success",
        message: `${gradeLevelFormName.trim() || "Grade level"} is now available.`
      });
      closeGradeLevelForm();
    } catch (saveError) {
      setFeedback({
        type: "error",
        message: saveError?.message || "Grade level could not be saved."
      });
    }
  };

  const handleDeactivateGradeLevel = async (gradeLevelName) => {
    try {
      await deactivateGradeLevelRecord(gradeLevelName);
      setFeedback({
        type: "success",
        message: `${gradeLevelName} has been deactivated.`
      });
    } catch (saveError) {
      setFeedback({
        type: "error",
        message: saveError?.message || "Grade level could not be updated."
      });
    }
  };

  const pendingParentAccountRequests = parentAccountRequests.filter((request) => request.status === "pending");
  const pendingParentStudentAccessRequests = parentStudentAccessRequests.filter((request) => request.status === "pending");
  const pendingRequests = [
    ...pendingParentAccountRequests.map((request) => ({
      ...request,
      requestType: "parent-account",
      requestLabel: "Parent Account",
      requestedAtValue: request.requestedAt || request.createdAt || ""
    })),
    ...pendingParentStudentAccessRequests.map((request) => ({
      ...request,
      requestType: "student-access",
      requestLabel: "Student Access",
      requestedAtValue: request.requestedAt || request.createdAt || ""
    }))
  ].sort((left, right) => new Date(right.requestedAtValue || 0) - new Date(left.requestedAtValue || 0));

  useEffect(() => {
    if (loading || error) {
      setHeaderActions(null);
      return () => setHeaderActions(null);
    }

    if (section === "students") {
      setHeaderActions(
        <>
          <button type="button" className="primary-btn" onClick={() => setManagingStudent({})}>
            Add Student
          </button>
          <button type="button" className="secondary-btn" onClick={() => {
            resetBulkImportState();
            setShowBulkImport(true);
          }}>
            Import CSV
          </button>
        </>
      );
    } else if (section === "teachers") {
      setHeaderActions(
        <button type="button" className="primary-btn" onClick={() => setManagingTeacher({})}>
          Add Teacher
        </button>
      );
    } else if (section === "parents") {
      setHeaderActions(
        <button
          type="button"
          className="secondary-btn request-header-btn"
          onClick={() => setShowRequestsModal(true)}
        >
          <Inbox size={16} />
          <span>Requests</span>
          {pendingRequests.length > 0 && <span className="request-dot" aria-hidden="true" />}
        </button>
      );
    } else {
      setHeaderActions(null);
    }

    return () => setHeaderActions(null);
  }, [error, loading, pendingRequests.length, section, setHeaderActions]);

  if (loading) return <div className="loading-container">Loading system stats...</div>;
  if (error) return <div className="error-container">{error}</div>;

  const recentUpdates = [...students]
    .filter((student) => student.updatedAt || student.recentActivity.length)
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
    .slice(0, 6);
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
  const selectedClass = classReports.find((classroom) => classroom.id === selectedClassId) || classReports[0] || null;
  const selectedClassTeacher = selectedClass?.teacherName || selectedClass?.adviserName || selectedClass?.teacherEmail || selectedClass?.adviserEmail || "Unassigned";
  const sectionLabelByClassId = classReports.reduce((lookup, classroom) => {
    lookup[classroom.id] = classroom.section || getSectionOnlyLabel(classroom.name) || classroom.id;
    return lookup;
  }, {});
  const studentSearchTerm = studentSearch.trim().toLowerCase();
  const adminStudentRows = students
    .filter((student) => {
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
    })
    .sort((left, right) => {
      const gradeDifference = getGradeLevelRank(left.gradeLevel, gradeLevels) - getGradeLevelRank(right.gradeLevel, gradeLevels);
      if (gradeDifference) return gradeDifference;

      const sectionDifference = String(left.className || left.section || "").localeCompare(
        String(right.className || right.section || ""),
        undefined,
        { numeric: true, sensitivity: "base" }
      );
      if (sectionDifference) return sectionDifference;

      return String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" });
    });
  const availableAdviserOptions = teacherUsers.filter((teacher) => (
    !teacher.advisoryClassId
    || teacher.advisoryClassId === editingClassId
  ));
  const gradeLevelCards = gradeLevelRecords.map((gradeRecord) => {
    const sections = classReports.filter((classroom) => classroom.gradeLevel === gradeRecord.name);

    return {
      gradeLevel: gradeRecord.name,
      status: gradeRecord.status === "inactive" ? "Inactive" : "Active",
      isActive: gradeRecord.status !== "inactive",
      sectionCount: sections.length,
      studentCount: sections.reduce((total, classroom) => total + classroom.students.length, 0)
    };
  });
  const dashboardDate = new Date();
  const currentCalendarMonthLabel = dashboardDate.toLocaleString(undefined, {
    month: "long",
    year: "numeric"
  });
  const calendarMonthStart = new Date(dashboardDate.getFullYear(), dashboardDate.getMonth(), 1);
  const calendarDayCells = Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(calendarMonthStart);
    cellDate.setDate(index - calendarMonthStart.getDay() + 1);

    return {
      key: cellDate.toISOString(),
      label: cellDate.getDate(),
      isCurrentMonth: cellDate.getMonth() === dashboardDate.getMonth(),
      isToday: cellDate.toDateString() === dashboardDate.toDateString()
    };
  });
  const gradeLevelCountMap = students.reduce((counts, student) => {
    const key = String(student.gradeLevel || "Unassigned").trim() || "Unassigned";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const orderedGradeLevels = [
    ...gradeLevels,
    ...Object.keys(gradeLevelCountMap).filter((gradeLevel) => !gradeLevels.includes(gradeLevel))
  ];
  const gradeLevelDistribution = orderedGradeLevels
    .map((gradeLevel, index) => ({
      label: gradeLevel,
      count: gradeLevelCountMap[gradeLevel] || 0,
      color: ADMIN_DASHBOARD_COLORS[index % ADMIN_DASHBOARD_COLORS.length]
    }))
    .filter((item) => item.count > 0);
  const totalGradeLevelStudents = gradeLevelDistribution.reduce((sum, item) => sum + item.count, 0);
  let gradeLevelDistributionOffset = 0;
  const gradeLevelPieSegments = gradeLevelDistribution.map((item) => {
    const percent = totalGradeLevelStudents ? (item.count / totalGradeLevelStudents) * 100 : 0;
    const segment = {
      ...item,
      dashArray: `${percent} ${100 - percent}`,
      dashOffset: 25 - gradeLevelDistributionOffset
    };
    gradeLevelDistributionOffset += percent;
    return segment;
  });
  const accountDistribution = [
    { label: "Students", count: repositorySummary.students || 0, color: ADMIN_DASHBOARD_COLORS[0] },
    { label: "Teachers", count: repositorySummary.teachers || 0, color: ADMIN_DASHBOARD_COLORS[2] },
    { label: "Parents", count: repositorySummary.parents || 0, color: ADMIN_DASHBOARD_COLORS[4] },
    { label: "Sections", count: repositorySummary.classes || 0, color: ADMIN_DASHBOARD_COLORS[6] }
  ].filter((item) => item.count > 0);
  const totalAccountDistribution = accountDistribution.reduce((sum, item) => sum + item.count, 0);
  let accountDistributionOffset = 0;
  const accountPieSegments = accountDistribution.map((item) => {
    const percent = totalAccountDistribution ? (item.count / totalAccountDistribution) * 100 : 0;
    const segment = {
      ...item,
      dashArray: `${percent} ${100 - percent}`,
      dashOffset: 25 - accountDistributionOffset
    };
    accountDistributionOffset += percent;
    return segment;
  });

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

  const handleBulkStudentFile = async (event) => {
    const file = event.target.files?.[0] || null;
    setBulkImportResult(null);

    if (!file) {
      resetBulkImportState();
      return;
    }

    try {
      const text = await file.text();
      const rows = parseStudentCsv(text)
        .sort((left, right) => getBulkStudentDisplayName(left).localeCompare(getBulkStudentDisplayName(right)));

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
        message: editingClassId ? "Section updated." : "Section added."
      });
    } catch (saveError) {
      setFeedback({
        type: "error",
        message: saveError?.message || "Section could not be saved."
      });
    }
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
    const accountToDelete = deletingAccount;

    if (!accountToDelete?.id || isDeletingAccount) {
      return;
    }

    setIsDeletingAccount(true);

    try {
      if (accountToDelete.role === "student") {
        await deleteStudentRecord(accountToDelete.id);
      } else if (accountToDelete.role === "teacher") {
        await deleteTeacherRecord(accountToDelete.id);
      } else if (accountToDelete.role === "parent") {
        await deleteParentRecord(accountToDelete.id);
      }

      setFeedback({
        type: "success",
        message: `${accountToDelete.name} has been deleted.`
      });
      setDeletingAccount(null);
    } catch (deleteError) {
      setFeedback({
        type: "error",
        message: deleteError?.message || "Account could not be deleted."
      });
    } finally {
      setIsDeletingAccount(false);
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

  const requestListContent = pendingRequests.length ? (
    <ul className="stack-list">
      {pendingRequests.map((request) => {
        const isParentAccountRequest = request.requestType === "parent-account";
        const isSaving = isParentAccountRequest
          ? savingParentRequestId === request.id
          : savingAccessRequestId === request.id;

        return (
          <li key={`${request.requestType}-${request.id}`} className="list-row">
            <div>
              <strong>{isParentAccountRequest ? request.name || "Parent" : request.parentName || "Parent"}</strong>
              <p>
                <span className="meta-badge">{request.requestLabel}</span>{" "}
                {isParentAccountRequest
                  ? `${request.email || "No email provided"} | Student ID ${request.studentNumber || "N/A"}`
                  : `${request.studentName || "Student"} ${request.studentNumber ? `(${request.studentNumber})` : ""}`}
              </p>
            </div>
            <div className="table-actions">
              <button
                type="button"
                className="primary-btn"
                disabled={isSaving}
                onClick={() => (
                  isParentAccountRequest
                    ? handleParentAccountDecision(request, "accept")
                    : handleStudentAccessDecision(request, "accept")
                )}
              >
                {isSaving ? "Saving..." : "Accept"}
              </button>
              <button
                type="button"
                className="secondary-btn"
                disabled={isSaving}
                onClick={() => (
                  isParentAccountRequest
                    ? handleParentAccountDecision(request, "reject")
                    : handleStudentAccessDecision(request, "reject")
                )}
              >
                Decline
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  ) : (
    <p className="empty-copy">No requests are waiting for approval.</p>
  );

  return (
    <div className="admin-view">
      {feedback && (
        <div className={`feedback-toast ${feedback.type === "error" ? "error-banner" : "success-banner"}`}>
          {feedback.message}
        </div>
      )}

      {(section === "dashboard" || section === "overview") && (
        <div className="stats-grid">
          <div className="stat-card"><h4>Total Teachers</h4><p>{repositorySummary.teachers}</p></div>
          <div className="stat-card"><h4>Total Students</h4><p>{repositorySummary.students}</p></div>
          <div className="stat-card"><h4>Total Parents</h4><p>{repositorySummary.parents}</p></div>
          <div className="stat-card"><h4>Total Sections</h4><p>{repositorySummary.classes}</p></div>
        </div>
      )}

      {(section === "dashboard" || section === "overview") && (
        <div className="dashboard-overview-grid">
          <div className="dashboard-main-column">
            <div className="panel">
              <h3>Academic Snapshot</h3>
            <div className="report-strip">
              <div>
                <span>Students with Section</span>
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
          </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Enrollment by Grade</h3>
                <span className="meta-badge">{totalGradeLevelStudents} students</span>
              </div>
              {gradeLevelPieSegments.length ? (
                <div className="subject-pie-panel">
                  <div className="subject-pie-chart-wrap" aria-hidden="true">
                    <svg viewBox="0 0 42 42" className="subject-pie-chart">
                      <circle className="subject-pie-track" cx="21" cy="21" r="15.9155" />
                      {gradeLevelPieSegments.map((segment) => (
                        <circle
                          key={segment.label}
                          className="subject-pie-segment"
                          cx="21"
                          cy="21"
                          r="15.9155"
                          stroke={segment.color}
                          strokeDasharray={segment.dashArray}
                          strokeDashoffset={segment.dashOffset}
                        />
                      ))}
                    </svg>
                  </div>
                  <ul className="subject-pie-legend">
                    {gradeLevelDistribution.map((item) => (
                      <li key={item.label} className="subject-pie-legend-item">
                        <span className="subject-pie-swatch" style={{ backgroundColor: item.color }} />
                        <div>
                          <strong>{item.label}</strong>
                          <p>{item.count} student{item.count === 1 ? "" : "s"}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="empty-copy">No enrolled students yet.</p>
              )}
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

          <div className="dashboard-side-stack">
            <div className="panel calendar-panel">
              <div className="panel-header">
                <h3>Calendar</h3>
                <span className="meta-badge">{currentCalendarMonthLabel}</span>
              </div>
              <div className="calendar-grid calendar-grid-head">
                {CALENDAR_WEEKDAY_LABELS.map((day) => (
                  <span key={day} className="calendar-weekday">{day}</span>
                ))}
              </div>
              <div className="calendar-grid calendar-grid-body">
                {calendarDayCells.map((cell) => (
                  <span
                    key={cell.key}
                    className={`calendar-day${cell.isCurrentMonth ? "" : " muted"}${cell.isToday ? " today" : ""}`}
                  >
                    {cell.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="panel admin-distribution-panel">
              <div className="panel-header">
                <h3>Repository Distribution</h3>
                <span className="meta-badge">{totalAccountDistribution} records</span>
              </div>
              {accountPieSegments.length ? (
                <div className="subject-pie-panel">
                  <div className="subject-pie-chart-wrap" aria-hidden="true">
                    <svg viewBox="0 0 42 42" className="subject-pie-chart">
                      <circle className="subject-pie-track" cx="21" cy="21" r="15.9155" />
                      {accountPieSegments.map((segment) => (
                        <circle
                          key={segment.label}
                          className="subject-pie-segment"
                          cx="21"
                          cy="21"
                          r="15.9155"
                          stroke={segment.color}
                          strokeDasharray={segment.dashArray}
                          strokeDashoffset={segment.dashOffset}
                        />
                      ))}
                    </svg>
                  </div>
                  <ul className="subject-pie-legend">
                    {accountDistribution.map((item) => (
                      <li key={item.label} className="subject-pie-legend-item">
                        <span className="subject-pie-swatch" style={{ backgroundColor: item.color }} />
                        <div>
                          <strong>{item.label}</strong>
                          <p>{item.count}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="empty-copy">Distribution will appear once records are available.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {section === "students" && (
        <>
          <div className="panel">
            <div className="panel-header">
              <h3>Student Records</h3>
              <span className="meta-badge">{adminStudentRows.length} of {students.length}</span>
            </div>
            <div className="table-filter-bar student-filter-bar">
              <label className="selector-field student-search-field">
                <span>Search</span>
                <input
                  type="search"
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="Name, ID number, or email"
                />
              </label>
              <label className="selector-field">
                <span>Grade</span>
                <select value={studentGradeFilter} onChange={(event) => setStudentGradeFilter(event.target.value)}>
                  <option value="">All Grades</option>
                  {gradeLevels.map((gradeLevel) => (
                    <option key={gradeLevel} value={gradeLevel}>{gradeLevel}</option>
                  ))}
                </select>
              </label>
              <label className="selector-field">
                <span>Section</span>
                <select value={studentClassFilter} onChange={(event) => {
                  setStudentClassFilter(event.target.value);
                  if (event.target.value && event.target.value !== "__unassigned") setSelectedClassId(event.target.value);
                }}>
                  <option value="">All Sections</option>
                  <option value="__unassigned">No Section / Unassigned</option>
                  {classReports.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name || `${classroom.gradeLevel || "Grade"} - ${classroom.section || classroom.id}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <table className="data-table student-records-table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>ID Number</th>
                  <th>Email</th>
                  <th>Grade</th>
                  <th>Section</th>
                  <th>Adviser</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {adminStudentRows.map((student) => (
                  <tr key={student.id}>
                    <td data-label="Student Name" className="student-name-cell">
                      <strong>{student.name}</strong>
                    </td>
                    <td data-label="ID Number">{student.studentNumber || "N/A"}</td>
                    <td data-label="Email" className={student.email ? "" : "muted-text"}>
                      {student.email || "No email"}
                    </td>
                    <td data-label="Grade">
                      <span className="record-badge">{student.gradeLevel || "No grade"}</span>
                    </td>
                    <td data-label="Section">
                      <span className={`record-badge ${student.classId ? "" : "muted"}`}>
                        {sectionLabelByClassId[student.classId] || getSectionOnlyLabel(student.className) || "Unassigned"}
                      </span>
                    </td>
                    <td data-label="Adviser" className={`student-adviser-cell${student.teacherName ? "" : " muted-text"}`}>
                      {student.teacherName || "Unassigned"}
                    </td>
                    <td data-label="Action">
                      <div className="table-actions">
                        <button className="secondary-btn" type="button" onClick={() => setManagingStudent(student)}>
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {adminStudentRows.length === 0 && (
                  <tr>
                    <td colSpan="7">No students match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </>
      )}

      {section === "classes" && (
        <>
          <div className="management-grid">
            <div className="management-panel panel">
              <div className="management-panel-header">
                <div>
                  <h3>Grade Levels</h3>
                  <p className="muted-text">Maintain the grade levels available for students.</p>
                </div>
                <button
                  type="button"
                  className="icon-square-btn"
                  aria-label="Add grade level"
                  onClick={() => setShowGradeLevelForm(true)}
                >
                  <Plus size={21} />
                </button>
              </div>
              <div className="management-table-wrap">
                <table className="data-table management-table">
                  <thead>
                    <tr>
                      <th>Grade Level</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradeLevelCards.map((grade) => (
                      <tr key={grade.gradeLevel}>
                        <td data-label="Grade Level"><strong>{grade.gradeLevel}</strong></td>
                        <td data-label="Status">
                          <span className={`status-pill ${grade.isActive ? "active" : "no-class"}`}>{grade.status}</span>
                        </td>
                        <td data-label="Actions">
                          <div className="table-actions management-actions">
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => openClassForm(null, grade.gradeLevel)}
                            >
                              <PencilLine size={16} />
                              Edit
                            </button>
                            <button
                              type="button"
                              className="secondary-btn"
                              disabled={savingGradeLevelName === grade.gradeLevel}
                              onClick={() => (
                                grade.isActive
                                  ? handleDeactivateGradeLevel(grade.gradeLevel)
                                  : saveGradeLevelRecord({ name: grade.gradeLevel })
                                    .then(() => setFeedback({ type: "success", message: `${grade.gradeLevel} has been activated.` }))
                                    .catch((saveError) => setFeedback({
                                      type: "error",
                                      message: saveError?.message || "Grade level could not be updated."
                                    }))
                              )}
                            >
                              <Power size={16} />
                              {savingGradeLevelName === grade.gradeLevel ? "Saving..." : grade.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="management-panel panel">
              <div className="management-panel-header">
                <div>
                  <h3>Sections</h3>
                  <p className="muted-text">Assign sections to their corresponding grade levels.</p>
                </div>
                <button
                  type="button"
                  className="icon-square-btn"
                  aria-label="Add section"
                  onClick={() => openClassForm()}
                >
                  <Plus size={21} />
                </button>
              </div>
              <div className="management-table-wrap">
                <table className="data-table management-table">
                  <thead>
                    <tr>
                      <th>Section</th>
                      <th>Grade Level</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classReports.map((classroom) => (
                      <tr key={classroom.id}>
                        <td data-label="Section"><strong>{classroom.section || "N/A"}</strong></td>
                        <td data-label="Grade Level">{classroom.gradeLevel || "N/A"}</td>
                        <td data-label="Status"><span className="status-pill active">Active</span></td>
                        <td data-label="Actions">
                          <div className="table-actions management-actions">
                            <button className="secondary-btn" type="button" onClick={() => openClassForm(classroom)}>
                              <PencilLine size={16} />
                              Edit
                            </button>
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => setFeedback({ type: "success", message: `${classroom.section || "Section"} remains active.` })}
                            >
                              <Power size={16} />
                              Deactivate
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {classReports.length === 0 && (
                      <tr>
                        <td colSpan="4">No sections available yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {section === "teachers" && (
        <>
          <div className="panel">
          <div className="panel-header">
            <h3>Teacher Accounts</h3>
            <span className="meta-badge">{teacherUsers.length} accounts</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Email</th>
                <th>Subjects</th>
                <th>Advisory</th>
                <th>Sections</th>
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
                  <td data-label="Sections">{teacher.classCount}</td>
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
        </>
      )}

      {section === "parents" && (
        <>
          <div className="panel">
            <div className="panel-header">
              <h3>Parent Accounts</h3>
              <span className="meta-badge">{parentUsers.length} accounts</span>
            </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Parent</th>
                <th>Email</th>
                <th>Linked Students</th>
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
                  <td colSpan="4">No parent accounts available yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </>
      )}

      {showRequestsModal && (
        <div className="modal-overlay" onClick={() => setShowRequestsModal(false)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h3>Pending Requests</h3>
              <span className="meta-badge">{pendingRequests.length} pending</span>
            </div>
            {requestListContent}
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowRequestsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {section === "reports" && (
        <>
          <div className="panel">
            <h3>School-wide Performance Report</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Students</th>
                  <th>Average GPA</th>
                  <th>Attendance</th>
                  <th>Needs Support</th>
                </tr>
              </thead>
              <tbody>
                {classReports.map((classroom) => (
                  <tr key={classroom.id}>
                    <td data-label="Section">{classroom.name || classroom.section || classroom.id}</td>
                    <td data-label="Students">{classroom.students.length}</td>
                    <td data-label="Average GPA">{classroom.averageGpa ?? "N/A"}</td>
                    <td data-label="Attendance">{classroom.averageAttendance ? `${classroom.averageAttendance}%` : "N/A"}</td>
                    <td data-label="Needs Support">{classroom.atRiskCount}</td>
                  </tr>
                ))}
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
                        <td data-label="Student">
                          {getBulkStudentDisplayName(row)}
                        </td>
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

      {showGradeLevelForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="panel-header">
              <h3>Add Grade Level</h3>
            </div>
            <form onSubmit={handleSaveGradeLevel}>
              <div className="modal-form-grid">
                <div className="form-group form-group-full">
                  <label>Grade Level Name</label>
                  <input
                    type="text"
                    value={gradeLevelFormName}
                    onChange={(event) => setGradeLevelFormName(event.target.value)}
                    placeholder="Example: Grade 11"
                    required
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="submit" className="primary-btn" disabled={Boolean(savingGradeLevelName)}>
                  {savingGradeLevelName ? "Saving..." : "Add Grade Level"}
                </button>
                <button type="button" className="secondary-btn" onClick={closeGradeLevelForm}>
                  Cancel
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
              <h3>{editingClassId ? "Edit Section" : "Add Section"}</h3>
            </div>
            <form onSubmit={handleSaveClass}>
              <div className="modal-form-grid">
                <div className="form-group">
                  <label>Grade Level</label>
                  <select
                    value={classForm.gradeLevel}
                    onChange={(event) => setClassForm({ ...classForm, gradeLevel: event.target.value })}
                    required
                  >
                    <option value="">Select grade</option>
                    {gradeLevels.map((gradeLevel) => (
                      <option key={gradeLevel} value={gradeLevel}>
                        {gradeLevel}
                      </option>
                    ))}
                  </select>
                </div>
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
                  <label>Section Code</label>
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
                  {savingClass ? "Saving..." : editingClassId ? "Save Section" : "Add Section"}
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
          gradeLevelOptions={gradeLevels}
          defaultClassId={selectedClass?.id || ""}
          defaultTeacherId={selectedClass?.teacherId || selectedClass?.teacherUid || ""}
          defaultTeacherName={selectedClassTeacher}
          defaultGradeLevel={selectedClass?.gradeLevel || ""}
          showClassSelector
          showGradeLevelSelector
          allowTeacherSelection
          accountFieldsOnly={!managingStudent.id}
          showAcademicFields={false}
          showAccountActions={Boolean(managingStudent.id)}
          deleting={savingStudentId === managingStudent.id}
          saving={Boolean(savingStudentId)}
          submitLabel={managingStudent.id ? "Save Changes" : "Add Student"}
          onClose={() => setManagingStudent(null)}
          onResetPassword={() => {
            setResettingAccount({
              id: managingStudent.id,
              name: managingStudent.name,
              role: "student",
              defaultPassword: managingStudent.studentNumber || ""
            });
            setManagingStudent(null);
          }}
          onDelete={() => {
            setDeletingAccount({
              id: managingStudent.id,
              name: managingStudent.name,
              role: "student"
            });
            setManagingStudent(null);
          }}
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
            ? "This will delete the student account, student record, section roster link, and pending parent access requests."
            : deletingAccount.role === "teacher"
            ? "This will delete the teacher account and remove advisory assignment from any section."
            : "This will delete the parent account and remove links to student records and pending access requests."}
          confirmLabel={`Delete ${deletingAccount.role.charAt(0).toUpperCase() + deletingAccount.role.slice(1)}`}
          cancelLabel="Cancel"
          busy={isDeletingAccount || (deletingAccount.role === "student"
            ? savingStudentId === deletingAccount.id
            : deletingAccount.role === "teacher"
            ? savingTeacherId === deletingAccount.id
            : false)}
          onConfirm={handleDeleteAccount}
          onCancel={() => {
            if (isDeletingAccount) return;
            setDeletingAccount(null);
          }}
        />
      )}
    </div>
  );
};

export default AdminView;
