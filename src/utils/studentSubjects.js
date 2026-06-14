const normalizeLookupValue = (value) => String(value || "").trim().toLowerCase();

const buildSubjectKey = (value) => normalizeLookupValue(value)
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const getSubjectCode = (subject) => String(subject?.code || subject?.subjectCode || "").trim().toUpperCase();

const getSubjectName = (subject) => String(subject?.name || subject?.subject || "").trim();

const getSubjectIdentity = (subject) => {
  const code = getSubjectCode(subject);
  const name = getSubjectName(subject);

  return code ? `code:${normalizeLookupValue(code)}` : `name:${normalizeLookupValue(name)}`;
};

const findSavedSubject = (subjects, activeSubject) => {
  const activeCode = getSubjectCode(activeSubject);
  const activeName = normalizeLookupValue(getSubjectName(activeSubject));

  if (activeCode) {
    const codeMatch = subjects.find((subject) => getSubjectCode(subject) === activeCode);
    if (codeMatch) return codeMatch;
  }

  return subjects.find((subject) => normalizeLookupValue(getSubjectName(subject)) === activeName) || null;
};

export const mergeSubjectAttendanceRecords = (recordGroups) => {
  const recordsByDate = new Map();

  recordGroups.flat().forEach((record) => {
    if (!record?.date || recordsByDate.has(record.date)) return;
    recordsByDate.set(record.date, record);
  });

  return [...recordsByDate.values()]
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
};

export const getCurrentStudentSubjects = ({ student, teacherUsers = [] }) => {
  const savedSubjects = Array.isArray(student?.subjects) ? student.subjects : [];
  if (!student?.classId) return savedSubjects;

  const activeSubjects = [];
  const seenSubjects = new Set();

  teacherUsers.forEach((teacher) => {
    const subjectClassIds = teacher.subjectClassIds || {};
    const subjectRecords = Array.isArray(teacher.subjectRecords) ? teacher.subjectRecords : [];

    subjectRecords.forEach((subject) => {
      const code = getSubjectCode(subject);
      const name = getSubjectName(subject);
      if (!code && !name) return;

      const subjectKeys = [
        buildSubjectKey(code),
        buildSubjectKey(name)
      ].filter(Boolean);
      const assignedClassMap = subjectKeys
        .map((subjectKey) => subjectClassIds[subjectKey])
        .find((classMap) => classMap && typeof classMap === "object");

      if (!assignedClassMap?.[student.classId]) return;

      const identity = getSubjectIdentity(subject);
      if (seenSubjects.has(identity)) return;

      const savedSubject = findSavedSubject(savedSubjects, subject);
      activeSubjects.push({
        ...(savedSubject || {}),
        id: savedSubject?.id || `subject-${identity.replace(/[^a-z0-9]+/gi, "-")}`,
        code: code || savedSubject?.code || savedSubject?.subjectCode || "",
        name: name || savedSubject?.name || savedSubject?.subject || code,
        legacyName: savedSubject ? getSubjectName(savedSubject) : "",
        teacher: teacher.name || savedSubject?.teacher || "Teacher not assigned"
      });
      seenSubjects.add(identity);
    });
  });

  return activeSubjects.length ? activeSubjects : savedSubjects;
};

export const formatSubjectAttendanceAverage = (subjects, fallback = "N/A") => {
  const attendanceRates = subjects
    .map((subject) => Number(subject.attendanceRate))
    .filter((rate) => Number.isFinite(rate));

  if (!attendanceRates.length) return fallback;

  const total = attendanceRates.reduce((sum, rate) => sum + rate, 0);
  return `${Number((total / attendanceRates.length).toFixed(1))}%`;
};
