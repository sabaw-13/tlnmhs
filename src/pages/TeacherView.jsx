import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import {
  calculateFinalGrade,
  calculateQuarterGrade,
  calculateQuarterGradeDetails,
  createDefaultQuarterScores,
  createEmptyQuarterScores,
  DEFAULT_GRADE_WEIGHTS,
  FIXED_ASSESSMENT_SLOTS,
  formatPersonName,
  formatShortDate,
  normalizeQuarterScoreShape,
  normalizeStoredScoreEntry,
  parseScoreEntry,
  TERM_OPTIONS as QUARTER_OPTIONS,
  toNumber
} from "../utils/reporting";
import ConfirmDialog from "../components/ConfirmDialog";
import StudentRecordModal from "../components/StudentRecordModal";
import "./TeacherDashboard.css";

const getStatusClassName = (value) => value.toLowerCase().replace(/\s+/g, "-");
const ATTENDANCE_STATUS_OPTIONS = [
  { value: "present", label: "Present", code: "P" },
  { value: "absent", label: "Absent", code: "A" },
  { value: "late", label: "Tardy", code: "T" },
  { value: "unexcused", label: "Unexcused", code: "U" },
  { value: "excused", label: "Excused", code: "E" }
];
const ATTENDED_STATUSES = new Set(["present", "late", "excused"]);
const FIXED_ASSESSMENT_COLUMNS = [
  ...Array.from({ length: FIXED_ASSESSMENT_SLOTS.writtenWork }, (_, index) => ({
    categoryKey: "writtenWork",
    subcategoryKey: "quizzes",
    index,
    shortLabel: `Written / Oral Work ${index + 1}`
  })),
  ...Array.from({ length: FIXED_ASSESSMENT_SLOTS.performanceTask }, (_, index) => ({
    categoryKey: "performanceTask",
    subcategoryKey: "activities",
    index,
    shortLabel: `Performance Task ${index + 1}`
  })),
  ...Array.from({ length: FIXED_ASSESSMENT_SLOTS.finalExam }, (_, index) => ({
    categoryKey: "finalExam",
    subcategoryKey: "exams",
    index,
    shortLabel: `Summative ${index + 1}`
  }))
];

const getLocalDateValue = () => {
  const date = new Date();
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
};

const formatDateLabel = (dateValue) => {
  if (!dateValue) return "Selected date";

  return formatShortDate(`${dateValue}T00:00:00`);
};
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
const isWeekendDate = (dateValue) => {
  if (!dateValue) return false;

  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDay();

  return day === 0 || day === 6;
};

const getAttendanceStatusLabel = (status) => {
  return ATTENDANCE_STATUS_OPTIONS.find((option) => option.value === status)?.label || "Not marked";
};

const getAttendanceStatusCode = (status) => {
  return ATTENDANCE_STATUS_OPTIONS.find((option) => option.value === status)?.code || "";
};

const buildSubjectKey = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const getSubjectOptionLabel = (subject) => (
  subject?.code ? `${subject.code} - ${subject.name}` : subject?.name || ""
);
const getSubjectSelectorValue = (subject) => subject?.code || subject?.name || "";
const getSubjectStorageKey = (subject) => buildSubjectKey(subject?.code || subject?.name || subject || "");
const isSameSubjectRecord = (leftSubject, rightSubject) => {
  const leftCode = String(leftSubject?.code || leftSubject?.subjectCode || "").trim().toLowerCase();
  const rightCode = String(rightSubject?.code || rightSubject?.subjectCode || "").trim().toLowerCase();

  if (leftCode || rightCode) {
    return Boolean(leftCode) && leftCode === rightCode;
  }

  return String(leftSubject?.name || leftSubject?.subject || leftSubject || "").trim().toLowerCase()
    === String(rightSubject?.name || rightSubject?.subject || rightSubject || "").trim().toLowerCase();
};

const normalizeScoreArray = (value) => {
  if (Array.isArray(value)) return value.map((score) => normalizeStoredScoreEntry(score));
  if (value === null || value === undefined || value === "") return [""];
  return [normalizeStoredScoreEntry(value)];
};
const normalizeOptionalScoreArray = (value) => {
  if (value === null || value === undefined || value === "") return [];
  return normalizeScoreArray(value);
};

