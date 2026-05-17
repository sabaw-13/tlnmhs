import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolData } from "../context/SchoolDataContext";
import { formatShortDate } from "../utils/reporting";
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
const QUARTER_OPTIONS = [
  { key: "q1", label: "Quarter 1" },
  { key: "q2", label: "Quarter 2" },
  { key: "q3", label: "Quarter 3" },
  { key: "q4", label: "Quarter 4" }
];
const DEFAULT_GRADE_WEIGHTS = {
  writtenWork: 30,
  performanceTask: 50,
  finalExam: 20
};
const ASSESSMENT_CATEGORIES = [
  { key: "writtenWork", label: "Written Work" },
  { key: "performanceTask", label: "Performance Task" },
  { key: "finalExam", label: "Final Exam" }
];
const ASSESSMENT_SUBCATEGORIES = {
  writtenWork: [
    { key: "quizzes", label: "Quiz" },
    { key: "longTests", label: "Long Test" }
  ],
  performanceTask: [
    { key: "projects", label: "Project" },
    { key: "activities", label: "Activity" }
  ],
  finalExam: [
    { key: "exams", label: "Final Exam" }
  ]
};
const createEmptyQuarterScores = () => ({
  writtenWork: {
    quizzes: [],
    longTests: []
  },
  performanceTask: {
    projects: [],
    activities: []
  },
  finalExam: {
    exams: []
  }
});
const createDefaultQuarterScores = () => QUARTER_OPTIONS.reduce((quarters, quarter) => ({
  ...quarters,
  [quarter.key]: createEmptyQuarterScores()
}), {});
const normalizeWeightValue = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Math.max(0, parsedValue) : 0;
};
const averageScores = (values = []) => {
  const scores = normalizeScoreArray(values)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (!scores.length) return null;

  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
};
const getCategoryAverage = (quarterScores = {}, categoryKey) => {
  if (categoryKey === "finalExam") {
    return averageScores(quarterScores.finalExam?.exams);
  }

  const subcategoryScores = ASSESSMENT_SUBCATEGORIES[categoryKey]
    .flatMap((subcategory) => normalizeScoreArray(quarterScores[categoryKey]?.[subcategory.key]));

  return averageScores(subcategoryScores);
};
const calculateQuarterGrade = (quarterScores = {}, weights = DEFAULT_GRADE_WEIGHTS) => {
  const weightedScores = ASSESSMENT_CATEGORIES
    .map((category) => {
      const categoryAverage = getCategoryAverage(quarterScores, category.key);
      const weight = normalizeWeightValue(weights[category.key]);

      return Number.isFinite(categoryAverage) && weight > 0
        ? { score: categoryAverage, weight }
        : null;
    })
    .filter(Boolean);

  const totalWeight = weightedScores.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return null;

  const grade = weightedScores.reduce((sum, item) => sum + (item.score * item.weight), 0) / totalWeight;
  return Number(grade.toFixed(1));
};

const getLocalDateValue = () => {
  const date = new Date();
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
};

const getLocalMonthValue = () => getLocalDateValue().slice(0, 7);

const getDaysInMonth = (monthValue) => {
  const [year, month] = String(monthValue || "").split("-").map(Number);
  if (!year || !month) return 31;

  return new Date(year, month, 0).getDate();
};

const buildMonthDateValue = (monthValue, day) => `${monthValue}-${String(day).padStart(2, "0")}`;

