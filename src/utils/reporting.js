const PASSING_GRADE = 75;
const NEEDS_SUPPORT_GRADE = 80;
const NEEDS_SUPPORT_ATTENDANCE = 85;
const TERM_KEYS = ["q1", "q2", "q3"];

export const TERM_OPTIONS = [
  { key: "q1", label: "Term 1" },
  { key: "q2", label: "Term 2" },
  { key: "q3", label: "Term 3" }
];

export const DEFAULT_GRADE_WEIGHTS = {
  writtenWork: 30,
  performanceTask: 50,
  finalExam: 20
};

export const FIXED_ASSESSMENT_SLOTS = {
  writtenWork: 5,
  performanceTask: 3,
  finalExam: 3
};

export const ASSESSMENT_CATEGORIES = [
  { key: "writtenWork", label: "Written / Oral Works" },
  { key: "performanceTask", label: "Product / Performance Tasks" },
  { key: "finalExam", label: "Summative Tests / Term Exam" }
];

export const ASSESSMENT_SUBCATEGORIES = {
  writtenWork: [
    { key: "quizzes", label: "Quiz" },
    { key: "longTests", label: "Long Test" }
  ],
  performanceTask: [
    { key: "projects", label: "Project" },
    { key: "activities", label: "Activity" }
  ],
  finalExam: [
    { key: "exams", label: "ST / TE" }
  ]
};

const TRANSMUTATION_TABLE = [
  { min: 0, max: 39.99, grade: 60 },
  { min: 40, max: 42.99, grade: 61 },
  { min: 43, max: 45.99, grade: 62 },
  { min: 46, max: 47.99, grade: 63 },
  { min: 48, max: 49.99, grade: 64 },
  { min: 50, max: 51.99, grade: 65 },
  { min: 52, max: 53.99, grade: 66 },
  { min: 54, max: 55.99, grade: 67 },
  { min: 56, max: 57.99, grade: 68 },
  { min: 58, max: 59.99, grade: 69 },
  { min: 60, max: 61.99, grade: 70 },
  { min: 62, max: 63.99, grade: 71 },
  { min: 64, max: 65.99, grade: 72 },
  { min: 66, max: 67.99, grade: 73 },
  { min: 68, max: 69.99, grade: 74 },
  { min: 70, max: 72.99, grade: 75 },
  { min: 73, max: 74.99, grade: 76 },
  { min: 75, max: 75.99, grade: 77 },
  { min: 76, max: 76.99, grade: 78 },
  { min: 77, max: 77.99, grade: 79 },
  { min: 78, max: 78.99, grade: 80 },
  { min: 79, max: 79.99, grade: 81 },
  { min: 80, max: 80.99, grade: 82 },
  { min: 81, max: 81.99, grade: 83 },
  { min: 82, max: 82.99, grade: 84 },
  { min: 83, max: 83.99, grade: 85 },
  { min: 84, max: 84.99, grade: 86 },
  { min: 85, max: 85.99, grade: 87 },
  { min: 86, max: 86.99, grade: 88 },
  { min: 87, max: 87.99, grade: 89 },
  { min: 88, max: 88.99, grade: 90 },
  { min: 89, max: 89.99, grade: 91 },
  { min: 90, max: 90.99, grade: 92 },
  { min: 91, max: 91.99, grade: 93 },
  { min: 92, max: 92.99, grade: 94 },
  { min: 93, max: 93.99, grade: 95 },
  { min: 94, max: 94.99, grade: 96 },
  { min: 95, max: 95.99, grade: 97 },
  { min: 96, max: 97.49, grade: 98 },
  { min: 97.5, max: 99.49, grade: 99 },
  { min: 99.5, max: 100, grade: 100 }
];

const DESCRIPTOR_TABLE = [
  { min: 0, max: 64, label: "Emerging" },
  { min: 65, max: 74, label: "Developing" },
  { min: 75, max: 79, label: "Connecting" },
  { min: 80, max: 89, label: "Benchmarking" },
  { min: 90, max: 100, label: "Advancing" }
];