const hasScoreValue = (value) => String(value ?? "").trim() !== "";
const parseScoreParts = (value) => {
  const parsedEntry = parseScoreEntry(value);

  return {
    score: parsedEntry?.scoreValue || "",
    total: parsedEntry?.totalValue || ""
  };
};
const buildScoreEntryValue = (scoreValue, totalValue) => {
  const normalizedScore = String(scoreValue || "").trim();
  const normalizedTotal = String(totalValue || "").trim();

  if (!normalizedScore && !normalizedTotal) return "";
  if (!normalizedTotal) return normalizedScore;
  if (!normalizedScore) return `/${normalizedTotal}`;

  return `${normalizedScore}/${normalizedTotal}`;
};
const noopHeaderActions = () => {};
const SUBJECT_PIE_COLORS = [
  "#2563eb",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f97316"
];
const getStudentDisplayName = (student) => formatPersonName({
  firstName: student?.firstName,
  lastName: student?.lastName,
  middleInitial: student?.middleInitial,
  middleName: student?.middleName,
  name: student?.name,
  displayName: student?.displayName,
  fallback: student?.studentNumber || student?.email || "Student"
});
const CALENDAR_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TeacherView = ({ section = "overview", setHeaderActions = noopHeaderActions }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userData, currentUser } = useAuth();
  const {
    error,
    loading,
    savingStudentId,
    savingTeacherId,
    gradeLevels,
    savingAttendanceKey,
    classReports,
    teacherClassReports,
    teacherUsers,
    students: allStudents = [],
    getClassAttendanceRecords,
    getAttendanceRecord,
    savingEnrollmentStudentId,
    addStudentToClass,
    saveDailyAttendanceRecord,
    saveStudentRecord,
    saveTeacherSubjects,
    saveTeacherSubjectClasses,
    saveSubjectScores,
    saveClassFee,
    saveClassFeePayment,
    deleteClassFee
  } = useSchoolData();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [managingStudent, setManagingStudent] = useState(null);
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [addingStudentToClass, setAddingStudentToClass] = useState(false);
  const [studentToAddId, setStudentToAddId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(getLocalDateValue);
  const [dailyAttendanceDrafts, setDailyAttendanceDrafts] = useState({});
  const [isNoClassDay, setIsNoClassDay] = useState(false);
  const [noClassReason, setNoClassReason] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [editingSubjectName, setEditingSubjectName] = useState("");
  const [subjectForm, setSubjectForm] = useState({
    code: "",
    name: "",
    classIds: []
  });
  const [subjectClassOverrides, setSubjectClassOverrides] = useState({});
  const [selectedSubjectName, setSelectedSubjectName] = useState("");
  const [selectedSubjectClassId, setSelectedSubjectClassId] = useState("");
  const [subjectScoreDrafts, setSubjectScoreDrafts] = useState({});
  const [confirmState, setConfirmState] = useState(null);
  const [savingAllSubjectScores, setSavingAllSubjectScores] = useState(false);
  const [selectedScoreQuarter, setSelectedScoreQuarter] = useState("q1");
  const [expandedGradebookCategories, setExpandedGradebookCategories] = useState({});
  const [showAttendanceReport, setShowAttendanceReport] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [showFeeListModal, setShowFeeListModal] = useState(false);
  const [isSavingFee, setIsSavingFee] = useState(false);
  const [activeStudentFeeTarget, setActiveStudentFeeTarget] = useState(null);
  const [savingFeePaymentKey, setSavingFeePaymentKey] = useState("");
  const [feeForm, setFeeForm] = useState({
    name: "",
    amount: "",
    dueDate: "",
    notes: ""
  });
  const gradeWeights = DEFAULT_GRADE_WEIGHTS;

  const teacherProfile = teacherUsers.find((teacher) => teacher.id === currentUser?.uid) || null;
  const handledSubjects = teacherProfile?.subjectRecords || [];
  const handledSubjectNames = handledSubjects.map((subject) => subject.name);
  const handledSubjectSelectorValues = handledSubjects.map((subject) => getSubjectSelectorValue(subject));
  const handledSubjectSignature = handledSubjects.map((subject) => `${subject.code}|${subject.name}`).join("||");
  const getHandledSubjectRecord = (subjectName) => (
    handledSubjects.find((subject) => {
      const normalizedSubjectName = String(subjectName || "").trim().toLowerCase();
      return subject.name.toLowerCase() === normalizedSubjectName
        || String(subject.code || "").trim().toLowerCase() === normalizedSubjectName;
    }) || null
  );
  const advisoryClass = teacherClassReports.find((classroom) => classroom.id === teacherProfile?.advisoryClassId)
    || teacherClassReports[0]
    || null;
  const getSubjectClassMap = (subjectName) => {
    const subjectRecord = getHandledSubjectRecord(subjectName);
    const subjectKey = getSubjectStorageKey(subjectRecord || subjectName);
    const legacySubjectKey = buildSubjectKey(subjectRecord?.name || subjectName);

    return subjectClassOverrides[subjectKey]
      || teacherProfile?.subjectClassIds?.[subjectKey]
      || (!subjectRecord?.code
        ? subjectClassOverrides[legacySubjectKey] || teacherProfile?.subjectClassIds?.[legacySubjectKey]
        : null)
      || {};
  };
  const subjectAssignedClassIds = new Set(handledSubjects.flatMap((subject) => (
    Object.entries(getSubjectClassMap(getSubjectSelectorValue(subject)))
      .filter(([, isSelected]) => isSelected)
      .map(([classId]) => classId)
  )));
  const attendanceClassReports = [
    ...teacherClassReports,
    ...classReports.filter((classroom) => subjectAssignedClassIds.has(classroom.id))
  ].reduce((uniqueClasses, classroom) => (
    uniqueClasses.some((item) => item.id === classroom.id)
      ? uniqueClasses
      : [...uniqueClasses, classroom]
  ), []);
  const [selectedAttendanceSubjectName, setSelectedAttendanceSubjectName] = useState("");
  const attendanceSubjectOptions = handledSubjects;
  const attendanceVisibleClassReports = attendanceClassReports.filter((classroom) => {
    if (!selectedAttendanceSubjectName) return true;
    const classMap = getSubjectClassMap(selectedAttendanceSubjectName);
    const mappedClassIds = Object.keys(classMap).filter((classId) => classMap[classId]);

    return !mappedClassIds.length || mappedClassIds.includes(classroom.id);
  });
  const isWeekendAttendanceDate = isWeekendDate(attendanceDate);
  const getAttendanceRecordSummary = (record) => {
    if (record.status === "no-class") {
      return record.noClassReason ? `No class - ${record.noClassReason}` : "No class";
    }

    const recordEntries = Object.values(record.records || {});
    const presentCount = recordEntries.filter((entry) => ATTENDED_STATUSES.has(entry?.status)).length;
    const absentCount = recordEntries.filter((entry) => entry?.status === "absent").length;

    return `Present/Credited ${presentCount} | Absent ${absentCount}`;
  };
  const sectionMeta = {
    dashboard: "Teaching Dashboard",
    overview: "Teaching Dashboard",
    students: "Student Manager",
    subjects: "Subject Manager",
    gradebook: "Input Grades",
    attendance: "Attendance",
    fees: "Fee Manager",
    reports: "Reports"
  };
  const isDashboardSection = section === "dashboard" || section === "overview";
  const isClassScopedSection = !["subjects", "gradebook"].includes(section);
  const selectedSubjectClassMap = getSubjectClassMap(selectedSubjectName);
  const selectedSubjectRecord = getHandledSubjectRecord(selectedSubjectName);
  const selectedSubjectLabel = getSubjectOptionLabel(selectedSubjectRecord) || selectedSubjectName;
  const selectedAttendanceSubjectRecord = getHandledSubjectRecord(selectedAttendanceSubjectName);
  const selectedAttendanceSubjectLabel = getSubjectOptionLabel(selectedAttendanceSubjectRecord) || selectedAttendanceSubjectName;
  const selectedSubjectClassIds = Object.keys(selectedSubjectClassMap).filter((classId) => selectedSubjectClassMap[classId]);
  const selectedSubjectClasses = classReports.filter((classroom) => selectedSubjectClassIds.includes(classroom.id));
  const sectionClassReports = section === "attendance"
    ? attendanceVisibleClassReports
    : teacherClassReports;
  const selectedClass = sectionClassReports.find((classroom) => classroom.id === selectedClassId) || sectionClassReports[0] || null;
  const students = selectedClass?.students || [];
  const studentRosterKey = students.map((student) => student.id).join("|");
  const selectedAttendanceRecord = selectedClass
    && selectedAttendanceSubjectName
    ? getAttendanceRecord(
      selectedClass.id,
      attendanceDate,
      selectedAttendanceSubjectRecord?.name || selectedAttendanceSubjectName,
      selectedAttendanceSubjectRecord?.code || ""
    )
    : null;
  const effectiveIsNoClassDay = isNoClassDay;
  const effectiveNoClassReason = effectiveIsNoClassDay
    ? String(noClassReason || "").trim() || (isWeekendAttendanceDate ? "Weekend" : "")
    : "";
  const selectedSubjectAttendanceRecords = selectedClass && selectedAttendanceSubjectName
    ? getClassAttendanceRecords(
      selectedClass.id,
      selectedAttendanceSubjectRecord?.name || selectedAttendanceSubjectName,
      selectedAttendanceSubjectRecord?.code || ""
    )
    : [];
  const sortedAttendanceReportRecords = [...selectedSubjectAttendanceRecords]
    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
  const attendanceReportRows = students.map((student) => {
    const summary = sortedAttendanceReportRecords.reduce((totals, record) => {
      if (record.status === "no-class") {
        return totals;
      }

      const status = record.records?.[student.id]?.status || "";
      if (!status) {
        return totals;
      }

      const isPresent = ATTENDED_STATUSES.has(status);
      const presentCount = totals.present + (isPresent ? 1 : 0);
      const absentCount = totals.absent + (!isPresent ? 1 : 0);

      return {
        present: presentCount,
        absent: absentCount,
        total: presentCount + absentCount
      };
    }, { present: 0, absent: 0, total: 0 });

    return {
      id: student.id,
      studentName: getStudentDisplayName(student),
      present: summary.present,
      absent: summary.absent,
      total: summary.total
    };
  });

  useEffect(() => {
    if (section !== "attendance") return;

    if (!handledSubjectSelectorValues.length) {
      setSelectedAttendanceSubjectName("");
      return;
    }

    if (!selectedAttendanceSubjectName || !handledSubjectSelectorValues.includes(selectedAttendanceSubjectName)) {
      setSelectedAttendanceSubjectName(handledSubjectSelectorValues[0]);
    }
  }, [handledSubjectSelectorValues, handledSubjectSignature, section, selectedAttendanceSubjectName]);

  useEffect(() => {
    if (!saveMessage) return undefined;

    const timeoutId = window.setTimeout(() => {
      setSaveMessage("");
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [saveMessage]);

  useEffect(() => {
    setShowAttendanceReport(false);
  }, [selectedAttendanceSubjectName, selectedClassId]);

  useEffect(() => {
    const subjects = handledSubjectSelectorValues;
    if (!subjects.length) {
      setSelectedSubjectName("");
      return;
    }

    if (!selectedSubjectName || !subjects.some((subject) => subject === selectedSubjectName)) {
      setSelectedSubjectName(subjects[0]);
    }
  }, [handledSubjectSelectorValues, handledSubjectSignature, selectedSubjectName]);

  useEffect(() => {
    if (!["subjects", "gradebook"].includes(section)) return;

    const requestedSubjectName = location.state?.selectedSubjectName;
    if (!requestedSubjectName) return;
    if (!getHandledSubjectRecord(requestedSubjectName)) return;
    if (selectedSubjectName === requestedSubjectName) return;

    setSelectedSubjectName(requestedSubjectName);
    setSelectedSubjectClassId("");
    setSubjectScoreDrafts({});
    navigate(location.pathname, { replace: true, state: null });
  }, [handledSubjectSignature, location.pathname, location.state, navigate, section, selectedSubjectName]);

  useEffect(() => {
    if (!sectionClassReports.length) {
      setSelectedClassId("");
      return;
    }

    const hasSelectedClass = sectionClassReports.some((classroom) => classroom.id === selectedClassId);
    if (!selectedClassId || !hasSelectedClass) {
      setSelectedClassId(sectionClassReports[0].id);
    }
  }, [sectionClassReports, selectedClassId]);

  useEffect(() => {
    const hasStoredRecord = Boolean(selectedAttendanceRecord);
    const shouldDefaultToNoClass = selectedAttendanceRecord?.status === "no-class"
      || (!hasStoredRecord && isWeekendAttendanceDate);

    setIsNoClassDay(shouldDefaultToNoClass);
    setNoClassReason(
      selectedAttendanceRecord?.noClassReason
      || (!hasStoredRecord && isWeekendAttendanceDate ? "Weekend" : "")
    );
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
  }, [attendanceDate, selectedClassId, selectedAttendanceSubjectName, selectedAttendanceRecord, studentRosterKey, isWeekendAttendanceDate]);
  const classTeacherName = selectedClass?.teacherName
    || selectedClass?.adviserName
    || userData?.displayName
    || userData?.email
    || currentUser?.email
    || "Assigned Teacher";
  const advisoryFees = Object.entries(advisoryClass?.fees || {})
    .map(([id, fee]) => {
      const payments = fee?.payments || {};
      const paidCount = students.filter((student) => payments?.[student.id]?.paid).length;

      return {
        id,
        ...fee,
        paidCount,
        totalStudents: students.length
      };
    })
    .sort((left, right) => (
      String(left.dueDate || "").localeCompare(String(right.dueDate || ""))
      || String(left.name || "").localeCompare(String(right.name || ""))
    ));
  const currentActiveStudentFeeTarget = activeStudentFeeTarget
    ? students.find((student) => student.id === activeStudentFeeTarget.id) || activeStudentFeeTarget
    : null;
  const handledSubjectAttendanceRates = handledSubjects.flatMap((subject) => {
    const subjectValue = getSubjectSelectorValue(subject);
    const classMap = getSubjectClassMap(subjectValue);
    const classIds = Object.keys(classMap).filter((classId) => classMap[classId]);
    const normalizedSubjectCode = String(subject.code || "").trim().toLowerCase();
    const normalizedSubjectName = String(subject.name || "").trim().toLowerCase();

    return allStudents
      .filter((student) => student.id && student.classId && classIds.includes(student.classId))
      .map((student) => {
        const subjectRecord = (student.subjects || []).find((item) => (
          normalizedSubjectCode
            ? String(item.code || item.subjectCode || "").trim().toLowerCase() === normalizedSubjectCode
            : String(item.name || "").trim().toLowerCase() === normalizedSubjectName
        ));

        return Number(subjectRecord?.attendanceRate);
      })
      .filter((attendanceRate) => Number.isFinite(attendanceRate));
  });
  const dashboardHandledAttendanceAverage = handledSubjectAttendanceRates.length
    ? Number((handledSubjectAttendanceRates.reduce((sum, value) => sum + value, 0) / handledSubjectAttendanceRates.length).toFixed(1))
    : null;
  const dashboardAttendanceAverage = Number.isFinite(dashboardHandledAttendanceAverage)
    ? `${dashboardHandledAttendanceAverage}%`
    : "N/A";
  const dashboardSectionCount = attendanceClassReports.length;
  const canRenderTeacherWorkspace = sectionClassReports.length > 0
    || isDashboardSection
    || section === "attendance"
    || section === "subjects";
  const studentFeeRows = students.map((student) => {
    const paidCount = advisoryFees.filter((fee) => fee?.payments?.[student.id]?.paid).length;
    const totalFees = advisoryFees.length;

    return {
      ...student,
      paidCount,
      unpaidCount: Math.max(0, totalFees - paidCount),
      totalFees
    };
  });
  const existingStudentOptions = allStudents
    .filter((student) => {
      if (!student.id || student.classId === selectedClass?.id) return false;
      if (student.classId) return false;
      if (selectedClass?.gradeLevel && student.gradeLevel && student.gradeLevel !== selectedClass.gradeLevel) return false;

      return true;
    })
    .sort((left, right) => getStudentDisplayName(left).localeCompare(getStudentDisplayName(right)));
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
  const subjectStudents = allStudents
    .filter((student) => student.id && student.classId && selectedSubjectClassIds.includes(student.classId))
    .sort((left, right) => (
      String(left.className).localeCompare(String(right.className))
      || getStudentDisplayName(left).localeCompare(getStudentDisplayName(right))
    ));
  const visibleSubjectStudents = selectedSubjectClassId
    ? subjectStudents.filter((student) => student.classId === selectedSubjectClassId)
    : subjectStudents;
  const subjectStudentGroups = visibleSubjectStudents.reduce((groups, student) => {
    const groupName = student.className || "Unassigned Section";
    groups[groupName] = [...(groups[groupName] || []), student];
    return groups;
  }, {});
  const currentCalendarDate = new Date();
  const currentCalendarMonthLabel = currentCalendarDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
  const todayDayNumber = currentCalendarDate.getDate();
  const todayMonthIndex = currentCalendarDate.getMonth();
  const todayYear = currentCalendarDate.getFullYear();
  const firstCalendarDate = new Date(todayYear, todayMonthIndex, 1);
  const firstCalendarWeekday = firstCalendarDate.getDay();
  const daysInCalendarMonth = new Date(todayYear, todayMonthIndex + 1, 0).getDate();
  const calendarDayCells = [
    ...Array.from({ length: firstCalendarWeekday }, (_, index) => ({
      key: `blank-${index}`,
      label: "",
      isCurrentMonth: false,
      isToday: false
    })),
    ...Array.from({ length: daysInCalendarMonth }, (_, index) => {
      const dayNumber = index + 1;
      return {
        key: `day-${dayNumber}`,
        label: dayNumber,
        isCurrentMonth: true,
        isToday: dayNumber === todayDayNumber
      };
    })
  ];
  const getStudentSubjectRecord = (student, subjectName) => {
    const handledSubjectRecord = getHandledSubjectRecord(subjectName);
    const normalizedTargetCode = String(handledSubjectRecord?.code || "").trim().toLowerCase();
    const normalizedTargetName = String(handledSubjectRecord?.name || subjectName || "").trim().toLowerCase();

    if (normalizedTargetCode) {
      return student.subjects.find((subject) => (
        String(subject.code || subject.subjectCode || "").trim().toLowerCase() === normalizedTargetCode
      )) || null;
    }

    return student.subjects.find((subject) => (
      String(subject.name || "").trim().toLowerCase() === normalizedTargetName
    )) || null;
  };
  const handledSubjectSummaries = handledSubjects.map((subject, index) => {
    const subjectName = subject.name;
    const subjectValue = getSubjectSelectorValue(subject);
    const classMap = getSubjectClassMap(subjectValue);
    const classIds = Object.keys(classMap).filter((classId) => classMap[classId]);
    const subjectStudentsForSummary = allStudents.filter((student) => (
      student.id && student.classId && classIds.includes(student.classId)
    ));
    const subjectStudentCount = subjectStudentsForSummary.length;
    const averageSubjectGradeValues = subjectStudentsForSummary
      .map((student) => getStudentSubjectRecord(student, subjectValue)?.finalGrade)
      .filter((grade) => Number.isFinite(grade));
    const averageSubjectGrade = averageSubjectGradeValues.length
      ? Number((averageSubjectGradeValues.reduce((sum, value) => sum + value, 0) / averageSubjectGradeValues.length).toFixed(1))
      : null;

    return {
      subjectCode: subject.code,
      subjectName,
      subjectValue,
      subjectLabel: getSubjectOptionLabel(subject),
      studentCount: subjectStudentCount,
      sectionCount: classIds.length,
      averageGrade: averageSubjectGrade,
      color: SUBJECT_PIE_COLORS[index % SUBJECT_PIE_COLORS.length]
    };
  });
  const totalHandledSubjectStudents = handledSubjectSummaries.reduce((sum, item) => sum + item.studentCount, 0);
  const dashboardStudentCount = advisoryClass?.students?.length ?? totalHandledSubjectStudents;
  let handledSubjectPieOffset = 0;
  const handledSubjectPieSegments = handledSubjectSummaries
    .filter((item) => item.studentCount > 0)
    .map((item) => {
      const fraction = item.studentCount / totalHandledSubjectStudents;
      const dashLength = fraction * 100;
      const segment = {
        ...item,
        dashArray: `${dashLength} ${100 - dashLength}`,
        dashOffset: -handledSubjectPieOffset
      };

      handledSubjectPieOffset += dashLength;
      return segment;
    });
  const getQuarterScores = (subject, quarterKey) => {
    const quarter = subject?.quarters?.[quarterKey] || {};
    const legacyScores = quarterKey === "q1" ? {
      activities: subject?.activities,
      quizzes: subject?.quizzes,
      exams: subject?.exams
    } : {};

    return normalizeQuarterScoreShape(quarter, legacyScores);
  };

  const openStudentModal = (student = null) => {
    if (!student?.id) return;

    setManagingStudent(student || {});
    setSaveMessage("");
  };

  const openAddStudentModal = () => {
    setCreatingStudent(true);
    setManagingStudent(null);
    setAddingStudentToClass(false);
    setSaveMessage("");
  };

  const openAddExistingStudentModal = () => {
    setStudentToAddId(existingStudentOptions[0]?.id || "");
    setAddingStudentToClass(true);
    setCreatingStudent(false);
    setSaveMessage("");
  };

  const handleDailyAttendanceChange = (studentId, value) => {
    setDailyAttendanceDrafts((currentDrafts) => ({
      ...currentDrafts,
      [studentId]: value
    }));
  };

  const handleMonthlyAttendanceChange = (studentId, day, value) => {
    setMonthlyAttendanceDrafts((currentDrafts) => ({
      ...currentDrafts,
      [studentId]: {
        ...(currentDrafts[studentId] || {}),
        [day]: value
      }
    }));
  };

  const openSubjectModal = () => {
    setEditingSubjectName("");
    setSubjectForm({
      code: "",
      name: "",
      classIds: []
    });
    setShowSubjectModal(true);
    setSaveMessage("");
  };
  const openEditSubjectModal = () => {
    const currentSubject = getHandledSubjectRecord(selectedSubjectName);
    const classIds = Object.keys(getSubjectClassMap(selectedSubjectName)).filter((classId) => getSubjectClassMap(selectedSubjectName)[classId]);

    if (!currentSubject) return;

    setEditingSubjectName(getSubjectSelectorValue(currentSubject));
    setSubjectForm({
      code: currentSubject.code || "",
      name: currentSubject.name,
      classIds
    });
    setShowSubjectModal(true);
    setSaveMessage("");
  };
  const closeSubjectModal = () => {
    setShowSubjectModal(false);
    setEditingSubjectName("");
  };

  const openFeeModal = () => {
    setFeeForm({
      name: "",
      amount: "",
      dueDate: "",
      notes: ""
    });
    setShowFeeModal(true);
    setSaveMessage("");
  };

  const openFeeListModal = () => {
    setShowFeeListModal(true);
    setSaveMessage("");
  };

  const openStudentFeeModal = (student) => {
    setActiveStudentFeeTarget(student);
    setSaveMessage("");
  };

  useEffect(() => {
    const availableClassIds = selectedSubjectClasses.map((classroom) => classroom.id);

    if (!availableClassIds.length) {
      setSelectedSubjectClassId("");
      return;
    }

    if (selectedSubjectClassId && !availableClassIds.includes(selectedSubjectClassId)) {
      setSelectedSubjectClassId("");
    }
  }, [selectedSubjectClassId, selectedSubjectClasses]);

  useEffect(() => {
    if (section !== "students") return;
    if (!advisoryClass?.id) return;
    if (selectedClassId === advisoryClass.id) return;

    setSelectedClassId(advisoryClass.id);
  }, [advisoryClass?.id, section, selectedClassId]);

  useEffect(() => {
    if (loading || error) {
      setHeaderActions(null);
      return () => setHeaderActions(null);
    }

    if (section === "students" && teacherClassReports.length > 0) {
      setHeaderActions(
        <div className="table-actions">
          <button type="button" className="primary-btn" onClick={openAddStudentModal}>
            Add Student
          </button>
          <button type="button" className="secondary-btn" onClick={openAddExistingStudentModal}>
            Add Existing
          </button>
        </div>
      );
    } else if (section === "subjects") {
      setHeaderActions(
        <button type="button" className="primary-btn" onClick={openSubjectModal}>
          Add Subject
        </button>
      );
    } else if (section === "gradebook") {
      setHeaderActions(null);
    } else if (section === "fees" && advisoryClass?.id) {
      setHeaderActions(
        <>
          <button type="button" className="secondary-btn" onClick={openFeeListModal}>
            View Fees
          </button>
          <button type="button" className="primary-btn" onClick={openFeeModal}>
            Add Fee
          </button>
        </>
      );
    } else {
      setHeaderActions(null);
    }

    return () => setHeaderActions(null);
  }, [
    error,
    loading,
    section,
    setHeaderActions,
    advisoryClass?.id,
    teacherClassReports,
    handledSubjectSignature
  ]);

  const handleSubjectFormClassToggle = (classId) => {
    setSubjectForm((currentForm) => ({
      ...currentForm,
      classIds: currentForm.classIds.includes(classId)
        ? currentForm.classIds.filter((item) => item !== classId)
        : [...currentForm.classIds, classId]
    }));
  };

  const handleSubjectSubmit = async (event) => {
    event.preventDefault();

    const subjectCode = subjectForm.code.trim().toUpperCase();
    const subjectName = subjectForm.name.trim();
    const isEditingSubject = Boolean(editingSubjectName);

    if (isEditingSubject) {
      const editingSubject = getHandledSubjectRecord(editingSubjectName);

      try {
        const classMap = await saveTeacherSubjectClasses({
          subjectName: editingSubject?.name || subjectForm.name,
          subjectCode: editingSubject?.code || subjectForm.code,
          classIds: subjectForm.classIds,
          subjectNames: handledSubjects
        });
        setSubjectClassOverrides((currentOverrides) => ({
          ...currentOverrides,
          [getSubjectStorageKey(editingSubject || editingSubjectName)]: classMap
        }));
        closeSubjectModal();
        setSaveMessage(`${getSubjectOptionLabel(editingSubject) || editingSubjectName} sections updated.`);
      } catch (saveError) {
        setSaveMessage(saveError?.message || "Subject sections could not be updated.");
      }
      return;
    }

    if (!subjectCode) {
      setSaveMessage("Enter a subject code.");
      return;
    }

    if (!subjectName) {
      setSaveMessage("Enter a subject name.");
      return;
    }

    if (handledSubjects.some((subject) => (
      subject.name.toLowerCase() === subjectName.toLowerCase()
      || (subject.code && subject.code.toLowerCase() === subjectCode.toLowerCase())
    ))) {
      setSaveMessage("That subject code or subject name is already assigned.");
      return;
    }

    try {
      const nextSubjects = [...handledSubjects, { code: subjectCode, name: subjectName }];

      await saveTeacherSubjects(nextSubjects);
      const classMap = await saveTeacherSubjectClasses({
        subjectName,
        subjectCode,
        classIds: subjectForm.classIds,
        subjectNames: nextSubjects
      });
      setSubjectClassOverrides((currentOverrides) => ({
        ...currentOverrides,
        [getSubjectStorageKey({ code: subjectCode, name: subjectName })]: classMap
      }));
      setSelectedSubjectName(getSubjectSelectorValue({ code: subjectCode, name: subjectName }));
      setSubjectScoreDrafts({});
      closeSubjectModal();
      setSaveMessage(`${subjectCode} - ${subjectName} added.`);
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Subject could not be added.");
    }
  };

  const getSubjectScoreDraft = (student) => {
    const savedSubject = getStudentSubjectRecord(student, selectedSubjectName);
    const quarters = QUARTER_OPTIONS.reduce((quarterDrafts, quarter) => ({
      ...quarterDrafts,
      [quarter.key]: getQuarterScores(savedSubject, quarter.key)
    }), {});

    return subjectScoreDrafts[student.id] || {
      quarters,
      q1: savedSubject?.q1 ?? "",
      q2: savedSubject?.q2 ?? "",
      q3: savedSubject?.q3 ?? ""
    };
  };

  const updateSubjectScoreDraft = (studentId, categoryKey, subcategoryKey, value, scoreIndex, quarterKey = selectedScoreQuarter) => {
    const student = allStudents.find((item) => item.id === studentId);
    if (!student) return;
    const currentDraft = {
      ...getSubjectScoreDraft(student),
      ...subjectScoreDrafts[studentId]
    };
    const currentQuarters = {
      ...getSubjectScoreDraft(student).quarters,
      ...(subjectScoreDrafts[studentId]?.quarters || {})
    };
    const values = normalizeScoreArray(currentQuarters[quarterKey]?.[categoryKey]?.[subcategoryKey]);
    const neededLength = scoreIndex + 1;

    while (values.length < neededLength) values.push("");
    values[scoreIndex] = value;

    const nextQuarter = {
      ...createEmptyQuarterScores(),
      ...(currentQuarters[quarterKey] || {}),
      [categoryKey]: {
        ...(createEmptyQuarterScores()[categoryKey] || {}),
        ...(currentQuarters[quarterKey]?.[categoryKey] || {}),
        [subcategoryKey]: values
      }
    };
    const nextQuarters = {
      ...currentQuarters,
      [quarterKey]: nextQuarter
    };
    const nextQuarterGrades = QUARTER_OPTIONS.reduce((grades, quarter) => ({
      ...grades,
      [quarter.key]: calculateQuarterGrade(nextQuarters[quarter.key], gradeWeights) ?? ""
    }), {});

    setSubjectScoreDrafts((currentDrafts) => ({
      ...currentDrafts,
      [studentId]: {
        ...currentDraft,
        ...currentDrafts[studentId],
        ...nextQuarterGrades,
        quarters: nextQuarters
      }
    }));
  };

  const ensureFixedScoreEntries = (values = [], categoryKey) => {
    const nextValues = [...normalizeOptionalScoreArray(values)];
    const slotCount = FIXED_ASSESSMENT_SLOTS[categoryKey] || 0;

    while (nextValues.length < slotCount) nextValues.push("");
    return nextValues.slice(0, slotCount);
  };

  const getQuarterDraft = (draft, quarterKey) => normalizeQuarterScoreShape(draft.quarters?.[quarterKey] || {});

  const updateSubjectScoreEntryDraft = (
    studentId,
    categoryKey,
    subcategoryKey,
    value,
    scoreIndex,
    part,
    quarterKey = selectedScoreQuarter
  ) => {
    const student = allStudents.find((item) => item.id === studentId);
    if (!student) return;

    const currentDraft = {
      ...getSubjectScoreDraft(student),
      ...subjectScoreDrafts[studentId]
    };
    const currentQuarters = {
      ...getSubjectScoreDraft(student).quarters,
      ...(subjectScoreDrafts[studentId]?.quarters || {})
    };
    const currentQuarter = getQuarterDraft({ quarters: currentQuarters }, quarterKey);
    const values = ensureFixedScoreEntries(currentQuarter[categoryKey]?.[subcategoryKey], categoryKey);
    const currentParts = parseScoreParts(values[scoreIndex]);
    const nextScoreValue = part === "score" ? value : currentParts.score;
    const nextTotalValue = part === "total" ? value : currentParts.total;

    values[scoreIndex] = buildScoreEntryValue(nextScoreValue, nextTotalValue);

    const nextQuarter = normalizeQuarterScoreShape({
      ...currentQuarter,
      [categoryKey]: {
        ...(currentQuarter[categoryKey] || {}),
        [subcategoryKey]: values
      }
    });
    const nextQuarters = {
      ...currentQuarters,
      [quarterKey]: nextQuarter
    };
    const nextQuarterGrades = QUARTER_OPTIONS.reduce((grades, quarter) => ({
      ...grades,
      [quarter.key]: calculateQuarterGrade(nextQuarters[quarter.key], gradeWeights) ?? ""
    }), {});

    setSubjectScoreDrafts((currentDrafts) => ({
      ...currentDrafts,
      [studentId]: {
        ...currentDraft,
        ...currentDrafts[studentId],
        ...nextQuarterGrades,
        quarters: nextQuarters
      }
    }));
  };

  const updateAssessmentPossibleTotalDraft = (
    categoryKey,
    subcategoryKey,
    scoreIndex,
    totalValue,
    quarterKey = selectedScoreQuarter
  ) => {
    if (!subjectStudents.length) return;

    setSubjectScoreDrafts((currentDrafts) => subjectStudents.reduce((drafts, student) => {
      const currentDraft = currentDrafts[student.id] || getSubjectScoreDraft(student);
      const currentQuarters = currentDraft.quarters || createDefaultQuarterScores();
      const currentQuarter = getQuarterDraft({ quarters: currentQuarters }, quarterKey);
      const values = ensureFixedScoreEntries(currentQuarter[categoryKey]?.[subcategoryKey], categoryKey);
      const currentParts = parseScoreParts(values[scoreIndex]);

      values[scoreIndex] = buildScoreEntryValue(currentParts.score, totalValue);

      const nextQuarter = normalizeQuarterScoreShape({
        ...currentQuarter,
        [categoryKey]: {
          ...(currentQuarter[categoryKey] || {}),
          [subcategoryKey]: values
        }
      });
      const nextQuarters = {
        ...currentQuarters,
        [quarterKey]: nextQuarter
      };
      const nextQuarterGrades = QUARTER_OPTIONS.reduce((grades, quarter) => ({
        ...grades,
        [quarter.key]: calculateQuarterGrade(nextQuarters[quarter.key], gradeWeights) ?? ""
      }), {});

      return {
        ...drafts,
        [student.id]: {
          ...currentDraft,
          ...nextQuarterGrades,
          quarters: nextQuarters
        }
      };
    }, currentDrafts));
  };

  const deleteSubject = async (subjectName) => {
    try {
      const targetSubject = getHandledSubjectRecord(subjectName);
      if (!targetSubject) {
        setSaveMessage("Subject could not be found.");
        return;
      }
      const nextSubjects = handledSubjects.filter((subject) => !isSameSubjectRecord(subject, targetSubject));

      await saveTeacherSubjects(nextSubjects);
      setSubjectClassOverrides((currentOverrides) => {
        const nextOverrides = { ...currentOverrides };
        delete nextOverrides[getSubjectStorageKey(targetSubject)];
        return nextOverrides;
      });
      setSubjectScoreDrafts({});

      if (selectedSubjectName.toLowerCase() === String(subjectName).toLowerCase()) {
        setSelectedSubjectName(nextSubjects[0] ? getSubjectSelectorValue(nextSubjects[0]) : "");
      }

      setSaveMessage(`${getSubjectOptionLabel(targetSubject) || targetSubject.name} deleted.`);
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Subject could not be deleted.");
    }
  };

  const requestDeleteSubject = (subjectName) => {
    setConfirmState({
      action: "delete-subject",
      tone: "danger",
      title: `Delete ${getSubjectOptionLabel(getHandledSubjectRecord(subjectName)) || subjectName}?`,
      message: "This removes the subject from your handled subjects and clears its selected sections.",
      confirmLabel: "Delete Subject",
      cancelLabel: "Keep Subject",
      subjectName
    });
  };

  const requestDeleteFee = (fee) => {
    setConfirmState({
      action: "delete-fee",
      tone: "danger",
      title: `Delete ${fee.name}?`,
      message: "This will remove the fee from your advisory class.",
      confirmLabel: "Delete Fee",
      cancelLabel: "Keep Fee",
      fee
    });
  };

  const handleToggleFeePayment = async (fee, student) => {
    const paymentRecord = fee?.payments?.[student.id];
    const nextPaid = !paymentRecord?.paid;
    const paymentKey = `${fee.id}-${student.id}`;

    setSavingFeePaymentKey(paymentKey);

    try {
      await saveClassFeePayment({
        classId: advisoryClass?.id,
        feeId: fee.id,
        studentId: student.id,
        paid: nextPaid
      });
      setSaveMessage(`${getStudentDisplayName(student)} marked as ${nextPaid ? "paid" : "unpaid"} for ${fee.name}.`);
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Fee payment could not be updated.");
    } finally {
      setSavingFeePaymentKey("");
    }
  };

  const handleConfirmDecision = async () => {
    const decision = confirmState;
    if (!decision) return;

    if (decision.action === "delete-subject") {
      await deleteSubject(decision.subjectName);
      setConfirmState(null);
      return;
    }

    if (decision.action === "delete-fee") {
      try {
        await deleteClassFee({
          classId: advisoryClass?.id,
          feeId: decision.fee.id
        });
        setSaveMessage(`${decision.fee.name} deleted.`);
      } catch (saveError) {
        setSaveMessage(saveError?.message || "Fee could not be deleted.");
      }
      setConfirmState(null);
      return;
    }

    setConfirmState(null);
  };

  const handleSaveFee = async (event) => {
    event.preventDefault();

    if (!advisoryClass?.id) {
      setSaveMessage("Assign an advisory class before adding fees.");
      return;
    }

    setIsSavingFee(true);

    try {
      await saveClassFee({
        classId: advisoryClass.id,
        payload: feeForm
      });
      setShowFeeModal(false);
      setFeeForm({
        name: "",
        amount: "",
        dueDate: "",
        notes: ""
      });
      setSaveMessage("Fee added.");
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Fee could not be saved.");
    } finally {
      setIsSavingFee(false);
    }
  };

  const formatGradeSheetValue = (value, { decimals = 2, blank = "", trimZeros = false } = {}) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return blank;

    const fixedValue = numericValue.toFixed(decimals);
    if (!trimZeros) return fixedValue;

    return fixedValue
      .replace(/\.00$/, "")
      .replace(/(\.\d)0$/, "$1");
  };

  const getAssessmentColumnHeaderLabel = (column) => {
    if (column.categoryKey === "finalExam") {
      const defaultFinalExamLabels = ["ST1", "ST2", "TE"];
      return defaultFinalExamLabels[column.index] || `EX${column.index + 1}`;
    }

    if (column.categoryKey === "writtenWork") {
      return `${column.index + 1}`;
    }

    if (column.categoryKey === "performanceTask") {
      return `${column.index + 1}`;
    }

    return `${column.index + 1}`;
  };

  const getAssessmentColumnEntry = (draft, quarterKey, column) => {
    const quarterScores = getQuarterDraft(draft, quarterKey);
    const values = ensureFixedScoreEntries(quarterScores[column.categoryKey]?.[column.subcategoryKey], column.categoryKey);
    return values[column.index] || "";
  };

  const summarizeScoreEntries = (values = []) => {
    let earnedTotal = 0;
    let possibleTotal = 0;
    let usedPossibleScores = false;
    const fallbackScores = [];

    values.forEach((value) => {
      const parsedEntry = parseScoreEntry(value);
      if (!parsedEntry) return;

      const earned = toNumber(parsedEntry.scoreValue);
      const total = toNumber(parsedEntry.totalValue);

      if (Number.isFinite(earned) && Number.isFinite(total) && total > 0) {
        earnedTotal += earned;
        possibleTotal += total;
        usedPossibleScores = true;
        return;
      }

      if (Number.isFinite(parsedEntry.numericValue)) {
        fallbackScores.push(parsedEntry.numericValue);
      }
    });

    if (usedPossibleScores) {
      return {
        earnedTotal,
        possibleTotal,
        percentageScore: possibleTotal > 0 ? (earnedTotal / possibleTotal) * 100 : null
      };
    }

    if (fallbackScores.length) {
      const averageScore = fallbackScores.reduce((sum, score) => sum + score, 0) / fallbackScores.length;
      return {
        earnedTotal: averageScore,
        possibleTotal: null,
        percentageScore: averageScore
      };
    }

    return {
      earnedTotal: null,
      possibleTotal: null,
      percentageScore: null
    };
  };

  const getCategorySummary = (draft, quarterKey, categoryKey) => {
    const quarterScores = getQuarterDraft(draft, quarterKey);
    const detailMap = calculateQuarterGradeDetails(quarterScores, gradeWeights).categories
      .reduce((map, category) => ({
        ...map,
        [category.key]: category
      }), {});
    const values = categoryKey === "writtenWork"
      ? ensureFixedScoreEntries(quarterScores.writtenWork?.quizzes, categoryKey)
      : categoryKey === "performanceTask"
        ? ensureFixedScoreEntries(quarterScores.performanceTask?.activities, categoryKey)
        : ensureFixedScoreEntries(quarterScores.finalExam?.exams, categoryKey);
    const scoreSummary = summarizeScoreEntries(values);
    const categoryDetail = detailMap[categoryKey] || {};

    return {
      total: scoreSummary.earnedTotal,
      possibleTotal: scoreSummary.possibleTotal,
      percentageScore: categoryDetail.percentageScore,
      weightedScore: categoryDetail.weightedScore
    };
  };

  const getAssessmentColumnPossibleTotal = (studentsForTable, quarterKey, column) => {
    for (const student of studentsForTable) {
      const draft = getSubjectScoreDraft(student);
      const scoreParts = parseScoreParts(getAssessmentColumnEntry(draft, quarterKey, column));
      const totalValue = toNumber(scoreParts.total);
      if (Number.isFinite(totalValue)) {
        return totalValue;
      }
    }

    return null;
  };

  const getPossibleTotalForColumns = (studentsForTable, quarterKey, columns = []) => {
    const totalValues = columns
      .map((column) => getAssessmentColumnPossibleTotal(studentsForTable, quarterKey, column))
      .filter((value) => Number.isFinite(value));

    if (!totalValues.length) return null;

    return totalValues.reduce((sum, value) => sum + value, 0);
  };

  const getGradebookAccordionKey = (sectionName) => `${selectedSubjectName}::${selectedScoreQuarter}::${sectionName}`;

  const getExpandedGradebookCategory = (sectionName) => (
    expandedGradebookCategories[getGradebookAccordionKey(sectionName)] || "writtenWork"
  );

  const expandGradebookCategory = (sectionName, categoryKey) => {
    setExpandedGradebookCategories((currentCategories) => ({
      ...currentCategories,
      [getGradebookAccordionKey(sectionName)]: categoryKey
    }));
  };

  const renderGradebookSheetControls = () => (
    <div className="gradebook-sheet-shell">
      <div className="gradebook-sheet-toolbar">
        <label className="selector-field gradebook-toolbar-field">
          <span>Term</span>
          <select value={selectedScoreQuarter} onChange={(event) => setSelectedScoreQuarter(event.target.value)}>
            {QUARTER_OPTIONS.map((quarter) => (
              <option key={quarter.key} value={quarter.key}>{quarter.label}</option>
            ))}
          </select>
        </label>
        <label className="selector-field gradebook-toolbar-field">
          <span>Grade and Section</span>
          <select
            value={selectedSubjectClassId}
            onChange={(event) => setSelectedSubjectClassId(event.target.value)}
            disabled={!selectedSubjectClasses.length}
          >
            <option value="">All Sections</option>
            {selectedSubjectClasses.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name || classroom.section || classroom.id}
              </option>
            ))}
          </select>
        </label>
        <label className="selector-field gradebook-toolbar-field">
          <span>Subject</span>
          <select
            value={selectedSubjectName}
            onChange={(event) => {
              setSelectedSubjectName(event.target.value);
              setSelectedSubjectClassId("");
              setSubjectScoreDrafts({});
            }}
          >
            {handledSubjects.map((subject) => (
              <option key={`${subject.code}-${subject.name}`} value={getSubjectSelectorValue(subject)}>
                {getSubjectOptionLabel(subject)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="gradebook-sheet-summary">
        <span className="meta-badge">{selectedSubjectLabel || "Select a subject"}</span>
        <span className="meta-badge">
          {selectedSubjectClassId
            ? selectedSubjectClasses.find((classroom) => classroom.id === selectedSubjectClassId)?.name
              || selectedSubjectClasses.find((classroom) => classroom.id === selectedSubjectClassId)?.section
              || "Selected Section"
            : "All Sections"}
        </span>
        <span className="meta-badge">
          {Object.keys(subjectStudentGroups).length} table{Object.keys(subjectStudentGroups).length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );

  const renderGradebookSection = (sectionName, sectionStudents) => {
    const quarterLabel = QUARTER_OPTIONS.find((quarter) => quarter.key === selectedScoreQuarter)?.label || "Term";
    const teacherDisplayName = userData?.displayName || userData?.name || userData?.email || currentUser?.email || "Teacher";
    const expandedCategoryKey = getExpandedGradebookCategory(sectionName);
    const writtenColumns = FIXED_ASSESSMENT_COLUMNS.filter((column) => column.categoryKey === "writtenWork");
    const performanceColumns = FIXED_ASSESSMENT_COLUMNS.filter((column) => column.categoryKey === "performanceTask");
    const examColumns = FIXED_ASSESSMENT_COLUMNS.filter((column) => column.categoryKey === "finalExam");
    const categoryConfigs = [
      {
        key: "writtenWork",
        label: "Written / Oral Works",
        weightLabel: `${gradeWeights.writtenWork}%`,
        columns: writtenColumns
      },
      {
        key: "performanceTask",
        label: "Product / Performance Tasks",
        weightLabel: `${gradeWeights.performanceTask}%`,
        columns: performanceColumns
      },
      {
        key: "finalExam",
        label: "Summative Tests / Exams",
        weightLabel: `${gradeWeights.finalExam}%`,
        columns: examColumns
      }
    ];
    const totalColumnCount = 1
      + categoryConfigs.reduce((sum, category) => (
        sum + (category.key === expandedCategoryKey ? category.columns.length + 1 : 1)
      ), 0)
      + 3;

    return (
      <div className="score-table-wrap">
        <table className="data-table subject-score-table class-record-table">
          <thead>
            <tr className="class-record-group-row">
              <th rowSpan={2} className="class-record-student-col">LEARNERS&apos; NAMES</th>
              {categoryConfigs.map((category) => {
                const isExpanded = category.key === expandedCategoryKey;
                const groupColumnCount = isExpanded ? category.columns.length + 1 : 1;

                return (
                  <th
                    key={category.key}
                    colSpan={groupColumnCount}
                    className={`class-record-group-cell${isExpanded ? " is-active" : ""}`}
                  >
                    <button
                      type="button"
                      className={`class-record-group-toggle${isExpanded ? " is-expanded" : ""}`}
                      onClick={() => expandGradebookCategory(sectionName, category.key)}
                      aria-expanded={isExpanded}
                    >
                      <span className="class-record-group-copy">
                        <span className="class-record-group-title">{category.label}</span>
                        <span className="class-record-group-weight">{category.weightLabel}</span>
                      </span>
                    </button>
                  </th>
                );
              })}
              <th rowSpan={2} className="class-record-summary-col class-record-summary-grade">
                <span className="class-record-summary-label">Initial Grade</span>
              </th>
              <th rowSpan={2} className="class-record-summary-col class-record-summary-term">
                <span className="class-record-summary-label">Term Grade</span>
              </th>
              <th rowSpan={2} className="class-record-summary-col class-record-summary-descriptor">
                <span className="class-record-summary-label">Descriptor</span>
              </th>
            </tr>
            <tr className="class-record-subheader-row">
              {categoryConfigs.flatMap((category) => {
                const isExpanded = category.key === expandedCategoryKey;

                if (category.key === expandedCategoryKey) {
                  return [
                    ...category.columns.map((column) => (
                      <th
                        key={`${category.key}-${column.subcategoryKey}-${column.index}`}
                        className={`class-record-category-head${isExpanded ? " is-active" : ""}`}
                      >
                        <div className="assessment-column-header">
                          <span>{getAssessmentColumnHeaderLabel(column)}</span>
                        </div>
                      </th>
                    )),
                    <th
                      key={`${category.key}-total`}
                      className={`class-record-category-head class-record-category-total${isExpanded ? " is-active" : ""}`}
                    >
                      Total
                    </th>
                  ];
                }

                return [<th key={`${category.key}-total`} className="class-record-category-total">Total</th>];
              })}
            </tr>
          </thead>
          <tbody>
            <tr className="class-record-reference-row">
              <td data-label="Learners">HIGHEST POSSIBLE SCORE</td>
              {categoryConfigs.flatMap((category) => {
                const categoryPossibleTotal = getPossibleTotalForColumns(subjectStudents, selectedScoreQuarter, category.columns);

                if (category.key === expandedCategoryKey) {
                  return [
                    ...category.columns.map((column) => (
                      <td
                        key={`possible-${category.key}-${column.subcategoryKey}-${column.index}`}
                        data-label={getAssessmentColumnHeaderLabel(column)}
                        className="class-record-category-cell is-active"
                      >
                        <input
                          type="number"
                          value={parseScoreParts(
                            buildScoreEntryValue(
                              "",
                              getAssessmentColumnPossibleTotal(subjectStudents, selectedScoreQuarter, column) ?? ""
                            )
                          ).total}
                          onChange={(event) => updateAssessmentPossibleTotalDraft(
                            column.categoryKey,
                            column.subcategoryKey,
                            column.index,
                            event.target.value,
                            selectedScoreQuarter
                          )}
                          placeholder="0"
                          className="possible-score-input"
                        />
                      </td>
                    )),
                    <td key={`possible-total-${category.key}`} data-label="Total" className="class-record-category-cell is-active">
                      {formatGradeSheetValue(categoryPossibleTotal, { decimals: 0, blank: "" })}
                    </td>
                  ];
                }

                return [
                  <td key={`possible-total-${category.key}`} data-label="Total">
                    {formatGradeSheetValue(categoryPossibleTotal, { decimals: 0, blank: "" })}
                  </td>
                ];
              })}
              <td data-label="Initial Grade" className="class-record-summary-col class-record-summary-grade" />
              <td data-label="Term Grade" className="class-record-summary-col class-record-summary-term" />
              <td data-label="Descriptor" className="class-record-summary-col class-record-summary-descriptor" />
            </tr>
            {sectionStudents.map((student, studentIndex) => {
              const draft = getSubjectScoreDraft(student);
              const quarterScores = getQuarterDraft(draft, selectedScoreQuarter);
              const quarterDetail = calculateQuarterGradeDetails(quarterScores, gradeWeights);

              return (
                <tr key={student.id}>
                  <td data-label="Learners" className="student-score-cell class-record-student-col">
                    <span className="class-record-index">{studentIndex + 1}</span>
                    <div>
                      <strong>{getStudentDisplayName(student)}</strong>
                      <p className="muted-text">{student.studentNumber || "No ID"}</p>
                    </div>
                  </td>
                  {categoryConfigs.flatMap((category) => {
                    const categorySummary = getCategorySummary(draft, selectedScoreQuarter, category.key);

                    if (category.key === expandedCategoryKey) {
                      return [
                        ...category.columns.map((column) => {
                          const scoreParts = parseScoreParts(getAssessmentColumnEntry(draft, selectedScoreQuarter, column));
                          const hasTotalPoints = Boolean(String(scoreParts.total || "").trim());

                          return (
                            <td
                              key={`${student.id}-${column.categoryKey}-${column.subcategoryKey}-${column.index}`}
                              data-label={column.shortLabel}
                              className="class-record-category-cell is-active"
                            >
                              <div className={`score-entry-field${hasTotalPoints ? " has-total" : " is-compact"}`}>
                                <input
                                  type="number"
                                  value={scoreParts.score}
                                  onChange={(event) => updateSubjectScoreEntryDraft(
                                    student.id,
                                    column.categoryKey,
                                    column.subcategoryKey,
                                    event.target.value,
                                    column.index,
                                    "score",
                                    selectedScoreQuarter
                                  )}
                                  placeholder="0"
                                />
                                {hasTotalPoints && <span className="score-total-label">/ {scoreParts.total}</span>}
                              </div>
                            </td>
                          );
                        }),
                        <td key={`${student.id}-${category.key}-total`} data-label="Total" className="class-record-category-cell is-active">
                          {formatGradeSheetValue(categorySummary.total, {
                            decimals: categorySummary.possibleTotal ? 0 : 2,
                            blank: ""
                          })}
                        </td>
                      ];
                    }

                    return [
                      <td key={`${student.id}-${category.key}-total`} data-label="Total">
                        {formatGradeSheetValue(categorySummary.total, {
                          decimals: categorySummary.possibleTotal ? 0 : 2,
                          blank: ""
                        })}
                      </td>
                    ];
                  })}
                  <td data-label="Initial Grade" className="final-score-cell class-record-summary-col class-record-summary-grade">
                    {formatGradeSheetValue(quarterDetail.initialGrade, { decimals: 2, blank: "" })}
                  </td>
                  <td data-label="Term Grade" className="final-score-cell class-record-summary-col class-record-summary-term">
                    {formatGradeSheetValue(quarterDetail.transmutedGrade, { decimals: 0, blank: "" })}
                  </td>
                  <td data-label="Descriptor" className="final-score-cell descriptor-cell class-record-summary-col class-record-summary-descriptor">
                    {quarterDetail.descriptor || ""}
                  </td>
                </tr>
              );
            })}
            {!sectionStudents.length && (
              <tr>
                <td colSpan={totalColumnCount}>No students are enrolled in this section for the selected subject.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const buildSubjectScoresForSave = (student) => {
    const draft = getSubjectScoreDraft(student);
    const quarters = QUARTER_OPTIONS.reduce((quarterScores, quarter) => ({
      ...quarterScores,
      [quarter.key]: {
        ...createEmptyQuarterScores(),
        ...(draft.quarters?.[quarter.key] || {})
      }
    }), {});
    const quarterGrades = QUARTER_OPTIONS.reduce((grades, quarter) => ({
      ...grades,
      [quarter.key]: calculateQuarterGrade(quarters[quarter.key], gradeWeights)
    }), {});

    return {
      ...draft,
      gradeWeights,
      quarters,
      activities: quarters.q1.performanceTask.activities,
      quizzes: quarters.q1.writtenWork.quizzes,
      exams: quarters.q1.finalExam.exams,
      q1: quarterGrades.q1,
      q2: quarterGrades.q2,
      q3: quarterGrades.q3
    };
  };

  const handleSaveAllSubjectScores = async () => {
    if (!selectedSubjectName || !subjectStudents.length) return;

    setSavingAllSubjectScores(true);

    try {
      for (const student of subjectStudents) {
        await saveSubjectScores({
          studentId: student.id,
          subjectName: selectedSubjectRecord?.name || selectedSubjectName,
          subjectCode: selectedSubjectRecord?.code || "",
          scores: buildSubjectScoresForSave(student)
        });
      }

      setSubjectScoreDrafts({});
      setSaveMessage(`${selectedSubjectLabel} scores saved for ${subjectStudents.length} student${subjectStudents.length === 1 ? "" : "s"}.`);
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Subject scores could not be saved.");
    } finally {
      setSavingAllSubjectScores(false);
    }
  };

  const handleAddExistingStudent = async (event) => {
    event.preventDefault();

    if (!studentToAddId) {
      setSaveMessage("Select an existing student to add.");
      return;
    }

    const student = existingStudentOptions.find((item) => item.id === studentToAddId) || null;

    try {
      await addStudentToClass({
        classId: selectedClass?.id,
        studentId: studentToAddId
      });
      setAddingStudentToClass(false);
      setStudentToAddId("");
      setSaveMessage(`${student?.name || "Student"} added to this section.`);
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Student could not be added to this section.");
    }
  };

  const handleMarkAll = (status) => {
    setDailyAttendanceDrafts(students.reduce((drafts, student) => ({
      ...drafts,
      [student.id]: status
    }), {}));
  };

  const handleSaveDailyAttendance = async () => {
    if (!selectedAttendanceSubjectName) {
      setSaveMessage("Select a subject before saving attendance.");
      return;
    }

    await saveDailyAttendanceRecord({
      classId: selectedClass?.id,
      className: selectedClass?.name || selectedClass?.section || "",
      subjectName: selectedAttendanceSubjectRecord?.name || selectedAttendanceSubjectName,
      subjectCode: selectedAttendanceSubjectRecord?.code || "",
      date: attendanceDate,
      isNoClass: effectiveIsNoClassDay,
      noClassReason: effectiveNoClassReason,
      entries: students.map((student) => ({
        studentId: student.id,
        studentName: student.name,
        status: dailyAttendanceDrafts[student.id] || "present"
      }))
    });

    setSaveMessage(effectiveIsNoClassDay
      ? `${selectedAttendanceSubjectLabel} marked as no class on ${formatDateLabel(attendanceDate)}.`
      : `${selectedAttendanceSubjectLabel} attendance saved for ${formatDateLabel(attendanceDate)}.`);
  };

  const handleSaveStudent = async (formData) => {
    const now = new Date().toISOString();
    const summaryParts = [];

    if (formData.gpa !== "") summaryParts.push(`GPA ${formData.gpa}`);
    if (formData.attendance !== "") summaryParts.push(`Attendance ${formData.attendance}%`);

    const activityEntry = {
      date: formatShortDate(now),
      activity: "Teacher Update",
      result: summaryParts.length ? summaryParts.join(" | ") : "Student record updated",
      remarks: formData.teacherRemarks || formData.performanceStatus
    };

    await saveStudentRecord({
      studentId: managingStudent?.id || null,
      payload: {
        ...formData,
        classId: advisoryClass?.id || selectedClass?.id,
        gradeLevel: advisoryClass?.gradeLevel || selectedClass?.gradeLevel || formData.gradeLevel,
        teacherId: advisoryClass?.teacherId || advisoryClass?.teacherUid || selectedClass?.teacherId || selectedClass?.teacherUid || "",
        teacherEmail: advisoryClass?.teacherEmail || advisoryClass?.adviserEmail || selectedClass?.teacherEmail || selectedClass?.adviserEmail || "",
        teacherName: classTeacherName,
        subjects: formData.subjects || [],
        activities: [activityEntry, ...(Array.isArray(managingStudent?.raw?.activities)
          ? managingStudent.raw.activities
          : Object.values(managingStudent?.raw?.activities || {}))].slice(0, 6)
      }
    });

    setManagingStudent(null);
    setCreatingStudent(false);
    setSaveMessage(managingStudent?.id ? "Student record updated." : "Student added to advisory section.");
  };

  const renderClassSelector = () => (
    <div className="toolbar">
      <div>
        <h3>{sectionMeta[section] || "Teaching Dashboard"}</h3>
      </div>
    </div>
  );

  const renderSubjectSelectorControls = ({ includeTermSelector = false } = {}) => (
    <div className="subject-filter-row">
      <label className="selector-field">
        <span>Subject</span>
        <select
          value={selectedSubjectName}
          onChange={(event) => {
            setSelectedSubjectName(event.target.value);
            setSelectedSubjectClassId("");
            setSubjectScoreDrafts({});
          }}
        >
          {handledSubjects.map((subject) => (
            <option key={`${subject.code}-${subject.name}`} value={getSubjectSelectorValue(subject)}>
              {getSubjectOptionLabel(subject)}
            </option>
          ))}
        </select>
      </label>
      <label className="selector-field">
        <span>Section</span>
        <select
          value={selectedSubjectClassId}
          onChange={(event) => setSelectedSubjectClassId(event.target.value)}
          disabled={!selectedSubjectClasses.length}
        >
          <option value="">All Sections</option>
          {selectedSubjectClasses.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classroom.name || classroom.section || classroom.id}
            </option>
          ))}
        </select>
      </label>
      {includeTermSelector && (
        <label className="selector-field">
          <span>Term</span>
          <select value={selectedScoreQuarter} onChange={(event) => setSelectedScoreQuarter(event.target.value)}>
            {QUARTER_OPTIONS.map((quarter) => (
              <option key={quarter.key} value={quarter.key}>{quarter.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );

  const renderSubjectManager = () => (
    <>
      {handledSubjects.length > 0 ? (
        <div className="panel">
          <div className="subject-workspace-shell">
            {renderSubjectSelectorControls()}

            <div className="subject-action-row">
              {selectedSubjectName && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={openEditSubjectModal}
                >
                  Edit Sections
                </button>
              )}
              {selectedSubjectName && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => navigate("/dashboard/gradebook", { state: { selectedSubjectName } })}
                >
                  Open Grade Input
                </button>
              )}
              {selectedSubjectName && (
                <button
                  type="button"
                  className="text-btn"
                  disabled={savingTeacherId === currentUser?.uid}
                  onClick={() => requestDeleteSubject(selectedSubjectName)}
                >
                  Delete Subject
                </button>
              )}
            </div>
          </div>

          {selectedSubjectName ? (
            <div className="subject-section-panel">
              <div className="panel-header">
                <h4>{selectedSubjectLabel}</h4>
                <span className="meta-badge">{selectedSubjectClasses.length} section{selectedSubjectClasses.length === 1 ? "" : "s"}</span>
              </div>
              {selectedSubjectClasses.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Section</th>
                      <th>Grade Level</th>
                      <th>Students</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSubjectClasses.map((classroom) => (
                      <tr key={classroom.id}>
                        <td data-label="Section">{classroom.name || classroom.section || classroom.id}</td>
                        <td data-label="Grade Level">{classroom.gradeLevel || "N/A"}</td>
                        <td data-label="Students">{classroom.students?.length ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty-copy">Assign one or more sections to this subject to begin using it.</p>
              )}
            </div>
          ) : (
            <p className="empty-copy">Select a handled subject to manage its assigned sections.</p>
          )}
        </div>
      ) : (
        <div className="panel">
          <h3>Subject Manager</h3>
          <p className="empty-copy">Add a subject first, then assign one or more sections to it.</p>
        </div>
      )}
    </>
  );

  const renderGradebook = () => (
    <>
      {handledSubjects.length > 0 ? (
        <div className="panel">
          {renderGradebookSheetControls()}

          <div className="subject-workspace-shell">
            <div className="subject-action-row">
              {selectedSubjectName && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={openEditSubjectModal}
                >
                  Edit Sections
                </button>
              )}
              {selectedSubjectName && subjectStudents.length > 0 && (
                <>
                  <button
                    type="button"
                    className="primary-btn score-save-all-btn"
                    disabled={savingAllSubjectScores}
                    onClick={handleSaveAllSubjectScores}
                  >
                    {savingAllSubjectScores ? "Saving..." : "Save Scores"}
                  </button>
                </>
              )}
              {selectedSubjectName && (
                <button
                  type="button"
                  className="text-btn"
                  disabled={savingTeacherId === currentUser?.uid}
                  onClick={() => requestDeleteSubject(selectedSubjectName)}
                >
                  Delete Subject
                </button>
              )}
            </div>
          </div>

          {selectedSubjectName && Object.entries(subjectStudentGroups).map(([sectionName, sectionStudents]) => (
            <div key={sectionName} className="subject-section-panel">
              {renderGradebookSection(sectionName, sectionStudents)}
            </div>
          ))}

          {selectedSubjectName && !subjectStudents.length && (
            <p className="empty-copy">Choose one or more sections for this subject to show enrolled students.</p>
          )}
          {selectedSubjectName && selectedSubjectClassId && !visibleSubjectStudents.length && (
            <p className="empty-copy">No students are enrolled in the selected section for this subject.</p>
          )}
        </div>
      ) : (
        <div className="panel">
          <h3>Input Grades</h3>
          <p className="empty-copy">Add a subject first, then assign one or more sections to it.</p>
        </div>
      )}
    </>
  );

  const renderAddExistingStudentModal = () => (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="panel-header">
          <h3>Add Student to Section</h3>
          <span className="meta-badge">{selectedClass?.name || selectedClass?.section || "Section"}</span>
        </div>
        <form onSubmit={handleAddExistingStudent}>
          {existingStudentOptions.length ? (
            <div className="modal-form-grid">
              <div className="form-group form-group-full">
                <label>Existing Student</label>
                <select
                  value={studentToAddId}
                  onChange={(event) => setStudentToAddId(event.target.value)}
                  required
                >
                  {existingStudentOptions.map((student) => (
                    <option key={student.id} value={student.id}>
                      {getStudentDisplayName(student)} {student.studentNumber ? `(${student.studentNumber})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <p className="empty-copy">No unassigned existing students match this section grade level.</p>
          )}

          <div className="modal-actions">
            <button type="submit" className="primary-btn" disabled={!existingStudentOptions.length || Boolean(savingEnrollmentStudentId)}>
              {savingEnrollmentStudentId ? "Adding..." : "Add to Section"}
            </button>
            <button type="button" className="secondary-btn" onClick={() => setAddingStudentToClass(false)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (loading) return <div className="loading-container">Loading dashboard...</div>;

  return (
    <div className="teacher-view">
      {error && <div className="error-container">{error}</div>}
      {saveMessage && <div className="feedback-toast success-banner">{saveMessage}</div>}

      {section !== "subjects" && section !== "gradebook" && section !== "attendance" && section !== "students" && section !== "fees" && !isDashboardSection && renderClassSelector()}

      {["students", "fees"].includes(section) && !sectionClassReports.length && (
        <div className="empty-state">
          <h3>No Advisory</h3>
          <p>Wait for an admin to assign your advisory section.</p>
        </div>
      )}

      {section === "subjects" && renderSubjectManager()}
      {section === "gradebook" && renderGradebook()}

      {canRenderTeacherWorkspace && (
        <>

      {isDashboardSection && (
        <div className="stats-grid">
          <button
            type="button"
            className="stat-card stat-card-button"
            onClick={() => navigate(advisoryClass ? "/dashboard/students" : "/dashboard/subjects")}
          >
            <h4>{advisoryClass ? "Advisory Class" : "Handled Subjects"}</h4>
            <p>{advisoryClass?.section || advisoryClass?.name || handledSubjects.length || "N/A"}</p>
            <span className="stat-card-note">
              {advisoryClass?.gradeLevel || `${dashboardSectionCount} linked section${dashboardSectionCount === 1 ? "" : "s"}`}
            </span>
          </button>
          <button
            type="button"
            className="stat-card stat-card-button"
            onClick={() => navigate("/dashboard/attendance")}
          >
            <h4>Attendance Average</h4>
            <p>{dashboardAttendanceAverage}</p>
          </button>
          <button
            type="button"
            className="stat-card stat-card-button"
            onClick={() => navigate(advisoryClass ? "/dashboard/students" : "/dashboard/subjects")}
          >
            <h4>{advisoryClass ? "Students in Section" : "Subject Students"}</h4>
            <p>{dashboardStudentCount}</p>
          </button>
        </div>
      )}

      {isDashboardSection && (
        <>
          <div className="dashboard-overview-grid">
            <div className="dashboard-main-column">
              <div className="panel">
                <div className="panel-header">
                  <h3>Subject Students</h3>
                  <span className="meta-badge">{totalHandledSubjectStudents} total</span>
                </div>
                {handledSubjectPieSegments.length ? (
                  <div className="subject-pie-panel">
                    <div className="subject-pie-chart-wrap" aria-hidden="true">
                      <svg viewBox="0 0 42 42" className="subject-pie-chart">
                        <circle className="subject-pie-track" cx="21" cy="21" r="15.9155" />
                        {handledSubjectPieSegments.map((segment) => (
                          <circle
                            key={segment.subjectName}
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
                      {handledSubjectSummaries.map((item) => (
                        <li key={item.subjectName} className="subject-pie-legend-item">
                          <span className="subject-pie-swatch" style={{ backgroundColor: item.color }} />
                          <div>
                            <strong>{item.subjectLabel}</strong>
                            <p>{item.studentCount} student{item.studentCount === 1 ? "" : "s"}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="empty-copy">Assign sections to your subjects to see student distribution.</p>
                )}
              </div>

              <div className="panel handled-subject-list-panel">
                <div className="panel-header">
                  <h3>Subjects</h3>
                  <span className="meta-badge">{handledSubjectSummaries.length} total</span>
                </div>
                {handledSubjectSummaries.length ? (
                  <div className="handled-subject-list">
                    {handledSubjectSummaries.map((item) => (
                      <button
                        key={item.subjectName}
                        type="button"
                        className="handled-subject-item"
                        onClick={() => navigate("/dashboard/subjects", { state: { selectedSubjectName: item.subjectValue } })}
                      >
                        <span className="handled-subject-accent" style={{ backgroundColor: item.color }} />
                        <div className="handled-subject-copy">
                          <strong>{item.subjectLabel}</strong>
                          <p>{item.studentCount} students | {item.sectionCount} sections</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">No handled subjects assigned yet.</p>
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
            </div>
          </div>

        </>
      )}

      {section === "students" && (
        <>
          <div className="panel hero-panel">
            <div className="panel-header">
              <div>
                <h3>{advisoryClass?.gradeLevel || "Grade"} - {advisoryClass?.section || advisoryClass?.name || "Advisory Class"}</h3>
                <p className="muted-text">Advisory Class</p>
              </div>
            </div>
          </div>

          <div className="panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Student Number</th>
                  <th>Email</th>
                  <th>Attendance</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td data-label="Name">{getStudentDisplayName(student)}</td>
                    <td data-label="Student Number">{student.studentNumber || "N/A"}</td>
                    <td data-label="Email">{student.email || "N/A"}</td>
                    <td data-label="Attendance">{student.attendanceLabel}</td>
                    <td data-label="Action">
                      <button className="secondary-btn" type="button" onClick={() => openStudentModal(student)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td colSpan="5">No students found for this section.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {section === "fees" && (
        <>
          <div className="panel hero-panel">
            <div className="panel-header">
              <div>
                <h3>{advisoryClass?.section || advisoryClass?.name || "Advisory Class"}</h3>
                <p className="muted-text">{advisoryClass?.gradeLevel || "No advisory class assigned"}</p>
              </div>
              <span className="meta-badge">{advisoryFees.length} fee{advisoryFees.length === 1 ? "" : "s"}</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Student Fee Status</h3>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Student Number</th>
                  <th>Paid Fees</th>
                  <th>Unpaid Fees</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {studentFeeRows.map((student) => (
                  <tr key={student.id}>
                    <td data-label="Student">{getStudentDisplayName(student)}</td>
                    <td data-label="Student Number">{student.studentNumber || "N/A"}</td>
                    <td data-label="Paid Fees">{student.paidCount}/{student.totalFees}</td>
                    <td data-label="Unpaid Fees">{student.unpaidCount}</td>
                    <td data-label="Action">
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => openStudentFeeModal(student)}
                      >
                        Pay Fee
                      </button>
                    </td>
                  </tr>
                ))}
                {!studentFeeRows.length && (
                  <tr>
                    <td colSpan="5">No students found in this advisory class yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {section === "attendance" && (
        <>
          {attendanceSubjectOptions.length ? (
            <div className="panel attendance-sheet">
              <div className="panel-header">
                <div>
                  <h3>{formatDateLabel(attendanceDate)}</h3>
                  <p className="muted-text">
                    Daily Attendance Sheet {selectedAttendanceSubjectName ? `- ${selectedAttendanceSubjectLabel}` : ""}{selectedClass ? ` - ${selectedClass?.name || selectedClass?.section || "Selected Section"}` : ""}
                  </p>
                </div>
                <span className="meta-badge">{students.length} students</span>
              </div>

              <div className="attendance-workspace-shell">
              <div className="attendance-sheet-toolbar">
                <label className="selector-field attendance-toolbar-field">
                  <span>Subject</span>
                  <select
                    value={selectedAttendanceSubjectName}
                  onChange={(event) => setSelectedAttendanceSubjectName(event.target.value)}
                  >
                    {attendanceSubjectOptions.map((subject) => (
                      <option key={`${subject.code}-${subject.name}`} value={getSubjectSelectorValue(subject)}>
                        {getSubjectOptionLabel(subject)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="selector-field attendance-toolbar-field">
                  <span>Section</span>
                  <select
                    value={selectedClass?.id || ""}
                    onChange={(event) => setSelectedClassId(event.target.value)}
                    disabled={!attendanceVisibleClassReports.length}
                  >
                    {attendanceVisibleClassReports.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.name || classroom.section || classroom.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="selector-field attendance-toolbar-field attendance-toolbar-date">
                  <span>Date</span>
                  <input
                    type="date"
                    value={attendanceDate}
                    onChange={(event) => setAttendanceDate(event.target.value)}
                  />
                </label>
              </div>

              <div className="attendance-day-panel">
                <div className="attendance-sheet-toolbar">
                  <label className="attendance-toggle">
                    <input
                      type="checkbox"
                      checked={effectiveIsNoClassDay}
                      onChange={(event) => setIsNoClassDay(event.target.checked)}
                    />
                    <span>Mark as No Class</span>
                  </label>
                  {effectiveIsNoClassDay && (
                    <label className="selector-field attendance-toolbar-field">
                      <span>Reason</span>
                      <input
                        type="text"
                        value={effectiveNoClassReason}
                        onChange={(event) => setNoClassReason(event.target.value)}
                        placeholder="Holiday, suspended classes, event"
                      />
                    </label>
                  )}
                  {attendanceVisibleClassReports.length > 0 && (
                    <button
                      type="button"
                      className="secondary-btn attendance-save-btn"
                      onClick={() => setShowAttendanceReport(true)}
                    >
                      View Report
                    </button>
                  )}
                </div>

              </div>

              {attendanceVisibleClassReports.length ? (
                <>
                  {!effectiveIsNoClassDay && (
                    <div className="score-table-wrap">
                      <table className="data-table daily-attendance-table">
                        <thead>
                          <tr>
                            <th>No.</th>
                            <th>Student Name</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.map((student, index) => (
                            <tr key={student.id}>
                              <td data-label="No.">{index + 1}</td>
                              <td data-label="Student Name" className="monthly-student-name">
                                <strong>{getStudentDisplayName(student)}</strong>
                              </td>
                              <td data-label="Status">
                                <select
                                  className="attendance-status-select"
                                  value={dailyAttendanceDrafts[student.id] || "present"}
                                  onChange={(event) => handleDailyAttendanceChange(student.id, event.target.value)}
                                >
                                  {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                          {students.length === 0 && (
                            <tr>
                              <td colSpan="3">No students found for this section.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <button
                    type="button"
                    className="primary-btn attendance-save-btn"
                    onClick={handleSaveDailyAttendance}
                  >
                    Save
                  </button>
                </>
              ) : (
                <p className="empty-copy">Assign at least one section to this subject to start checking attendance.</p>
              )}
              </div>
            </div>
          ) : (
            <div className="panel">
              <div className="panel-header">
                <h3>Daily Attendance Sheet</h3>
              </div>
              <p className="empty-copy">Add a subject first, then assign one or more sections to it.</p>
            </div>
          )}

        </>
      )}

      {showAttendanceReport && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="panel-header">
              <div>
                <h3>Attendance Report</h3>
                <p className="muted-text">
                  {selectedAttendanceSubjectLabel || "Subject"}{selectedClass ? ` - ${selectedClass.name || selectedClass.section || "Section"}` : ""}
                </p>
              </div>
              <span className="meta-badge">{attendanceReportRows.length} student{attendanceReportRows.length === 1 ? "" : "s"}</span>
            </div>

            {attendanceReportRows.length ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Present</th>
                    <th>Absents</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceReportRows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Student">{row.studentName}</td>
                      <td data-label="Present">{row.present}</td>
                      <td data-label="Absents">{row.absent}</td>
                      <td data-label="Total">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-copy">No attendance records saved yet for this subject section.</p>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowAttendanceReport(false)}>
                Close
              </button>
            </div>
          </div>
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
                        <strong>{getStudentDisplayName(student)}</strong>
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
                    <td data-label="Student">{getStudentDisplayName(student)}</td>
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

      {addingStudentToClass && renderAddExistingStudentModal()}

      {showFeeListModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="panel-header">
              <div>
                <h3>Fee List</h3>
                <p className="muted-text">{advisoryClass?.section || advisoryClass?.name || "Advisory Class"}</p>
              </div>
              <span className="meta-badge">{advisoryFees.length} fee{advisoryFees.length === 1 ? "" : "s"}</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fee</th>
                  <th>Amount</th>
                  <th>Due Date</th>
                  <th>Paid</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {advisoryFees.map((fee) => (
                  <tr key={fee.id}>
                    <td data-label="Fee">{fee.name || "N/A"}</td>
                    <td data-label="Amount">{formatCurrency(fee.amount)}</td>
                    <td data-label="Due Date">{fee.dueDate ? formatDateLabel(fee.dueDate) : "N/A"}</td>
                    <td data-label="Paid">{fee.paidCount}/{fee.totalStudents}</td>
                    <td data-label="Notes">{fee.notes || "N/A"}</td>
                    <td data-label="Action">
                      <button
                        type="button"
                        className="secondary-btn danger-btn"
                        onClick={() => requestDeleteFee(fee)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!advisoryFees.length && (
                  <tr>
                    <td colSpan="6">No fees added for this advisory class yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowFeeListModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {currentActiveStudentFeeTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="panel-header">
              <div>
                <h3>{getStudentDisplayName(currentActiveStudentFeeTarget)} Fees</h3>
                <p className="muted-text">{currentActiveStudentFeeTarget.studentNumber || "No student number"}</p>
              </div>
              <span className="meta-badge">
                {advisoryFees.filter((fee) => fee?.payments?.[currentActiveStudentFeeTarget.id]?.paid).length}/{advisoryFees.length} paid
              </span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fee</th>
                  <th>Amount</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Paid At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {advisoryFees.map((fee) => {
                  const paymentRecord = fee?.payments?.[currentActiveStudentFeeTarget.id];
                  const isPaid = Boolean(paymentRecord?.paid);
                  const paymentKey = `${fee.id}-${currentActiveStudentFeeTarget.id}`;

                  return (
                    <tr key={fee.id}>
                      <td data-label="Fee">{fee.name || "N/A"}</td>
                      <td data-label="Amount">{formatCurrency(fee.amount)}</td>
                      <td data-label="Due Date">{fee.dueDate ? formatDateLabel(fee.dueDate) : "N/A"}</td>
                      <td data-label="Status">
                        <span className={`status-pill ${isPaid ? "on-track" : "needs-support"}`}>
                          {isPaid ? "Paid" : "Unpaid"}
                        </span>
                      </td>
                      <td data-label="Paid At">{paymentRecord?.paidAt ? formatShortDate(paymentRecord.paidAt) : "N/A"}</td>
                      <td data-label="Action">
                        <button
                          type="button"
                          className={`secondary-btn${isPaid ? " danger-btn" : ""}`}
                          disabled={savingFeePaymentKey === paymentKey}
                          onClick={() => handleToggleFeePayment(fee, currentActiveStudentFeeTarget)}
                        >
                          {savingFeePaymentKey === paymentKey ? "Saving..." : isPaid ? "Mark Unpaid" : "Mark Paid"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!advisoryFees.length && (
                  <tr>
                    <td colSpan="6">No fees added for this advisory class yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setActiveStudentFeeTarget(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showFeeModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="panel-header">
              <h3>Add Fee</h3>
              <span className="meta-badge">{advisoryClass?.section || advisoryClass?.name || "Advisory Class"}</span>
            </div>
            <form onSubmit={handleSaveFee}>
              <div className="modal-form-grid">
                <div className="form-group">
                  <label>Fee Name</label>
                  <input
                    type="text"
                    value={feeForm.name}
                    onChange={(event) => setFeeForm((currentForm) => ({ ...currentForm, name: event.target.value }))}
                    placeholder="Example: PTA Contribution"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Amount</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={feeForm.amount}
                    onChange={(event) => setFeeForm((currentForm) => ({ ...currentForm, amount: event.target.value }))}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={feeForm.dueDate}
                    onChange={(event) => setFeeForm((currentForm) => ({ ...currentForm, dueDate: event.target.value }))}
                  />
                </div>
                <div className="form-group form-group-full">
                  <label>Notes</label>
                  <textarea
                    rows="3"
                    value={feeForm.notes}
                    onChange={(event) => setFeeForm((currentForm) => ({ ...currentForm, notes: event.target.value }))}
                    placeholder="Optional details for the advisory class"
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="submit" className="primary-btn" disabled={isSavingFee}>
                  {isSavingFee ? "Saving..." : "Save Fee"}
                </button>
                <button type="button" className="secondary-btn" onClick={() => setShowFeeModal(false)} disabled={isSavingFee}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSubjectModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="panel-header">
              <h3>{editingSubjectName ? "Edit Subject Sections" : "Add Subject"}</h3>
            </div>
            <form onSubmit={handleSubjectSubmit}>
              <div className="form-group">
                <label>Subject Code</label>
                <input
                  type="text"
                  value={subjectForm.code}
                  onChange={(event) => setSubjectForm({ ...subjectForm, code: event.target.value.toUpperCase() })}
                  placeholder="Example: FIL7"
                  required
                  readOnly={Boolean(editingSubjectName)}
                />
              </div>

              <div className="form-group">
                <label>Subject Name</label>
                <input
                  type="text"
                  value={subjectForm.name}
                  onChange={(event) => setSubjectForm({ ...subjectForm, name: event.target.value })}
                  placeholder="Example: Filipino"
                  required
                  readOnly={Boolean(editingSubjectName)}
                />
              </div>

              <div className="subject-class-selector">
                <div className="panel-header">
                  <h4>Sections Taking This Subject</h4>
                  <span className="meta-badge">{subjectForm.classIds.length} selected</span>
                </div>
                <div className="class-checkbox-grid">
                  {classReports.map((classroom) => (
                    <label key={classroom.id} className="class-checkbox">
                      <input
                        type="checkbox"
                        checked={subjectForm.classIds.includes(classroom.id)}
                        onChange={() => handleSubjectFormClassToggle(classroom.id)}
                      />
                      <span>{classroom.name || classroom.section || classroom.id}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" className="primary-btn" disabled={savingTeacherId === currentUser?.uid}>
                  {savingTeacherId === currentUser?.uid ? "Saving..." : editingSubjectName ? "Save Sections" : "Add Subject"}
                </button>
                <button type="button" className="secondary-btn" onClick={closeSubjectModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {managingStudent && (
        <StudentRecordModal
          title={`Edit Student: ${managingStudent.name}`}
          student={managingStudent}
          gradeLevelOptions={gradeLevels}
          defaultClassId={selectedClass?.id || ""}
          defaultTeacherId={selectedClass?.teacherId || selectedClass?.teacherUid || ""}
          defaultTeacherName={classTeacherName}
          defaultGradeLevel={selectedClass?.gradeLevel || ""}
          requireAccountFields={false}
          saving={Boolean(savingStudentId)}
          submitLabel="Save Changes"
          onClose={() => setManagingStudent(null)}
          onSubmit={handleSaveStudent}
        />
      )}
      {creatingStudent && (
        <StudentRecordModal
          title="Add Student"
          student={null}
          gradeLevelOptions={gradeLevels}
          defaultClassId={advisoryClass?.id || selectedClass?.id || ""}
          defaultTeacherId={advisoryClass?.teacherId || advisoryClass?.teacherUid || selectedClass?.teacherId || selectedClass?.teacherUid || ""}
          defaultTeacherName={classTeacherName}
          defaultGradeLevel={advisoryClass?.gradeLevel || selectedClass?.gradeLevel || ""}
          accountFieldsOnly
          showAcademicFields={false}
          saving={Boolean(savingStudentId)}
          submitLabel="Add Student"
          onClose={() => setCreatingStudent(false)}
          onSubmit={handleSaveStudent}
        />
      )}
      {confirmState && (
        <ConfirmDialog
          tone={confirmState.tone}
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          busy={savingTeacherId === currentUser?.uid}
          onConfirm={handleConfirmDecision}
          onCancel={() => setConfirmState(null)}
        />
      )}
        </>
      )}
    </div>
  );
};

export default TeacherView;