const formatDateLabel = (dateValue) => {
  if (!dateValue) return "Selected date";

  return formatShortDate(`${dateValue}T00:00:00`);
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

const normalizeScoreArray = (value) => {
  if (Array.isArray(value)) return value.map((score) => (score ?? "")).map(String);
  if (value === null || value === undefined || value === "") return [""];
  return [String(value)];
};
const normalizeOptionalScoreArray = (value) => {
  if (value === null || value === undefined || value === "") return [];
  return normalizeScoreArray(value);
};

const hasScoreValue = (value) => String(value ?? "").trim() !== "";

const TeacherView = ({ section = "overview" }) => {
  const { userData, currentUser } = useAuth();
  const {
    error,
    loading,
    savingStudentId,
    savingTeacherId,
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
    saveSubjectScores
  } = useSchoolData();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [managingStudent, setManagingStudent] = useState(null);
  const [addingStudentToClass, setAddingStudentToClass] = useState(false);
  const [studentToAddId, setStudentToAddId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(getLocalDateValue);
  const [attendanceMonth, setAttendanceMonth] = useState(getLocalMonthValue);
  const [dailyAttendanceDrafts, setDailyAttendanceDrafts] = useState({});
  const [monthlyAttendanceDrafts, setMonthlyAttendanceDrafts] = useState({});
  const [savingMonthlyAttendance, setSavingMonthlyAttendance] = useState(false);
  const [isNoClassDay, setIsNoClassDay] = useState(false);
  const [noClassReason, setNoClassReason] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [subjectForm, setSubjectForm] = useState({
    name: "",
    classIds: []
  });
  const [subjectClassOverrides, setSubjectClassOverrides] = useState({});
  const [selectedSubjectName, setSelectedSubjectName] = useState("");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectScoreDrafts, setSubjectScoreDrafts] = useState({});
  const [confirmState, setConfirmState] = useState(null);
  const [savingAllSubjectScores, setSavingAllSubjectScores] = useState(false);
  const [selectedScoreQuarter, setSelectedScoreQuarter] = useState("q1");
  const [assessmentCategory, setAssessmentCategory] = useState("writtenWork");
  const [assessmentSubcategory, setAssessmentSubcategory] = useState("quizzes");
  const [gradeWeights, setGradeWeights] = useState(DEFAULT_GRADE_WEIGHTS);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [showFormulaModal, setShowFormulaModal] = useState(false);

  const teacherProfile = teacherUsers.find((teacher) => teacher.id === currentUser?.uid) || null;
  const handledSubjects = teacherProfile?.subjects || [];
  const getSubjectClassMap = (subjectName) => {
    const subjectKey = buildSubjectKey(subjectName);

    return subjectClassOverrides[subjectKey]
      || teacherProfile?.subjectClassIds?.[subjectKey]
      || {};
  };
  const subjectAssignedClassIds = new Set(handledSubjects.flatMap((subject) => (
    Object.entries(getSubjectClassMap(subject))
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
  const sectionClassReports = section === "attendance" ? attendanceClassReports : teacherClassReports;
  const selectedClass = sectionClassReports.find((classroom) => classroom.id === selectedClassId) || sectionClassReports[0] || null;
  const students = selectedClass?.students || [];
  const attendanceSubjectOptions = handledSubjects.filter((subject) => {
    if (!selectedClass?.id) return true;

    const classMap = getSubjectClassMap(subject);
    const mappedClassIds = Object.keys(classMap).filter((classId) => classMap[classId]);

    return !mappedClassIds.length || mappedClassIds.includes(selectedClass.id);
  });
  const studentRosterKey = students.map((student) => student.id).join("|");
  const [selectedAttendanceSubjectName, setSelectedAttendanceSubjectName] = useState("");
  const selectedAttendanceRecord = selectedClass
    && selectedAttendanceSubjectName
    ? getAttendanceRecord(selectedClass.id, attendanceDate, selectedAttendanceSubjectName)
    : null;
  const selectedSubjectAttendanceRecords = selectedClass && selectedAttendanceSubjectName
    ? getClassAttendanceRecords(selectedClass.id, selectedAttendanceSubjectName)
    : [];
  const attendanceMonthDays = Array.from({ length: getDaysInMonth(attendanceMonth) }, (_, index) => index + 1);
  const monthlyAttendanceRecords = selectedSubjectAttendanceRecords.filter((record) => (
    String(record.date || "").startsWith(`${attendanceMonth}-`)
  ));
  const monthlyAttendanceRecordSignature = monthlyAttendanceRecords.map((record) => JSON.stringify(record)).join("|");
  const getAttendanceRecordSummary = (record) => {
    if (record.status === "no-class") {
      return record.noClassReason ? `No class - ${record.noClassReason}` : "No class";
    }

    const recordEntries = Object.values(record.records || {});
    const presentCount = recordEntries.filter((entry) => ATTENDED_STATUSES.has(entry?.status)).length;
    const absentCount = recordEntries.filter((entry) => entry?.status === "absent").length;

    return `Present/Credited ${presentCount} | Absent ${absentCount}`;
  };

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
    if (section !== "attendance") return;

    if (!attendanceSubjectOptions.length) {
      setSelectedAttendanceSubjectName("");
      return;
    }

    if (!selectedAttendanceSubjectName || !attendanceSubjectOptions.includes(selectedAttendanceSubjectName)) {
      setSelectedAttendanceSubjectName(attendanceSubjectOptions[0]);
    }
  }, [section, selectedClassId, attendanceSubjectOptions.join("|"), selectedAttendanceSubjectName]);

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
  }, [attendanceDate, selectedClassId, selectedAttendanceSubjectName, selectedAttendanceRecord, studentRosterKey]);

  useEffect(() => {
    if (section !== "attendance" || !selectedAttendanceSubjectName) {
      setMonthlyAttendanceDrafts({});
      return;
    }

    setMonthlyAttendanceDrafts((currentDrafts) => {
      const nextDrafts = {};

      students.forEach((student) => {
        nextDrafts[student.id] = {};
        attendanceMonthDays.forEach((day) => {
          const date = buildMonthDateValue(attendanceMonth, day);
          const record = monthlyAttendanceRecords.find((item) => item.date === date);

          nextDrafts[student.id][day] = record?.records?.[student.id]?.status || "";
        });
      });

      if (JSON.stringify(nextDrafts) === JSON.stringify(currentDrafts)) {
        return currentDrafts;
      }

      return nextDrafts;
    });
  }, [
    section,
    attendanceMonth,
    selectedClassId,
    selectedAttendanceSubjectName,
    studentRosterKey,
    monthlyAttendanceRecordSignature
  ]);

  useEffect(() => {
    const subjects = teacherProfile?.subjects?.length ? teacherProfile.subjects : [];
    if (!subjects.length) {
      setSelectedSubjectName("");
      return;
    }

    if (!selectedSubjectName || !subjects.some((subject) => subject === selectedSubjectName)) {
      setSelectedSubjectName(subjects[0]);
    }
  }, [teacherProfile?.subjects?.join("|"), selectedSubjectName]);

  useEffect(() => {
    const firstSubcategory = ASSESSMENT_SUBCATEGORIES[assessmentCategory]?.[0]?.key || "";
    if (firstSubcategory && !ASSESSMENT_SUBCATEGORIES[assessmentCategory].some((subcategory) => subcategory.key === assessmentSubcategory)) {
      setAssessmentSubcategory(firstSubcategory);
    }
  }, [assessmentCategory, assessmentSubcategory]);

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
    dashboard: "Teaching Dashboard",
    overview: "Teaching Dashboard",
    students: "Student Manager",
    subjects: "Subjects",
    attendance: "Attendance",
    gradebook: "Gradebook",
    reports: "Reports"
  };
  const isDashboardSection = section === "dashboard" || section === "overview";
  const isClassScopedSection = section !== "subjects";
  const classTeacherName = selectedClass?.teacherName
    || selectedClass?.adviserName
    || userData?.displayName
    || userData?.email
    || currentUser?.email
    || "Assigned Teacher";
  const existingStudentOptions = allStudents
    .filter((student) => {
      if (!student.id || student.classId === selectedClass?.id) return false;
      if (student.classId) return false;
      if (selectedClass?.gradeLevel && student.gradeLevel && student.gradeLevel !== selectedClass.gradeLevel) return false;

      return true;
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
  const subjectSearchTerm = subjectSearch.trim().toLowerCase();
  const filteredHandledSubjects = handledSubjects.filter((subject) => (
    !subjectSearchTerm || subject.toLowerCase().includes(subjectSearchTerm)
  ));
  const selectedSubjectKey = buildSubjectKey(selectedSubjectName);
  const selectedSubjectClassMap = getSubjectClassMap(selectedSubjectName);
  const selectedSubjectClassIds = Object.keys(selectedSubjectClassMap).filter((classId) => selectedSubjectClassMap[classId]);
  const selectedSubjectClasses = classReports.filter((classroom) => selectedSubjectClassIds.includes(classroom.id));
  const subjectStudents = allStudents
    .filter((student) => student.id && student.classId && selectedSubjectClassIds.includes(student.classId))
    .sort((left, right) => (
      String(left.className).localeCompare(String(right.className))
      || String(left.name).localeCompare(String(right.name))
    ));
  const subjectStudentGroups = subjectStudents.reduce((groups, student) => {
    const groupName = student.className || "Unassigned Section";
    groups[groupName] = [...(groups[groupName] || []), student];
    return groups;
  }, {});

  const getStudentSubjectRecord = (student, subjectName) => {
    return student.subjects.find((subject) => (
      String(subject.name || "").trim().toLowerCase() === String(subjectName || "").trim().toLowerCase()
    )) || null;
  };
  const getQuarterScores = (subject, quarterKey) => {
    const quarter = subject?.quarters?.[quarterKey] || {};

    return {
      writtenWork: {
        quizzes: normalizeOptionalScoreArray(quarter.writtenWork?.quizzes ?? quarter.quizzes),
        longTests: normalizeOptionalScoreArray(quarter.writtenWork?.longTests)
      },
      performanceTask: {
        projects: normalizeOptionalScoreArray(quarter.performanceTask?.projects),
        activities: normalizeOptionalScoreArray(quarter.performanceTask?.activities ?? quarter.activities)
      },
      finalExam: {
        exams: normalizeOptionalScoreArray(quarter.finalExam?.exams ?? quarter.exams)
      }
    };
  };
  const subjectAssessmentSignature = subjectStudents.map((student) => {
    const subject = getStudentSubjectRecord(student, selectedSubjectName);

    return QUARTER_OPTIONS.map((quarter) => {
      const quarterScores = getQuarterScores(subject, quarter.key);

      return ASSESSMENT_CATEGORIES.flatMap((category) => (
        ASSESSMENT_SUBCATEGORIES[category.key].map((subcategory) => (
          quarterScores[category.key]?.[subcategory.key]?.length || 0
        ))
      )).join("-");
    }).join(":");
  }).join("|");

  useEffect(() => {
    if (!selectedSubjectName) return;

    const subjectWithWeights = subjectStudents
      .map((student) => getStudentSubjectRecord(student, selectedSubjectName))
      .find((subject) => subject?.gradeWeights);

    setGradeWeights({
      ...DEFAULT_GRADE_WEIGHTS,
      ...(subjectWithWeights?.gradeWeights || {})
    });
  }, [selectedSubjectName, subjectAssessmentSignature]);

  const openStudentModal = (student = null) => {
    if (!student?.id) return;

    setManagingStudent(student || {});
    setSaveMessage("");
  };

  const openAddStudentModal = () => {
    setStudentToAddId(existingStudentOptions[0]?.id || "");
    setAddingStudentToClass(true);
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
    setSubjectForm({
      name: "",
      classIds: []
    });
    setShowSubjectModal(true);
    setSaveMessage("");
  };

  const handleSubjectFormClassToggle = (classId) => {
    setSubjectForm((currentForm) => ({
      ...currentForm,
      classIds: currentForm.classIds.includes(classId)
        ? currentForm.classIds.filter((item) => item !== classId)
        : [...currentForm.classIds, classId]
    }));
  };

  const handleAddSubject = async (event) => {
    event.preventDefault();

    const subjectName = subjectForm.name.trim();
    if (!subjectName) {
      setSaveMessage("Enter a subject name.");
      return;
    }

    try {
      const nextSubjects = [...handledSubjects, subjectName]
        .filter((subject, index, subjects) => (
          subject.trim() && subjects.findIndex((item) => item.trim().toLowerCase() === subject.trim().toLowerCase()) === index
        ));

      await saveTeacherSubjects(nextSubjects);
      const classMap = await saveTeacherSubjectClasses({
        subjectName,
        classIds: subjectForm.classIds,
        subjectNames: nextSubjects
      });
      setSubjectClassOverrides((currentOverrides) => ({
        ...currentOverrides,
        [buildSubjectKey(subjectName)]: classMap
      }));
      setSelectedSubjectName(subjectName);
      setSubjectScoreDrafts({});
      setShowSubjectModal(false);
      setSaveMessage(`${subjectName} added.`);
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
      q3: savedSubject?.q3 ?? "",
      q4: savedSubject?.q4 ?? ""
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

  const handleAddAssessmentColumn = () => {
    if (!subjectStudents.length) return;

    setSubjectScoreDrafts((currentDrafts) => subjectStudents.reduce((drafts, student) => {
      const currentDraft = currentDrafts[student.id] || getSubjectScoreDraft(student);
      const currentQuarters = currentDraft.quarters || createDefaultQuarterScores();
      const currentQuarter = {
        ...createEmptyQuarterScores(),
        ...(currentQuarters[selectedScoreQuarter] || {})
      };
      const currentCategory = {
        ...(createEmptyQuarterScores()[assessmentCategory] || {}),
        ...(currentQuarter[assessmentCategory] || {})
      };
      const nextValues = [...normalizeScoreArray(currentCategory[assessmentSubcategory]), ""];

      return {
        ...drafts,
        [student.id]: {
          ...currentDraft,
          quarters: {
            ...currentQuarters,
            [selectedScoreQuarter]: {
              ...currentQuarter,
              [assessmentCategory]: {
                ...currentCategory,
                [assessmentSubcategory]: nextValues
              }
            }
          }
        }
      };
    }, currentDrafts));
    setShowAssessmentModal(false);
  };

  const deleteSubject = async (subjectName) => {
    try {
      const nextSubjects = handledSubjects.filter((subject) => subject.toLowerCase() !== subjectName.toLowerCase());

      await saveTeacherSubjects(nextSubjects);
      setSubjectClassOverrides((currentOverrides) => {
        const nextOverrides = { ...currentOverrides };
        delete nextOverrides[buildSubjectKey(subjectName)];
        return nextOverrides;
      });
      setSubjectScoreDrafts({});

      if (selectedSubjectName.toLowerCase() === subjectName.toLowerCase()) {
        setSelectedSubjectName(nextSubjects[0] || "");
      }

      setSaveMessage(`${subjectName} deleted.`);
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Subject could not be deleted.");
    }
  };

  const requestDeleteSubject = (subjectName) => {
    setConfirmState({
      action: "delete-subject",
      tone: "danger",
      title: `Delete ${subjectName}?`,
      message: "This removes the subject from your handled subjects and clears its selected sections.",
      confirmLabel: "Delete Subject",
      cancelLabel: "Keep Subject",
      subjectName
    });
  };

  const handleConfirmDecision = async () => {
    const decision = confirmState;
    if (!decision) return;

    if (decision.action === "delete-subject") {
      await deleteSubject(decision.subjectName);
      setConfirmState(null);
    }
  };

  const getAssessmentColumns = (quarterKey) => ASSESSMENT_CATEGORIES.flatMap((category) => (
    ASSESSMENT_SUBCATEGORIES[category.key].flatMap((subcategory) => {
      const columnCount = Math.max(0, ...subjectStudents.map((student) => {
        const draft = getSubjectScoreDraft(student);
        const values = draft.quarters?.[quarterKey]?.[category.key]?.[subcategory.key];
        return Array.isArray(values) ? values.length : 0;
      }));

      return Array.from({ length: columnCount }, (_, index) => ({
        categoryKey: category.key,
        categoryLabel: category.label,
        subcategoryKey: subcategory.key,
        subcategoryLabel: subcategory.label,
        index
      }));
    })
  ));

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
      q3: quarterGrades.q3,
      q4: quarterGrades.q4
    };
  };

  const handleSaveAllSubjectScores = async () => {
    if (!selectedSubjectName || !subjectStudents.length) return;

    setSavingAllSubjectScores(true);

    try {
      for (const student of subjectStudents) {
        await saveSubjectScores({
          studentId: student.id,
          subjectName: selectedSubjectName,
          scores: buildSubjectScoresForSave(student)
        });
      }

      setSubjectScoreDrafts({});
      setSaveMessage(`${selectedSubjectName} scores saved for ${subjectStudents.length} student${subjectStudents.length === 1 ? "" : "s"}.`);
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

  const handleMarkMonthDay = (day, status) => {
    setMonthlyAttendanceDrafts((currentDrafts) => students.reduce((drafts, student) => ({
      ...drafts,
      [student.id]: {
        ...(drafts[student.id] || {}),
        [day]: status
      }
    }), currentDrafts));
  };

  const handleSaveDailyAttendance = async () => {
    if (!selectedAttendanceSubjectName) {
      setSaveMessage("Select a subject before saving attendance.");
      return;
    }

    await saveDailyAttendanceRecord({
      classId: selectedClass?.id,
      className: selectedClass?.name || selectedClass?.section || "",
      subjectName: selectedAttendanceSubjectName,
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
      ? `${selectedAttendanceSubjectName} marked as no class on ${formatDateLabel(attendanceDate)}.`
      : `${selectedAttendanceSubjectName} attendance saved for ${formatDateLabel(attendanceDate)}.`);
  };

  const handleSaveMonthlyAttendance = async () => {
    if (!selectedAttendanceSubjectName) {
      setSaveMessage("Select a subject before saving attendance.");
      return;
    }

    setSavingMonthlyAttendance(true);

    try {
      for (const day of attendanceMonthDays) {
        const date = buildMonthDateValue(attendanceMonth, day);

        await saveDailyAttendanceRecord({
          classId: selectedClass?.id,
          className: selectedClass?.name || selectedClass?.section || "",
          subjectName: selectedAttendanceSubjectName,
          date,
          entries: students.map((student) => ({
            studentId: student.id,
            studentName: student.name,
            status: monthlyAttendanceDrafts[student.id]?.[day] || ""
          }))
        });
      }

      setSaveMessage(`${selectedAttendanceSubjectName} attendance saved for ${attendanceMonth}.`);
    } catch (saveError) {
      setSaveMessage(saveError?.message || "Attendance could not be saved.");
    } finally {
      setSavingMonthlyAttendance(false);
    }
  };

  const handleSaveStudent = async (formData) => {
    if (!managingStudent?.id) {
      throw new Error("Teachers can only edit existing students.");
    }

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
      studentId: managingStudent?.id,
      payload: {
        ...formData,
        classId: selectedClass?.id,
        teacherId: selectedClass?.teacherId || selectedClass?.teacherUid || "",
        teacherEmail: selectedClass?.teacherEmail || selectedClass?.adviserEmail || "",
        teacherName: classTeacherName,
        activities: [activityEntry, ...(Array.isArray(managingStudent?.raw?.activities)
          ? managingStudent.raw.activities
          : Object.values(managingStudent?.raw?.activities || {}))].slice(0, 6)
      }
    });

    setManagingStudent(null);
    setSaveMessage("Student record updated.");
  };

  const renderClassSelector = () => (
    <div className="toolbar">
      <div>
        <h3>{sectionMeta[section] || "Teaching Dashboard"}</h3>
      </div>
      <div className="toolbar-actions">
        {isClassScopedSection && sectionClassReports.length > 0 && (
          <label className="selector-field">
            <span>Section</span>
            <select value={selectedClass?.id || ""} onChange={(event) => setSelectedClassId(event.target.value)}>
              {sectionClassReports.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name || classroom.section || classroom.id}
                </option>
              ))}
            </select>
          </label>
        )}
        {teacherClassReports.length > 0 && section === "students" && (
          <button type="button" className="secondary-btn" onClick={openAddStudentModal}>
            Add Student
          </button>
        )}
      </div>
    </div>
  );

  const renderSubjectManager = () => (
    <>
      <div className="panel">
        <div className="panel-header">
          <h3>Handled Subjects</h3>
          <button type="button" className="primary-btn" onClick={openSubjectModal}>Add Subject</button>
        </div>
        <label className="selector-field subject-search-field">
          <span>Search Subject</span>
          <input
            type="search"
            value={subjectSearch}
            onChange={(event) => setSubjectSearch(event.target.value)}
            placeholder="Search handled subjects"
          />
        </label>
        {handledSubjects.length ? (
          <div className="subject-picker">
            {filteredHandledSubjects.map((subject) => (
              <div
                key={subject}
                className={`subject-chip ${subject === selectedSubjectName ? "active" : ""}`}
              >
                <button
                  type="button"
                  className="subject-chip-main"
                  onClick={() => {
                    setSelectedSubjectName(subject);
                    setSubjectScoreDrafts({});
                  }}
                >
                  {subject}
                </button>
                <button
                  type="button"
                  className="subject-chip-remove"
                  disabled={savingTeacherId === currentUser?.uid}
                  onClick={() => requestDeleteSubject(subject)}
                  aria-label={`Delete ${subject}`}
                >
                  x
                </button>
              </div>
            ))}
            {!filteredHandledSubjects.length && (
              <p className="empty-copy">No subjects match your search.</p>
            )}
          </div>
        ) : (
          <p className="empty-copy">Add a subject and choose the sections that will take it.</p>
        )}
      </div>

      {handledSubjects.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <h3>Subject Score Workspace</h3>
            <span className="meta-badge">{selectedSubjectName || "Select Subject"}</span>
          </div>

          {selectedSubjectName && (
            <div className="subject-class-selector">
              <div className="panel-header">
                <h4>Sections Enrolled in {selectedSubjectName}</h4>
                <span className="meta-badge">{selectedSubjectClasses.length} selected</span>
              </div>
              <div className="class-checkbox-grid">
                {selectedSubjectClasses.map((classroom) => (
                  <div key={classroom.id} className="class-checkbox selected-class-item">
                    <span>{classroom.name || classroom.section || classroom.id}</span>
                  </div>
                ))}
                {!selectedSubjectClasses.length && (
                  <p className="empty-copy">No sections selected for this subject.</p>
                )}
              </div>
            </div>
          )}

          {selectedSubjectName && subjectStudents.length > 0 && (
            <div className="score-column-toolbar">
              <button
                type="button"
                className="primary-btn score-save-all-btn"
                disabled={savingAllSubjectScores}
                onClick={handleSaveAllSubjectScores}
              >
                {savingAllSubjectScores ? "Saving..." : "Save Scores"}
              </button>
              <label className="selector-field">
                <span>Quarter</span>
                <select value={selectedScoreQuarter} onChange={(event) => setSelectedScoreQuarter(event.target.value)}>
                  {QUARTER_OPTIONS.map((quarter) => (
                    <option key={quarter.key} value={quarter.key}>{quarter.label}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="secondary-btn" onClick={() => setShowFormulaModal(true)}>
                Edit Formula
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowAssessmentModal(true)}
                aria-label="Add assessment"
                title="Add assessment"
              >
                + Add Assessment
              </button>
            </div>
          )}

          {selectedSubjectName && Object.entries(subjectStudentGroups).map(([sectionName, sectionStudents]) => (
            <div key={sectionName} className="subject-section-panel">
              <div className="panel-header">
                <h4>{sectionName}</h4>
                <span className="meta-badge">{sectionStudents.length} students</span>
              </div>
              <div className="score-table-wrap">
                <table className="data-table subject-score-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      {getAssessmentColumns(selectedScoreQuarter).map((column) => (
                        <th key={`${column.categoryKey}-${column.subcategoryKey}-${column.index}`}>
                          {column.categoryLabel}: {column.subcategoryLabel} {column.index + 1}
                        </th>
                      ))}
                      <th>Final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionStudents.map((student) => {
                      const savedSubject = getStudentSubjectRecord(student, selectedSubjectName);
                      const draft = getSubjectScoreDraft(student);
                      const quarterGrades = QUARTER_OPTIONS
                        .map((quarter) => calculateQuarterGrade(draft.quarters?.[quarter.key], gradeWeights))
                        .filter((value) => Number.isFinite(value));
                      const draftFinalGrade = quarterGrades.length
                        ? Number((quarterGrades.reduce((sum, value) => sum + value, 0) / quarterGrades.length).toFixed(1))
                        : savedSubject?.finalGrade ?? "N/A";

                      return (
                        <tr key={student.id}>
                          <td data-label="Student" className="student-score-cell">
                            <strong>{student.name}</strong>
                            <p className="muted-text">{student.studentNumber || "No ID"}</p>
                          </td>
                          {getAssessmentColumns(selectedScoreQuarter).map((column) => {
                            const values = normalizeScoreArray(draft.quarters?.[selectedScoreQuarter]?.[column.categoryKey]?.[column.subcategoryKey]);

                            return (
                              <td
                                key={`${column.categoryKey}-${column.subcategoryKey}-${column.index}`}
                                data-label={`${column.categoryLabel}: ${column.subcategoryLabel} ${column.index + 1}`}
                              >
                                <input
                                  type="number"
                                  value={values[column.index] ?? ""}
                                  onChange={(event) => updateSubjectScoreDraft(
                                    student.id,
                                    column.categoryKey,
                                    column.subcategoryKey,
                                    event.target.value,
                                    column.index,
                                    selectedScoreQuarter
                                  )}
                                  placeholder="-"
                                />
                              </td>
                            );
                          })}
                          <td data-label="Final" className="final-score-cell">{draftFinalGrade}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {selectedSubjectName && !subjectStudents.length && (
            <p className="empty-copy">Choose one or more sections for this subject to show enrolled students.</p>
          )}
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
                      {student.name} {student.studentNumber ? `(${student.studentNumber})` : ""}
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
      {saveMessage && <div className="success-banner">{saveMessage}</div>}

      {renderClassSelector()}

      {isClassScopedSection && !sectionClassReports.length && (
        <div className="empty-state">
          <h3>{section === "attendance" ? "No Subject Sections" : "No Advisory"}</h3>
          <p>{section === "attendance" ? "Add a subject and assign a section before taking attendance." : "Wait for an admin to assign your advisory section."}</p>
        </div>
      )}

      {section === "subjects" && renderSubjectManager()}

      {sectionClassReports.length > 0 && (
        <>

      {isDashboardSection && (
        <div className="stats-grid">
          <div className="stat-card">
            <h4>Assigned Sections</h4>
            <p>{teacherClassReports.length}</p>
          </div>
          <div className="stat-card">
            <h4>Section Average</h4>
            <p>{selectedClass?.averageGpa ?? "N/A"}</p>
          </div>
          <div className="stat-card">
            <h4>Attendance Average</h4>
            <p>{Number.isFinite(selectedClass?.averageAttendance) ? `${selectedClass.averageAttendance}%` : "N/A"}</p>
          </div>
          <div className="stat-card">
            <h4>Students in Section</h4>
            <p>{students.length}</p>
          </div>
        </div>
      )}

      {isDashboardSection && (
        <>
          <div className="insight-grid">
            <div className="panel">
              <div className="panel-header">
                <h3>{selectedClass?.name || selectedClass?.section || "Selected Section"}</h3>
                <div className="inline-actions">
                  {selectedClass?.classCode && (
                    <span className="meta-badge">Code {selectedClass.classCode}</span>
                  )}
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
                  ? `${topPerformer.name} is leading this section with a ${topPerformer.gpa} average.`
                  : "Add students to start building this section roster."}
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

        </>
      )}

      {section === "students" && (
        <div className="panel">
          <div className="panel-header">
            <h3>Section Roster</h3>
            <button type="button" className="primary-btn" onClick={openAddStudentModal}>
              Add Student
            </button>
          </div>
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
                  <td colSpan="5">No students found for this section.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {section === "gradebook" && (
        <div className="panel">
          <div className="panel-header">
            <h3>Section Gradebook</h3>
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
                  <td colSpan="7">No students found for this section.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {section === "attendance" && (
        <>
          {attendanceSubjectOptions.length ? (
            <div className="panel attendance-sheet">
              <div className="panel-header">
                <div>
                  <h3>Monthly Attendance Sheet</h3>
                  <p className="muted-text">
                    {selectedClass?.name || selectedClass?.section || "Selected Section"} - {selectedAttendanceSubjectName || "Select Subject"}
                  </p>
                </div>
                <span className="meta-badge">{students.length} students</span>
              </div>

              <div className="attendance-sheet-toolbar">
                <label className="selector-field">
                  <span>Subject</span>
                  <select
                    value={selectedAttendanceSubjectName}
                    onChange={(event) => setSelectedAttendanceSubjectName(event.target.value)}
                  >
                    {attendanceSubjectOptions.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="selector-field">
                  <span>Month/Year</span>
                  <input
                    type="month"
                    value={attendanceMonth}
                    onChange={(event) => setAttendanceMonth(event.target.value)}
                  />
                </label>
                <div className="attendance-mark-all">
                  <button type="button" className="secondary-btn" onClick={() => handleMarkMonthDay(new Date().getDate(), "present")}>
                    Today Present
                  </button>
                  <button type="button" className="secondary-btn" onClick={() => handleMarkMonthDay(new Date().getDate(), "absent")}>
                    Today Absent
                  </button>
                </div>
              </div>

              <div className="score-table-wrap">
                <table className="data-table subject-score-table monthly-attendance-table">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>Student Name</th>
                      {attendanceMonthDays.map((day) => (
                        <th key={day}>{day}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student, index) => (
                      <tr key={student.id}>
                        <td data-label="No.">{index + 1}</td>
                        <td data-label="Student Name" className="monthly-student-name">{student.name}</td>
                        {attendanceMonthDays.map((day) => (
                          <td key={day} data-label={`${day}`}>
                            <select
                              className="attendance-cell-select"
                              value={monthlyAttendanceDrafts[student.id]?.[day] || ""}
                              onChange={(event) => handleMonthlyAttendanceChange(student.id, day, event.target.value)}
                            >
                              <option value=""></option>
                              {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.code}
                                </option>
                              ))}
                            </select>
                          </td>
                        ))}
                      </tr>
                    ))}
                    {students.length === 0 && (
                      <tr>
                        <td colSpan={attendanceMonthDays.length + 2}>No students found for this section.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="attendance-sheet-summary monthly-attendance-legend">
                {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                  <span key={option.value}><strong>{option.code}</strong> = {option.label}</span>
                ))}
              </div>

              <button
                type="button"
                className="primary-btn attendance-save-btn"
                disabled={savingMonthlyAttendance}
                onClick={handleSaveMonthlyAttendance}
              >
                {savingMonthlyAttendance ? "Saving..." : "Save Monthly Attendance"}
              </button>
            </div>
          ) : (
            <div className="panel">
              <div className="panel-header">
                <h3>Monthly Attendance Sheet</h3>
              </div>
              <p className="empty-copy">Add a subject first, then assign this section to that subject.</p>
            </div>
          )}

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

      {addingStudentToClass && renderAddExistingStudentModal()}

      {showSubjectModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="panel-header">
              <h3>Add Subject</h3>
            </div>
            <form onSubmit={handleAddSubject}>
              <div className="form-group">
                <label>Subject Name</label>
                <input
                  type="text"
                  value={subjectForm.name}
                  onChange={(event) => setSubjectForm({ ...subjectForm, name: event.target.value })}
                  placeholder="Example: Mathematics"
                  required
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
                  {savingTeacherId === currentUser?.uid ? "Saving..." : "Add Subject"}
                </button>
                <button type="button" className="secondary-btn" onClick={() => setShowSubjectModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssessmentModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="panel-header">
              <h3>Add Assessment</h3>
              <span className="meta-badge">{QUARTER_OPTIONS.find((quarter) => quarter.key === selectedScoreQuarter)?.label}</span>
            </div>
            <div className="modal-form-grid">
              <div className="form-group">
                <label>Category</label>
                <select value={assessmentCategory} onChange={(event) => setAssessmentCategory(event.target.value)}>
                  {ASSESSMENT_CATEGORIES.map((category) => (
                    <option key={category.key} value={category.key}>{category.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Type</label>
                <select value={assessmentSubcategory} onChange={(event) => setAssessmentSubcategory(event.target.value)}>
                  {ASSESSMENT_SUBCATEGORIES[assessmentCategory].map((subcategory) => (
                    <option key={subcategory.key} value={subcategory.key}>{subcategory.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="primary-btn" onClick={handleAddAssessmentColumn}>
                Add
              </button>
              <button type="button" className="secondary-btn" onClick={() => setShowAssessmentModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showFormulaModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="panel-header">
              <h3>Edit Formula</h3>
              <span className="meta-badge">{selectedSubjectName || "Subject"}</span>
            </div>
            <div className="modal-form-grid">
              {ASSESSMENT_CATEGORIES.map((category) => (
                <div key={category.key} className="form-group">
                  <label>{category.label} (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={gradeWeights[category.key]}
                    onChange={(event) => setGradeWeights((currentWeights) => ({
                      ...currentWeights,
                      [category.key]: event.target.value
                    }))}
                  />
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="primary-btn" onClick={() => setShowFormulaModal(false)}>
                Done
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setGradeWeights(DEFAULT_GRADE_WEIGHTS)}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {managingStudent && (
        <StudentRecordModal
          title={`Edit Student: ${managingStudent.name}`}
          student={managingStudent}
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
