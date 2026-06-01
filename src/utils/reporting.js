const PASSING_GRADE = 75;
const NEEDS_SUPPORT_GRADE = 80;
const NEEDS_SUPPORT_ATTENDANCE = 85;
const QUARTER_KEYS = ["q1", "q2", "q3", "q4"];
const DEFAULT_GRADE_WEIGHTS = {
  writtenWork: 30,
  performanceTask: 50,
  finalExam: 20
};

const average = (values) => {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (!validValues.length) return null;

  const total = validValues.reduce((sum, value) => sum + value, 0);
  return Number((total / validValues.length).toFixed(1));
};

const slugify = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
};

const normalizeNamePart = (value) => String(value || "").trim();
const SCORE_ENTRY_KEYS = ["score", "earned", "value", "points", "total", "maxScore", "max", "over"];
const formatFallbackFullName = (value) => {
  const normalizedValue = normalizeNamePart(value);
  if (!normalizedValue) return "";
  if (normalizedValue.includes(",") || normalizedValue.includes("@")) return normalizedValue;

  const nameParts = normalizedValue.split(/\s+/).filter(Boolean);
  if (nameParts.length < 2) return normalizedValue;

  const lastName = nameParts[nameParts.length - 1];
  const firstName = nameParts.slice(0, -1).join(" ");

  return `${lastName}, ${firstName}`;
};

const formatMiddleInitial = (middleValue) => {
  const trimmedValue = normalizeNamePart(middleValue);
  if (!trimmedValue) return "";

  const initial = trimmedValue[0].toUpperCase();
  return `${initial}.`;
};

export const formatPersonName = ({
  firstName,
  lastName,
  middleInitial,
  middleName,
  name,
  displayName,
  fallback = "Unnamed"
} = {}) => {
  const first = normalizeNamePart(firstName);
  const last = normalizeNamePart(lastName);
  const middle = formatMiddleInitial(middleInitial || middleName);

  if (last && first) {
    return `${last}, ${first}${middle ? ` ${middle}` : ""}`;
  }

  if (last) return last;
  if (first) return `${first}${middle ? ` ${middle}` : ""}`;

  return formatFallbackFullName(name) || formatFallbackFullName(displayName) || fallback;
};

const isScoreEntryObject = (value) => (
  Boolean(value)
  && typeof value === "object"
  && !Array.isArray(value)
  && SCORE_ENTRY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key))
);

export const parseScoreEntry = (value) => {
  if (value === null || value === undefined) return null;

  if (isScoreEntryObject(value)) {
    const earned = toNumber(value.score ?? value.earned ?? value.value ?? value.points);
    const total = toNumber(value.total ?? value.maxScore ?? value.max ?? value.over);

    if (Number.isFinite(earned) && Number.isFinite(total) && total > 0) {
      return {
        numericValue: Number(((earned / total) * 100).toFixed(2)),
        displayValue: `${earned}/${total}`,
        scoreValue: String(earned),
        totalValue: String(total)
      };
    }

    if (Number.isFinite(earned)) {
      return {
        numericValue: earned,
        displayValue: String(earned),
        scoreValue: String(earned),
        totalValue: Number.isFinite(total) ? String(total) : ""
      };
    }

    return null;
  }

  const trimmedValue = String(value).trim();
  if (!trimmedValue) return null;

  if (trimmedValue.includes("/")) {
    const [scorePart = "", totalPart = ""] = trimmedValue.split("/", 2).map((part) => part.trim());
    const earned = toNumber(scorePart);
    const total = toNumber(totalPart);

    if (Number.isFinite(earned) && Number.isFinite(total) && total > 0) {
      return {
        numericValue: Number(((earned / total) * 100).toFixed(2)),
        displayValue: `${earned}/${total}`,
        scoreValue: scorePart,
        totalValue: totalPart
      };
    }

    return {
      numericValue: null,
      displayValue: trimmedValue,
      scoreValue: scorePart,
      totalValue: totalPart
    };
  }

  const parsedScore = toNumber(trimmedValue);
  if (Number.isFinite(parsedScore)) {
    return {
      numericValue: parsedScore,
      displayValue: trimmedValue,
      scoreValue: trimmedValue,
      totalValue: ""
    };
  }

  return null;
};

export const normalizeStoredScoreEntry = (value) => parseScoreEntry(value)?.displayValue || "";