const average = (values) => {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (!validValues.length) return null;

  const total = validValues.reduce((sum, value) => sum + value, 0);
  return Number((total / validValues.length).toFixed(1));
};

export const createEmptyQuarterScores = () => ({
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

export const createDefaultQuarterScores = () => TERM_KEYS.reduce((quarters, quarterKey) => ({
  ...quarters,
  [quarterKey]: createEmptyQuarterScores()
}), {});

const normalizeFixedCategoryScores = (sources = [], slotCount = 0) => {
  const mergedScores = sources.flatMap((source) => normalizeScoreList(source));

  if (!slotCount || slotCount < 0) return mergedScores;
  return mergedScores.slice(0, slotCount);
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

export const normalizeGradeWeights = (weights = {}) => ({
  writtenWork: DEFAULT_GRADE_WEIGHTS.writtenWork,
  performanceTask: DEFAULT_GRADE_WEIGHTS.performanceTask,
  finalExam: DEFAULT_GRADE_WEIGHTS.finalExam
});

export const normalizeQuarterScoreShape = (quarter = {}, legacyScores = {}) => ({
  writtenWork: {
    quizzes: normalizeFixedCategoryScores([
      quarter.writtenWork?.quizzes,
      quarter.quizzes,
      quarter.quizScore,
      quarter.quiz,
      legacyScores.quizzes,
      quarter.writtenWork?.longTests
    ], FIXED_ASSESSMENT_SLOTS.writtenWork),
    longTests: []
  },
  performanceTask: {
    activities: normalizeFixedCategoryScores([
      quarter.performanceTask?.activities,
      quarter.activities,
      quarter.activityScore,
      quarter.activity,
      legacyScores.activities,
      quarter.performanceTask?.projects
    ], FIXED_ASSESSMENT_SLOTS.performanceTask),
    projects: []
  },
  finalExam: {
    exams: normalizeFixedCategoryScores([
      quarter.finalExam?.exams,
      quarter.exams,
      quarter.examScore,
      quarter.exam,
      legacyScores.exams
    ], FIXED_ASSESSMENT_SLOTS.finalExam)
  }
});

const calculateScoreTotals = (scores = []) => {
  const normalizedScores = normalizeScoreList(scores);
  let earnedTotal = 0;
  let possibleTotal = 0;
  const fallbackPercentages = [];

  normalizedScores.forEach((score) => {
    const parsedEntry = parseScoreEntry(score);
    if (!parsedEntry) return;

    const earned = toNumber(parsedEntry.scoreValue);
    const total = toNumber(parsedEntry.totalValue);

    if (Number.isFinite(earned) && Number.isFinite(total) && total > 0) {
      earnedTotal += earned;
      possibleTotal += total;
      return;
    }

    if (Number.isFinite(parsedEntry.numericValue)) {
      fallbackPercentages.push(parsedEntry.numericValue);
    }
  });

  if (possibleTotal > 0) {
    return Number(((earnedTotal / possibleTotal) * 100).toFixed(2));
  }

  return fallbackPercentages.length ? average(fallbackPercentages) : null;
};

const getCategoryScoreEntries = (quarterScores = {}, categoryKey) => {
  if (categoryKey === "finalExam") {
    return quarterScores.finalExam?.exams || [];
  }

  return ASSESSMENT_SUBCATEGORIES[categoryKey]
    .flatMap((subcategory) => quarterScores[categoryKey]?.[subcategory.key] || []);
};

const getWeightedScore = (percentageScore, weight) => {
  if (!Number.isFinite(percentageScore) || !Number.isFinite(weight) || weight <= 0) {
    return null;
  }

  return Number((percentageScore * (weight / 100)).toFixed(2));
};

export const transmuteInitialGrade = (value) => {
  const numericValue = toNumber(value);
  if (!Number.isFinite(numericValue)) return null;

  const boundedValue = clamp(numericValue, 0, 100);
  const matchedRange = TRANSMUTATION_TABLE.find(({ min, max }) => boundedValue >= min && boundedValue <= max);
  return matchedRange?.grade ?? null;
};

export const getDescriptorForGrade = (value) => {
  const numericValue = toNumber(value);
  if (!Number.isFinite(numericValue)) return "";

  const matchedDescriptor = DESCRIPTOR_TABLE.find(({ min, max }) => numericValue >= min && numericValue <= max);
  return matchedDescriptor?.label || "";
};

export const calculateQuarterGradeDetails = (quarterScores = {}, weights = DEFAULT_GRADE_WEIGHTS) => {
  const normalizedWeights = normalizeGradeWeights(weights);
  const categories = ASSESSMENT_CATEGORIES.map((category) => {
    const percentageScore = calculateScoreTotals(getCategoryScoreEntries(quarterScores, category.key));
    const weight = normalizedWeights[category.key];
    const weightedScore = getWeightedScore(percentageScore, weight);

    return {
      ...category,
      weight,
      percentageScore,
      weightedScore
    };
  });

  const weightedScores = categories
    .map((category) => category.weightedScore)
    .filter((value) => Number.isFinite(value));
  const initialGrade = weightedScores.length
    ? Number(weightedScores.reduce((sum, value) => sum + value, 0).toFixed(2))
    : null;
  const transmutedGrade = transmuteInitialGrade(initialGrade);

  return {
    categories,
    initialGrade,
    transmutedGrade,
    descriptor: getDescriptorForGrade(transmutedGrade)
  };
};

export const calculateQuarterGrade = (quarterScores = {}, weights = DEFAULT_GRADE_WEIGHTS) => (
  calculateQuarterGradeDetails(quarterScores, weights).transmutedGrade
);

export const calculateFinalGrade = (grades = []) => {
  const validGrades = grades.filter((grade) => Number.isFinite(grade));
  if (!validGrades.length) return null;

  const total = validGrades.reduce((sum, grade) => sum + grade, 0);
  return Math.round(total / validGrades.length);
};

export const normalizeQuarterScores = (subject, fallbackSubject = {}) => {
  const sourceQuarters = subject.quarters && typeof subject.quarters === "object" ? subject.quarters : {};
  const fallbackQuarters = fallbackSubject.quarters && typeof fallbackSubject.quarters === "object" ? fallbackSubject.quarters : {};

  return TERM_KEYS.reduce((quarters, quarterKey, index) => {
    const sourceQuarter = sourceQuarters[quarterKey]
      || sourceQuarters[`quarter${index + 1}`]
      || sourceQuarters[`term${index + 1}`]
      || {};
    const fallbackQuarter = fallbackQuarters[quarterKey]
      || fallbackQuarters[`quarter${index + 1}`]
      || fallbackQuarters[`term${index + 1}`]
      || {};
    const legacyScores = index === 0 ? {
      activities: subject.activities ?? fallbackSubject.activities ?? subject.activityScore ?? subject.activity,
      quizzes: subject.quizzes ?? fallbackSubject.quizzes ?? subject.quizScore ?? subject.quiz,
      exams: subject.exams ?? fallbackSubject.exams ?? subject.examScore ?? subject.exam
    } : {};

    quarters[quarterKey] = normalizeQuarterScoreShape({
      writtenWork: {
        quizzes: normalizeFixedCategoryScores([
          sourceQuarter.writtenWork?.quizzes,
          fallbackQuarter.writtenWork?.quizzes,
          sourceQuarter.quizzes,
          fallbackQuarter.quizzes,
          sourceQuarter.quizScore,
          fallbackQuarter.quizScore,
          sourceQuarter.quiz,
          fallbackQuarter.quiz,
          legacyScores.quizzes,
          sourceQuarter.writtenWork?.longTests,
          fallbackQuarter.writtenWork?.longTests
        ], FIXED_ASSESSMENT_SLOTS.writtenWork)
      },
      performanceTask: {
        activities: normalizeFixedCategoryScores([
          sourceQuarter.performanceTask?.activities,
          fallbackQuarter.performanceTask?.activities,
          sourceQuarter.activities,
          fallbackQuarter.activities,
          sourceQuarter.activityScore,
          fallbackQuarter.activityScore,
          sourceQuarter.activity,
          fallbackQuarter.activity,
          legacyScores.activities,
          sourceQuarter.performanceTask?.projects,
          fallbackQuarter.performanceTask?.projects
        ], FIXED_ASSESSMENT_SLOTS.performanceTask)
      },
      finalExam: {
        exams: normalizeFixedCategoryScores([
          sourceQuarter.finalExam?.exams,
          fallbackQuarter.finalExam?.exams,
          sourceQuarter.exams,
          fallbackQuarter.exams,
          sourceQuarter.examScore,
          fallbackQuarter.examScore,
          sourceQuarter.exam,
          fallbackQuarter.exam,
          legacyScores.exams
        ], FIXED_ASSESSMENT_SLOTS.finalExam)
      }
    }, legacyScores);

    return quarters;
  }, {});
};

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

      const quarters = normalizeQuarterScores(subject);
      const gradeWeights = normalizeGradeWeights(subject.gradeWeights);
      const q1 = toNumber(subject.q1 ?? subject.quarter1 ?? subject.term1)
        ?? calculateQuarterGrade(quarters.q1, gradeWeights);
      const q2 = toNumber(subject.q2 ?? subject.quarter2 ?? subject.term2)
        ?? calculateQuarterGrade(quarters.q2, gradeWeights);
      const q3 = toNumber(subject.q3 ?? subject.quarter3 ?? subject.term3)
        ?? calculateQuarterGrade(quarters.q3, gradeWeights);
      const finalGrade = toNumber(subject.finalGrade ?? subject.grade ?? subject.average)
        ?? calculateFinalGrade([q1, q2, q3]);
      const parsedAttendance = toNumber(subject.attendanceRate ?? subject.attendance);
      const attendanceRate = parsedAttendance === null ? null : clamp(parsedAttendance, 0, 100);
      const descriptor = subject.descriptor || getDescriptorForGrade(finalGrade);

      return {
        id: subject.id || key || slugify(subject.name),
        code: String(subject.code || subject.subjectCode || "").trim().toUpperCase(),
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
        finalGrade,
        descriptor,
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
  const gpa = toNumber(student.gpa) ?? average(subjectFinalGrades) ?? average([q1Average, q2Average, q3Average]);
  const parsedAttendance = toNumber(student.attendanceRate ?? student.attendance);
  const subjectAttendanceRate = average(subjects.map((subject) => subject.attendanceRate));
  const attendanceRate = parsedAttendance === null ? subjectAttendanceRate : clamp(parsedAttendance, 0, 100);
  const attendanceLabel = attendanceRate === null ? "N/A" : `${attendanceRate}%`;
  const performanceStatus = student.performanceStatus || computePerformanceStatus({ gpa, attendanceRate, subjects });
  const className = linkedClass?.name || linkedClass?.section || student.section || student.className || "Unassigned Section";
  const gradeLevel = linkedClass?.gradeLevel || student.gradeLevel || linkedUser.gradeLevel || "";
  const updatedAt = student.updatedAt || student.lastUpdated || student.modifiedAt || "";
  const teacherRemarks = student.teacherRemarks || student.remarks || "";
  const linkedParent = student.parentId
    ? users.find((user) => user.id === student.parentId && user.role === "parent") || null
    : null;

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
    parentId: linkedParent?.id || null,
    parentName: linkedParent ? student.parentName || linkedParent.displayName || linkedParent.name || "" : "",
    gradeLevel,
    classId: linkedClass?.id || classId,
    className,
    strand: linkedClass?.strand || student.strand || "",
    teacherName,
    subjects,
    q1Average,
    q2Average,
    q3Average,
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