export const formatScoreList = (scores) => {
  if (!Array.isArray(scores) || !scores.length) return "N/A";

  const visibleScores = scores
    .map((score) => parseScoreEntry(score))
    .filter((entry) => entry?.scoreValue);

  if (!visibleScores.length) return "N/A";

  return visibleScores
    .map((entry, index) => `${index + 1}: ${entry.displayValue}`)
    .join(", ");
};

const normalizeScoreList = (value) => {
  const trimTrailingBlanks = (scores) => {
    const nextScores = [...scores];

    while (nextScores.length && nextScores[nextScores.length - 1] === "") {
      nextScores.pop();
    }

    return nextScores;
  };

  if (Array.isArray(value)) {
    return trimTrailingBlanks(value.map(normalizeStoredScoreEntry));
  }

  if (value && typeof value === "object") {
    if (isScoreEntryObject(value)) {
      return trimTrailingBlanks([normalizeStoredScoreEntry(value)]);
    }

    return trimTrailingBlanks(Object.values(value).map(normalizeStoredScoreEntry));
  }

  if (typeof value === "string" && value.includes(",")) {
    return trimTrailingBlanks(value.split(",").map(normalizeStoredScoreEntry));
  }

  const score = normalizeStoredScoreEntry(value);
  return score ? [score] : [];
};

const normalizeQuarterScores = (subject) => {
  const sourceQuarters = subject.quarters && typeof subject.quarters === "object" ? subject.quarters : {};

  return QUARTER_KEYS.reduce((quarters, quarterKey, index) => {
    const sourceQuarter = sourceQuarters[quarterKey] || sourceQuarters[`quarter${index + 1}`] || {};
    const legacyScores = index === 0 ? {
      activities: subject.activities ?? subject.activityScore ?? subject.activity,
      quizzes: subject.quizzes ?? subject.quizScore ?? subject.quiz,
      exams: subject.exams ?? subject.examScore ?? subject.exam
    } : {};

    quarters[quarterKey] = {
      writtenWork: {
        quizzes: normalizeScoreList(sourceQuarter.writtenWork?.quizzes ?? sourceQuarter.quizzes ?? sourceQuarter.quizScore ?? sourceQuarter.quiz ?? legacyScores.quizzes),
        longTests: normalizeScoreList(sourceQuarter.writtenWork?.longTests)
      },
      performanceTask: {
        projects: normalizeScoreList(sourceQuarter.performanceTask?.projects),
        activities: normalizeScoreList(sourceQuarter.performanceTask?.activities ?? sourceQuarter.activities ?? sourceQuarter.activityScore ?? sourceQuarter.activity ?? legacyScores.activities)
      },
      finalExam: {
        exams: normalizeScoreList(sourceQuarter.finalExam?.exams ?? sourceQuarter.exams ?? sourceQuarter.examScore ?? sourceQuarter.exam ?? legacyScores.exams)
      }
    };

    return quarters;
  }, {});
};

const normalizeGradeWeights = (weights = {}) => ({
  writtenWork: Math.max(0, toNumber(weights.writtenWork) ?? DEFAULT_GRADE_WEIGHTS.writtenWork),
  performanceTask: Math.max(0, toNumber(weights.performanceTask) ?? DEFAULT_GRADE_WEIGHTS.performanceTask),
  finalExam: Math.max(0, toNumber(weights.finalExam) ?? DEFAULT_GRADE_WEIGHTS.finalExam)
});

export const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalizedValue = value.trim();
    if (!normalizedValue) return null;

    const numericValue = normalizedValue.replace(/[^0-9.-]/g, "");
    if (!numericValue || numericValue === "-" || numericValue === "." || numericValue === "-.") return null;

    const parsed = Number(numericValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
};

export const formatShortDate = (value) => {
  if (!value) return "No recent updates";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
};

export const normalizeCollection = (snapshotValue) => {
  if (!snapshotValue || typeof snapshotValue !== "object") return [];

  return Object.entries(snapshotValue).map(([id, value]) => ({
    id,
    ...(value && typeof value === "object" ? value : { value })
  }));
};

export const normalizeSubjects = (subjectSource, fallbackTeacher = "") => {
  if (!subjectSource) return [];

  const entries = Array.isArray(subjectSource)
    ? subjectSource.map((subject, index) => [subject?.id || `subject-${index + 1}`, subject])
    : Object.entries(subjectSource);

  return entries
    .map(([key, subject]) => {
      if (!subject || typeof subject !== "object") return null;

      const q1 = toNumber(subject.q1 ?? subject.quarter1 ?? subject.prelim);
      const q2 = toNumber(subject.q2 ?? subject.quarter2 ?? subject.midterm);
      const q3 = toNumber(subject.q3 ?? subject.quarter3 ?? subject.prefinal);
      const q4 = toNumber(subject.q4 ?? subject.quarter4 ?? subject.final);
      const quarters = normalizeQuarterScores(subject);
      const gradeWeights = normalizeGradeWeights(subject.gradeWeights);
      const finalGrade = toNumber(subject.finalGrade ?? subject.grade ?? subject.average)
        ?? average([q1, q2, q3, q4]);
      const parsedAttendance = toNumber(subject.attendanceRate ?? subject.attendance);
      const attendanceRate = parsedAttendance === null ? null : clamp(parsedAttendance, 0, 100);

      return {
        id: subject.id || key || slugify(subject.name),
        name: subject.name || subject.subject || "Untitled Subject",
        teacher: subject.teacher || fallbackTeacher || "Teacher not assigned",
        gradeWeights,
        activities: quarters.q1.performanceTask.activities,
        quizzes: quarters.q1.writtenWork.quizzes,
        exams: quarters.q1.finalExam.exams,
        quarters,
        q1,
        q2,
        q3,
        q4,
        finalGrade,
        attendanceRate,
        attendanceLabel: attendanceRate === null ? "N/A" : `${attendanceRate}%`,
        status: subject.status || (finalGrade !== null && finalGrade >= PASSING_GRADE ? "Passed" : "Needs Attention")
      };
    })
    .filter(Boolean);
};

export const computePerformanceStatus = ({ gpa, attendanceRate, subjects }) => {
  const hasFailingSubject = subjects.some((subject) => Number.isFinite(subject.finalGrade) && subject.finalGrade < PASSING_GRADE);

  if ((Number.isFinite(gpa) && gpa < NEEDS_SUPPORT_GRADE) || (Number.isFinite(attendanceRate) && attendanceRate < NEEDS_SUPPORT_ATTENDANCE) || hasFailingSubject) {
    return "Needs Support";
  }

  if ((Number.isFinite(gpa) && gpa >= 90) && (Number.isFinite(attendanceRate) && attendanceRate >= 95)) {
    return "Excellent";
  }

  return "On Track";
};

const normalizeActivities = (activities, fallbackSummary) => {
  const entries = Array.isArray(activities)
    ? activities
    : activities && typeof activities === "object"
      ? Object.values(activities)
      : [];

  const normalized = entries
    .filter((activity) => activity && typeof activity === "object")
    .map((activity) => ({
      date: activity.date || formatShortDate(activity.timestamp || activity.updatedAt),
      activity: activity.activity || "Progress Update",
      result: activity.result || fallbackSummary,
      remarks: activity.remarks || ""
    }));

  return normalized.slice(0, 6);
};

export const buildStudentRecord = ({ student, users, classes }) => {
  const linkedUser = users.find((user) => user.id === student.id) || {};
  const classId = student.classId || student.classKey || student.sectionId || linkedUser.classId || linkedUser.sectionId || null;
  const linkedClass = classes.find((classroom) => {
    if (classroom.id === classId) return true;
    return Boolean(classroom.studentIds?.[student.id]);
  }) || null;

  const teacherName = student.teacherName
    || linkedClass?.teacherName
    || linkedClass?.adviserName
    || linkedClass?.teacherEmail
    || "Teacher not assigned";

  const subjects = normalizeSubjects(student.subjects || student.grades, teacherName);
  const subjectFinalGrades = subjects.map((subject) => subject.finalGrade).filter((grade) => Number.isFinite(grade));
  const q1Average = average(subjects.map((subject) => subject.q1));
  const q2Average = average(subjects.map((subject) => subject.q2));
  const q3Average = average(subjects.map((subject) => subject.q3));
  const q4Average = average(subjects.map((subject) => subject.q4));
  const gpa = toNumber(student.gpa) ?? average(subjectFinalGrades) ?? average([q1Average, q2Average, q3Average, q4Average]);
  const parsedAttendance = toNumber(student.attendanceRate ?? student.attendance);
  const subjectAttendanceRate = average(subjects.map((subject) => subject.attendanceRate));
  const attendanceRate = parsedAttendance === null ? subjectAttendanceRate : clamp(parsedAttendance, 0, 100);
  const attendanceLabel = attendanceRate === null ? "N/A" : `${attendanceRate}%`;
  const performanceStatus = student.performanceStatus || computePerformanceStatus({ gpa, attendanceRate, subjects });
  const className = linkedClass?.name || linkedClass?.section || student.section || student.className || "Unassigned Section";
  const gradeLevel = linkedClass?.gradeLevel || student.gradeLevel || linkedUser.gradeLevel || "";
  const updatedAt = student.updatedAt || student.lastUpdated || student.modifiedAt || "";
  const teacherRemarks = student.teacherRemarks || student.remarks || "";

  const alerts = [];
  if (Number.isFinite(gpa) && gpa < NEEDS_SUPPORT_GRADE) {
    alerts.push("Academic average is below target.");
  }
  if (Number.isFinite(attendanceRate) && attendanceRate < NEEDS_SUPPORT_ATTENDANCE) {
    alerts.push("Attendance requires attention.");
  }
  if (subjects.some((subject) => Number.isFinite(subject.finalGrade) && subject.finalGrade < PASSING_GRADE)) {
    alerts.push("One or more subjects are below passing.");
  }

  const summaryLine = `GPA ${gpa ?? "N/A"} | Attendance ${attendanceLabel}`;
  const studentName = formatPersonName({
    firstName: student.firstName || linkedUser.firstName,
    lastName: student.lastName || linkedUser.lastName,
    middleInitial: student.middleInitial || linkedUser.middleInitial,
    middleName: student.middleName || linkedUser.middleName,
    name: student.name || student.displayName || linkedUser.displayName || linkedUser.name || linkedUser.email,
    fallback: "Unnamed Student"
  });

  return {
    id: student.id,
    name: studentName,
    email: student.email || linkedUser.email || "",
    studentNumber: student.studentNumber || student.studentIdNumber || student.lrn || linkedUser.studentNumber || "",
    parentId: student.parentId || linkedUser.parentId || null,
    parentName: student.parentName || linkedUser.parentName || "",
    gradeLevel,
    classId: linkedClass?.id || classId,
    className,
    strand: linkedClass?.strand || student.strand || "",
    teacherName,
    subjects,
    q1Average,
    q2Average,
    q3Average,
    q4Average,
    gpa,
    attendanceRate,
    attendanceLabel,
    performanceStatus,
    teacherRemarks,
    updatedAt,
    updatedLabel: formatShortDate(updatedAt),
    recentActivity: normalizeActivities(student.activities, summaryLine),
    alerts,
    raw: student
  };
};

export const buildClassReport = (classroom, students) => {
  const averageGpa = average(students.map((student) => student.gpa));
  const averageAttendance = average(students.map((student) => student.attendanceRate));
  const atRiskStudents = students.filter((student) => student.performanceStatus === "Needs Support");
  const excellentStudents = students.filter((student) => student.performanceStatus === "Excellent");

  return {
    ...classroom,
    students,
    averageGpa,
    averageAttendance,
    atRiskCount: atRiskStudents.length,
    excellentCount: excellentStudents.length,
    completionRate: students.length
      ? Math.round((students.filter((student) => student.subjects.length > 0).length / students.length) * 100)
      : 0
  };
};

export const buildRepositorySummary = ({ users, students, classes }) => {
  const teachers = users.filter((user) => user.role === "teacher").length;
  const parents = users.filter((user) => user.role === "parent").length;
  const averageGpa = average(students.map((student) => student.gpa));
  const averageAttendance = average(students.map((student) => student.attendanceRate));
  const studentsWithClasses = students.filter((student) => student.classId).length;
  const studentsWithParents = students.filter((student) => student.parentId || student.parentName).length;
  const atRiskStudents = students.filter((student) => student.performanceStatus === "Needs Support").length;
  const liveReports = students.filter((student) => student.subjects.length > 0).length;

  return {
    teachers,
    students: students.length,
    parents,
    classes: classes.length,
    averageGpa,
    averageAttendance,
    studentsWithClasses,
    studentsWithParents,
    atRiskStudents,
    liveReports,
    health: atRiskStudents === 0 ? "Stable" : atRiskStudents <= 5 ? "Monitor" : "Intervention Required"
  };
};
