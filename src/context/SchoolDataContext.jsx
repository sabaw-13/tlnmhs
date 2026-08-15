import React, { createContext, useContext, useEffect, useState } from "react";
import { equalTo, onValue, orderByChild, push, query, ref, update } from "firebase/database";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import {
  buildClassReport,
  buildRepositorySummary,
  buildStudentRecord,
  calculateFinalGrade,
  calculateQuarterGrade,
  clamp,
  createDefaultQuarterScores,
  computePerformanceStatus,
  formatPersonName,
  formatShortDate,
  normalizeCollection,
  normalizeGradeWeights,
  normalizeQuarterScores,
  toNumber
} from "../utils/reporting";
import { createManagedAccount, deleteManagedAccount, updateManagedAccount } from "../utils/adminAccounts";

const SchoolDataContext = createContext();
const ATTENDED_ATTENDANCE_STATUSES = new Set(["present", "late", "excused"]);
const CLASS_CODE_LENGTH = 6;
const DEFAULT_GRADE_LEVEL_OPTIONS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10"];
const TERM_KEYS = ["q1", "q2", "q3"];

const normalizeLookupValue = (value) => String(value || "").trim().toLowerCase();

const buildGradeLevelLabel = (value) => {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) return "";

  const matchedGrade = trimmedValue.match(/\d+/)?.[0] || "";
  return matchedGrade ? `Grade ${matchedGrade}` : trimmedValue;
};

const sortGradeLevels = (gradeLevels = []) => {
  return [...gradeLevels].sort((left, right) => {
    const leftLabel = String(left || "").trim();
    const rightLabel = String(right || "").trim();
    const leftNumber = Number(leftLabel.match(/\d+/)?.[0] || NaN);
    const rightNumber = Number(rightLabel.match(/\d+/)?.[0] || NaN);

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    if (Number.isFinite(leftNumber) && !Number.isFinite(rightNumber)) return -1;
    if (!Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return 1;

    return leftLabel.localeCompare(rightLabel, undefined, { numeric: true, sensitivity: "base" });
  });
};

const buildGradeLevelId = (value) => (
  normalizeLookupValue(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
);

const normalizeGradeLevel = (value, allowedOptions = DEFAULT_GRADE_LEVEL_OPTIONS) => {
  const gradeLevel = buildGradeLevelLabel(value);
  if (!gradeLevel) return "";

  const normalizedAllowedOption = allowedOptions.find((option) => (
    normalizeLookupValue(option) === normalizeLookupValue(gradeLevel)
  ));

  return normalizedAllowedOption || (allowedOptions.length ? "" : gradeLevel);
};

const buildSubjectKey = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const buildTeacherSubjectStorageKey = (subject) => {
  if (subject && typeof subject === "object") {
    return buildSubjectKey(subject.code || subject.subjectCode || subject.name || subject.subject || "");
  }

  return buildSubjectKey(subject);
};

const buildGeneratedStudentEmail = (studentNumber, rowIndex, variant = 0) => {
  const safeStudentNumber = String(studentNumber || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  const baseEmailName = safeStudentNumber || `student-${rowIndex + 1}`;
  const variantSuffix = variant ? `-${variant}` : "";

  return `${baseEmailName}${variantSuffix}@students.tlnmhs.edu.ph`;
};

const normalizeClassCode = (value) => String(value || "")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "");

const generateClassCode = (existingCodes = []) => {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const usedCodes = new Set(existingCodes.map(normalizeClassCode).filter(Boolean));

  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = "";

    for (let index = 0; index < CLASS_CODE_LENGTH; index += 1) {
      code += characters[Math.floor(Math.random() * characters.length)];
    }

    if (!usedCodes.has(code)) return code;
  }

  return `${Date.now().toString(36).toUpperCase().slice(-CLASS_CODE_LENGTH)}`;
};

const hasDuplicateClassCode = ({ classes, classCode, exceptClassId = "" }) => {
  const normalizedClassCode = normalizeClassCode(classCode);
  if (!normalizedClassCode) return false;

  return classes.some((classroom) => (
    classroom.id !== exceptClassId
    && normalizeClassCode(classroom.classCode) === normalizedClassCode
  ));
};

const averageValues = (values) => {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (!validValues.length) return null;

  const total = validValues.reduce((sum, value) => sum + value, 0);
  return Number((total / validValues.length).toFixed(1));
};
const normalizeTeacherSubjectRecords = (subjectSource) => {
  if (!subjectSource) return [];

  const toSubjectRecord = (subject) => {
    if (typeof subject === "string") {
      const name = subject.trim();
      return name ? { code: "", name } : null;
    }

    if (subject && typeof subject === "object") {
      const code = String(subject.code || subject.subjectCode || "").trim().toUpperCase();
      const name = String(subject.name || subject.subject || "").trim();

      if (!code && !name) return null;

      return {
        code,
        name: name || code
      };
    }

    return null;
  };

  const dedupeRecords = (records) => {
    const seen = new Set();

    return records.filter((record) => {
      const key = `${normalizeLookupValue(record.code)}::${normalizeLookupValue(record.name)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  if (Array.isArray(subjectSource)) {
    return dedupeRecords(subjectSource.map(toSubjectRecord).filter(Boolean));
  }

  if (typeof subjectSource === "string") {
    return dedupeRecords(
      subjectSource
        .split(",")
        .map(toSubjectRecord)
        .filter(Boolean)
    );
  }

  if (typeof subjectSource === "object") {
    return dedupeRecords(Object.values(subjectSource).map(toSubjectRecord).filter(Boolean));
  }

  return [];
};
const normalizeTeacherSubjects = (subjectSource) => {
  return normalizeTeacherSubjectRecords(subjectSource).map((subject) => subject.name);
};

export const useSchoolData = () => useContext(SchoolDataContext);

export const SchoolDataProvider = ({ children }) => {
  const { currentUser, userData, loading: authLoading } = useAuth();
  const [users, setUsers] = useState([]);
  const [rawGradeLevels, setRawGradeLevels] = useState([]);
  const [rawClasses, setRawClasses] = useState([]);
  const [rawStudents, setRawStudents] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [parentAccountRequests, setParentAccountRequests] = useState([]);
  const [parentStudentAccessRequests, setParentStudentAccessRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingStudentId, setSavingStudentId] = useState("");
  const [savingTeacherId, setSavingTeacherId] = useState("");
  const [savingGradeLevelName, setSavingGradeLevelName] = useState("");
  const [savingAttendanceKey, setSavingAttendanceKey] = useState("");
  const [savingClass, setSavingClass] = useState(false);
  const [savingEnrollmentStudentId, setSavingEnrollmentStudentId] = useState("");

  const assertAdminAccess = () => {
    if (userData?.role !== "admin") {
      throw new Error("Only admin accounts can manage student and teacher credentials.");
    }
  };

  const shouldIgnoreManagedAccountDeleteError = (error) => {
    const message = String(error?.message || "").trim().toLowerCase();

    return message === "the request could not be completed."
      || message.includes("user-not-found")
      || message.includes("user not found");
  };

  const cleanupManagedAccountAfterRecordDelete = async ({ uid, role }) => {
    try {
      await deleteManagedAccount({ uid });
    } catch (error) {
      if (!shouldIgnoreManagedAccountDeleteError(error)) {
        throw error;
      }

      console.warn(`Managed ${role} account cleanup skipped for ${uid}:`, error);
    }
  };

  const syncManagedAccount = async ({ uid, email, displayName, password }) => {
    const accountUpdates = {};

    if (typeof email === "string" && email.trim()) {
      accountUpdates.email = email.trim();
    }

    if (typeof displayName === "string") {
      accountUpdates.displayName = displayName.trim();
    }

    if (typeof password === "string" && password.trim()) {
      accountUpdates.password = password.trim();
    }

    if (!Object.keys(accountUpdates).length) {
      return null;
    }

    try {
      return await updateManagedAccount({
        uid,
        ...accountUpdates
      });
    } catch (error) {
      const message = String(error?.message || "");

      if (/request could not be completed|account management api is unavailable/i.test(message)) {
        console.warn(`Skipping auth sync for ${uid}; account API is unavailable in this environment.`, error);
        return null;
      }

      if (/user[-\s]?not[-\s]?found|no user record/i.test(message)) {
        console.warn(`Skipping auth sync for missing account ${uid}.`, error);
        return null;
      }

      throw error;
    }
  };

  useEffect(() => {
    if (authLoading) return undefined;

    if (!currentUser) {
      setUsers([]);
      setRawGradeLevels([]);
      setRawClasses([]);
      setRawStudents([]);
      setAttendanceRecords({});
      setParentAccountRequests([]);
      setParentStudentAccessRequests([]);
      setError("");
      setLoading(false);
      return undefined;
    }

    const shouldLoadParentAccountRequests = userData?.role === "admin";
    const shouldLoadParentStudentAccessRequests = ["admin", "parent"].includes(userData?.role);
    const initialState = {
      users: false,
      gradeLevels: false,
      classes: false,
      students: false,
      attendance: false,
      parentAccountRequests: !shouldLoadParentAccountRequests,
      parentStudentAccessRequests: !shouldLoadParentStudentAccessRequests
    };

    if (!shouldLoadParentAccountRequests) {
      setParentAccountRequests([]);
    }

    if (!shouldLoadParentStudentAccessRequests) {
      setParentStudentAccessRequests([]);
    }

    setLoading(true);
    setError("");

    const markLoaded = (key) => {
      initialState[key] = true;
      if (Object.values(initialState).every(Boolean)) {
        setLoading(false);
      }
    };

    const handleSubscriptionError = (subscriptionError) => {
      console.error("Realtime school data subscription failed:", subscriptionError);
      setError("Realtime data could not be loaded. Check Firebase access rules.");
      setLoading(false);
    };

    const unsubscribeUsers = onValue(
      ref(db, "users"),
      (snapshot) => {
        setUsers(normalizeCollection(snapshot.val()));
        markLoaded("users");
      },
      handleSubscriptionError
    );

    const unsubscribeGradeLevels = onValue(
      ref(db, "gradeLevels"),
      (snapshot) => {
        setRawGradeLevels(normalizeCollection(snapshot.val()));
        markLoaded("gradeLevels");
      },
      handleSubscriptionError
    );

    const unsubscribeClasses = onValue(
      ref(db, "classes"),
      (snapshot) => {
        setRawClasses(normalizeCollection(snapshot.val()));
        markLoaded("classes");
      },
      handleSubscriptionError
    );

    const unsubscribeStudents = onValue(
      ref(db, "students"),
      (snapshot) => {
        setRawStudents(normalizeCollection(snapshot.val()));
        markLoaded("students");
      },
      handleSubscriptionError
    );

    const unsubscribeAttendance = onValue(
      ref(db, "attendanceRecords"),
      (snapshot) => {
        setAttendanceRecords(snapshot.val() || {});
        markLoaded("attendance");
      },
      handleSubscriptionError
    );

    const unsubscribeParentAccountRequests = shouldLoadParentAccountRequests
      ? onValue(
        ref(db, "parentAccountRequests"),
        (snapshot) => {
          setParentAccountRequests(normalizeCollection(snapshot.val()));
          markLoaded("parentAccountRequests");
        },
        handleSubscriptionError
      )
      : () => {};

    const parentStudentAccessRequestsRef = userData?.role === "parent"
      ? query(ref(db, "parentStudentAccessRequests"), orderByChild("parentId"), equalTo(currentUser.uid))
      : ref(db, "parentStudentAccessRequests");
    const unsubscribeParentStudentAccessRequests = shouldLoadParentStudentAccessRequests
      ? onValue(
        parentStudentAccessRequestsRef,
        (snapshot) => {
          setParentStudentAccessRequests(normalizeCollection(snapshot.val()));
          markLoaded("parentStudentAccessRequests");
        },
        handleSubscriptionError
      )
      : () => {};

    return () => {
      unsubscribeUsers();
      unsubscribeGradeLevels();
      unsubscribeClasses();
      unsubscribeStudents();
      unsubscribeAttendance();
      unsubscribeParentAccountRequests();
      unsubscribeParentStudentAccessRequests();
    };
  }, [authLoading, currentUser, userData?.role]);

  const gradeLevelRecords = (() => {
    const savedEntries = rawGradeLevels
      .map((entry) => {
        const name = normalizeGradeLevel(entry.name || entry.gradeLevel || entry.label, []);
        if (!name) return null;

        return {
          ...entry,
          name,
          status: entry.status === "inactive" ? "inactive" : "active",
          isDefault: false
        };
      })
      .filter(Boolean);
    const savedMap = new Map(savedEntries.map((entry) => [normalizeLookupValue(entry.name), entry]));

    DEFAULT_GRADE_LEVEL_OPTIONS.forEach((gradeLevel) => {
      if (savedMap.has(normalizeLookupValue(gradeLevel))) return;

      savedEntries.push({
        id: `default-${normalizeLookupValue(gradeLevel).replace(/[^a-z0-9]+/g, "-")}`,
        name: gradeLevel,
        status: "active",
        isDefault: true
      });
    });

    return savedEntries.sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "active" ? -1 : 1;
      }

      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
    });
  })();
  const gradeLevels = sortGradeLevels(
    gradeLevelRecords
      .filter((entry) => entry.status !== "inactive")
      .map((entry) => entry.name)
  );
  const isManagedGradeLevel = (value) => Boolean(normalizeGradeLevel(value, gradeLevels));
  const classes = rawClasses.filter((classroom) => isManagedGradeLevel(classroom.gradeLevel));
  const juniorHighClassIds = new Set(classes.map((classroom) => classroom.id));
  const nonJuniorHighClassIds = new Set(
    rawClasses
      .filter((classroom) => !isManagedGradeLevel(classroom.gradeLevel))
      .map((classroom) => classroom.id)
  );

  const enrichedStudents = rawStudents
    .map((student) => buildStudentRecord({ student, users, classes }))
    .filter((student) => {
      const sourceClassId = student.classId
        || student.raw?.classId
        || student.raw?.classKey
        || student.raw?.sectionId
        || null;

      if (sourceClassId && nonJuniorHighClassIds.has(sourceClassId)) return false;
      if (sourceClassId && juniorHighClassIds.has(sourceClassId)) return true;

      return isManagedGradeLevel(student.gradeLevel || student.raw?.gradeLevel);
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));

  const findStudentById = (studentId) => {
    return enrichedStudents.find((student) => student.id === studentId) || null;
  };

  const getTeacherClasses = () => {
    if (!currentUser) return [];

    const matchedClasses = classes.filter((classroom) => {
      const matchesTeacherId = [
        classroom.teacherId,
        classroom.teacherUid,
        classroom.adviserId,
        classroom.ownerId
      ].includes(currentUser.uid);

      const matchesTeacherEmail = userData?.email && [
        classroom.teacherEmail,
        classroom.adviserEmail
      ].includes(userData.email);

      return matchesTeacherId || matchesTeacherEmail;
    });

    return matchedClasses;
  };

  const getStudentsForClass = (classId) => {
    return enrichedStudents.filter((student) => {
      if (student.classId === classId) return true;

      const classroom = classes.find((item) => item.id === classId);
      return Boolean(classroom?.studentIds?.[student.id]);
    });
  };

  const classReports = classes.map((classroom) => buildClassReport(classroom, getStudentsForClass(classroom.id)));
  const teacherClassReports = getTeacherClasses().map((classroom) => buildClassReport(classroom, getStudentsForClass(classroom.id)));
  const repositorySummary = buildRepositorySummary({
    users,
    students: enrichedStudents,
    classes
  });

  const currentStudent = currentUser
    ? findStudentById(currentUser.uid)
      || findStudentById(userData?.studentId)
      || enrichedStudents.find((student) => student.email && student.email === userData?.email)
      || null
    : null;

  const parentStudentIds = userData?.studentIds && typeof userData.studentIds === "object"
    ? Object.keys(userData.studentIds).filter((studentId) => userData.studentIds[studentId])
    : [];
  const linkedStudents = currentUser
    ? enrichedStudents.filter((student) => (
      student.parentId === currentUser.uid
      || parentStudentIds.includes(student.id)
      || (userData?.studentId && student.id === userData.studentId)
    ))
    : [];
  const linkedStudent = linkedStudents[0] || null;

  const teacherUsers = users
    .filter((user) => user.role === "teacher")
    .map((teacher) => {
      const subjectRecords = normalizeTeacherSubjectRecords(teacher.subjects);
      const teacherClasses = classes.filter((classroom) => (
        classroom.teacherId === teacher.id
        || classroom.teacherUid === teacher.id
        || classroom.adviserId === teacher.id
        || classroom.ownerId === teacher.id
        || (teacher.email && [classroom.teacherEmail, classroom.adviserEmail].includes(teacher.email))
      ));
      const advisoryClass = classes.find((classroom) => classroom.id === teacher.advisoryClassId) || teacherClasses[0] || null;

      return {
        id: teacher.id,
        name: teacher.displayName || teacher.name || teacher.email || "Teacher",
        email: teacher.email || "",
        subjects: subjectRecords.map((subject) => subject.name),
        subjectRecords,
        subjectClassIds: teacher.subjectClassIds || {},
        advisoryClassId: advisoryClass?.id || teacher.advisoryClassId || "",
        advisoryClassName: advisoryClass?.name || advisoryClass?.section || teacher.advisoryClassName || "",
        classCount: teacherClasses.length
      };
    });

  const getClassAttendanceRecords = (classId, subjectName = "", subjectCode = "") => {
    const subjectKey = buildSubjectKey(subjectCode || subjectName);
    const legacySubjectKey = buildSubjectKey(subjectName);
    const classRecords = subjectKey
      ? attendanceRecords?.[classId]?.[subjectKey]
        || (legacySubjectKey && legacySubjectKey !== subjectKey ? attendanceRecords?.[classId]?.[legacySubjectKey] : null)
        || {}
      : attendanceRecords?.[classId] || {};

    return Object.entries(classRecords)
      .filter(([, record]) => record && typeof record === "object" && record.records)
      .map(([date, record]) => ({
        date,
        ...(record && typeof record === "object" ? record : {})
      }))
      .sort((left, right) => String(right.date).localeCompare(String(left.date)));
  };

  const getAttendanceRecord = (classId, date, subjectName = "", subjectCode = "") => {
    if (!classId || !date) return null;

    const subjectKey = buildSubjectKey(subjectCode || subjectName);
    const legacySubjectKey = buildSubjectKey(subjectName);
    const record = subjectKey
      ? attendanceRecords?.[classId]?.[subjectKey]?.[date]
        || (legacySubjectKey && legacySubjectKey !== subjectKey ? attendanceRecords?.[classId]?.[legacySubjectKey]?.[date] : null)
      : attendanceRecords?.[classId]?.[date];
    if (!record || typeof record !== "object") return null;

    return record.date ? record : { date, subjectKey, subjectName, ...record };
  };

  const calculateAttendanceRate = ({ classId, studentId, date, nextRecord, subjectName, subjectCode = "" }) => {
    const subjectKey = buildSubjectKey(subjectCode || subjectName || nextRecord?.subjectCode || nextRecord?.subjectName);
    const classRecords = {
      ...(subjectKey
        ? attendanceRecords?.[classId]?.[subjectKey] || {}
        : attendanceRecords?.[classId] || {}),
      [date]: nextRecord
    };
    const countedRecords = Object.values(classRecords).filter((record) => (
      record
      && typeof record === "object"
      && record.status !== "no-class"
      && record.records?.[studentId]?.status
    ));

    if (!countedRecords.length) return null;

    const attendedCount = countedRecords.filter((record) => (
      ATTENDED_ATTENDANCE_STATUSES.has(record.records?.[studentId]?.status)
    )).length;

    return Number(((attendedCount / countedRecords.length) * 100).toFixed(1));
  };

  const getTeacherDetails = ({ teacherId, teacherEmail, teacherName, classroom }) => {
    const linkedTeacher = teacherUsers.find((teacher) => (
      (teacherId && teacher.id === teacherId)
      || (teacherEmail && teacher.email === teacherEmail)
      || (teacherName && teacher.name === teacherName)
    ));

    const classTeacher = classroom
      ? teacherUsers.find((teacher) => (
        teacher.id === classroom.teacherId
        || teacher.id === classroom.teacherUid
        || teacher.email === classroom.teacherEmail
        || teacher.email === classroom.adviserEmail
      ))
      : null;

    const resolvedTeacher = linkedTeacher || classTeacher;

    return {
      teacherId: resolvedTeacher?.id || teacherId || classroom?.teacherId || classroom?.teacherUid || "",
      teacherEmail: resolvedTeacher?.email || teacherEmail || classroom?.teacherEmail || classroom?.adviserEmail || "",
      teacherName: resolvedTeacher?.name || teacherName || classroom?.teacherName || classroom?.adviserName || classroom?.teacherEmail || "Teacher not assigned"
    };
  };

  const saveStudentRecord = async ({ studentId, payload }) => {
    if (!["admin", "teacher"].includes(userData?.role)) {
      throw new Error("Only admins and advisory teachers can manage students.");
    }

    const isNewStudent = !studentId;
    const trimmedStudentNumber = String(payload.studentNumber || "").trim();
    const trimmedStudentEmail = String(payload.email || "").trim();
    const trimmedFirstName = String(payload.firstName || "").trim();
    const trimmedLastName = String(payload.lastName || "").trim();
    const trimmedMiddleInitial = String(payload.middleInitial || payload.middleName || "").trim();
    const trimmedStudentName = formatPersonName({
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      middleInitial: trimmedMiddleInitial,
      name: payload.name,
      fallback: "Unnamed Student"
    });
    let targetStudentId = studentId;
    const existingUserForSync = studentId ? users.find((user) => user.id === studentId) || null : null;
    const requestedClassId = payload.classId ?? null;
    const requestedClassroom = classes.find((item) => item.id === requestedClassId) || null;
    const isRequestedClassAdviser = requestedClassroom && [
      requestedClassroom.teacherId,
      requestedClassroom.teacherUid,
      requestedClassroom.adviserId,
      requestedClassroom.ownerId
    ].includes(currentUser?.uid);

    if (isNewStudent) {
      if (userData?.role === "teacher" && (!requestedClassroom || !isRequestedClassAdviser)) {
        throw new Error("Teachers can only add new students to their advisory section.");
      }

      if (!trimmedStudentEmail) {
        throw new Error("Student email is required to create the account.");
      }

      if (trimmedStudentNumber.length < 6) {
        throw new Error("Student ID number must be at least 6 characters to use as the default password.");
      }

      const createdAccount = await createManagedAccount({
        role: "student",
        email: trimmedStudentEmail,
        password: trimmedStudentNumber,
        displayName: trimmedStudentName
      });

      targetStudentId = createdAccount.uid;
    } else if (userData?.role === "admin" && existingUserForSync) {
      const existingDisplayName = existingUserForSync.displayName || existingUserForSync.name || "";
      const hasEmailChanged = trimmedStudentEmail && trimmedStudentEmail !== existingUserForSync.email;
      const hasNameChanged = trimmedStudentName && trimmedStudentName !== existingDisplayName;

      await syncManagedAccount({
        uid: studentId,
        email: hasEmailChanged ? trimmedStudentEmail : undefined,
        displayName: hasNameChanged ? trimmedStudentName : undefined
      });
    }

    if (!targetStudentId) {
      throw new Error("Student ID could not be generated.");
    }

    setSavingStudentId(targetStudentId);

    try {
      const existingUser = users.find((user) => user.id === targetStudentId) || null;
      const existingUserData = existingUser ? { ...existingUser } : {};
      delete existingUserData.id;
      const existingStudent = rawStudents.find((student) => student.id === targetStudentId) || null;
      const existingStudentData = existingStudent ? { ...existingStudent } : {};
      delete existingStudentData.id;
      const resolvedClassId = payload.classId ?? existingStudent?.classId ?? existingStudent?.classKey ?? existingStudent?.sectionId ?? null;
      const classroom = classes.find((item) => item.id === resolvedClassId) || null;
      const isClassAdviser = classroom && [
        classroom.teacherId,
        classroom.teacherUid,
        classroom.adviserId,
        classroom.ownerId
      ].includes(currentUser?.uid);

      if (userData?.role === "teacher" && (!classroom || !isClassAdviser)) {
        throw new Error("Teachers can only add or edit students in their advisory section.");
      }

      const normalizedStudentGradeLevel = normalizeGradeLevel(classroom?.gradeLevel, gradeLevels)
        || normalizeGradeLevel(payload.gradeLevel, gradeLevels)
        || normalizeGradeLevel(existingStudent?.gradeLevel, gradeLevels)
        || normalizeGradeLevel(existingUser?.gradeLevel, gradeLevels);

      if (userData?.role === "admin" && !normalizedStudentGradeLevel) {
        throw new Error("Select a grade level for this student.");
      }

      const teacherDetails = getTeacherDetails({
        teacherId: payload.teacherId || existingStudent?.teacherId,
        teacherEmail: payload.teacherEmail || existingStudent?.teacherEmail,
        teacherName: payload.teacherName || existingStudent?.teacherName,
        classroom
      });
      const normalizedSubjects = (payload.subjects || [])
        .filter((subject) => subject.name?.trim())
        .map((subject, index) => {
          const existingSubject = existingStudent?.subjects
            ? (Array.isArray(existingStudent.subjects)
              ? existingStudent.subjects
              : Object.values(existingStudent.subjects))
              .find((item) => (
                String(item?.name || item?.subject || "").trim().toLowerCase() === subject.name.trim().toLowerCase()
              ))
            : null;
          const previousAttendanceRate = toNumber(existingSubject?.attendanceRate ?? existingSubject?.attendance);
          const attendanceRate = subject.attendanceRate === undefined && previousAttendanceRate !== null
            ? clamp(previousAttendanceRate, 0, 100)
            : null;
          const quarters = normalizeQuarterScores(subject, existingSubject || {});
          const gradeWeights = normalizeGradeWeights(subject.gradeWeights || existingSubject?.gradeWeights);
          const q1 = toNumber(subject.q1) ?? calculateQuarterGrade(quarters.q1, gradeWeights);
          const q2 = toNumber(subject.q2) ?? calculateQuarterGrade(quarters.q2, gradeWeights);
          const q3 = toNumber(subject.q3) ?? calculateQuarterGrade(quarters.q3, gradeWeights);
          const finalGrade = calculateFinalGrade([q1, q2, q3]);

          return {
            id: subject.id || `subject-${index + 1}`,
            name: subject.name.trim(),
            teacher: subject.teacher?.trim() || teacherDetails.teacherName,
            gradeWeights,
            activities: quarters.q1.performanceTask.activities,
            quizzes: quarters.q1.writtenWork.quizzes,
            exams: quarters.q1.finalExam.exams,
            quarters,
            q1,
            q2,
            q3,
            finalGrade,
            attendanceRate,
            attendanceLabel: attendanceRate === null ? "N/A" : `${attendanceRate}%`,
            status: finalGrade !== null && finalGrade >= 75 ? "Passed" : "Needs Attention"
          };
        });

      const parsedAttendance = toNumber(payload.attendance);
      const attendanceRate = parsedAttendance === null ? null : clamp(parsedAttendance, 0, 100);
      const subjectAverage = averageValues(normalizedSubjects.map((subject) => subject.finalGrade));
      const computedGpa = toNumber(payload.gpa) ?? subjectAverage;
      const performanceStatus = payload.performanceStatus || computePerformanceStatus({
        gpa: computedGpa,
        attendanceRate,
        subjects: normalizedSubjects
      });
      const now = new Date().toISOString();
      const oldClassId = existingStudent?.classId || existingStudent?.classKey || existingStudent?.sectionId || null;
      const nextClassId = resolvedClassId;
      const nextAttendanceLabel = attendanceRate === null ? "" : `${attendanceRate}%`;
      const existingParent = existingStudent?.parentId
        ? users.find((user) => user.id === existingStudent.parentId && user.role === "parent") || null
        : null;
      const existingParentId = existingParent?.id || null;
      const existingParentName = existingParent
        ? existingStudent?.parentName || existingParent.displayName || existingParent.name || ""
        : "";
      const updates = {
        [`students/${targetStudentId}`]: {
          ...existingStudentData,
          name: trimmedStudentName,
          firstName: trimmedFirstName || existingStudent?.firstName || "",
          lastName: trimmedLastName || existingStudent?.lastName || "",
          middleInitial: trimmedMiddleInitial || existingStudent?.middleInitial || "",
          email: trimmedStudentEmail,
          studentNumber: trimmedStudentNumber || existingStudent?.studentNumber || "",
          parentName: existingParentName,
          parentId: existingParentId,
          gradeLevel: normalizedStudentGradeLevel,
          classId: nextClassId,
          className: classroom?.name || classroom?.section || payload.className || "",
          teacherId: teacherDetails.teacherId || null,
          teacherEmail: teacherDetails.teacherEmail || "",
          teacherName: teacherDetails.teacherName,
          gpa: computedGpa,
          attendance: nextAttendanceLabel,
          attendanceRate,
          performanceStatus,
          teacherRemarks: payload.teacherRemarks?.trim() || "",
          subjects: normalizedSubjects,
          activities: payload.activities || existingStudent?.activities || [],
          updatedAt: now,
          updatedByName: userData?.displayName || userData?.email || currentUser?.email || "System User",
          updatedByRole: userData?.role || "unknown",
          lastUpdateLabel: formatShortDate(now)
        },
        [`users/${targetStudentId}`]: {
          ...existingUserData,
          displayName: trimmedStudentName,
          name: trimmedStudentName,
          firstName: trimmedFirstName || existingUser?.firstName || "",
          lastName: trimmedLastName || existingUser?.lastName || "",
          middleInitial: trimmedMiddleInitial || existingUser?.middleInitial || "",
          email: trimmedStudentEmail,
          role: "student",
          studentId: targetStudentId,
          studentNumber: trimmedStudentNumber || existingUser?.studentNumber || "",
          gradeLevel: normalizedStudentGradeLevel,
          classId: nextClassId,
          className: classroom?.name || classroom?.section || payload.className || "",
          updatedAt: now,
          updatedByName: userData?.displayName || userData?.email || currentUser?.email || "System User",
          updatedByRole: userData?.role || "unknown"
        }
      };

      if (oldClassId && oldClassId !== nextClassId) {
        updates[`classes/${oldClassId}/studentIds/${targetStudentId}`] = null;
      }

      if (nextClassId) {
        updates[`classes/${nextClassId}/studentIds/${targetStudentId}`] = true;
      }

      await update(ref(db), updates);
      return targetStudentId;
    } finally {
      setSavingStudentId("");
    }
  };

  const addStudentToClass = async ({ classId, studentId }) => {
    if (!currentUser || userData?.role !== "teacher") {
      throw new Error("Only advisory teachers can add students to their section.");
    }

    const classroom = classes.find((item) => item.id === classId) || null;
    if (!classroom) {
      throw new Error("Select an advisory section before adding a student.");
    }

    const isClassAdviser = [
      classroom.teacherId,
      classroom.teacherUid,
      classroom.adviserId,
      classroom.ownerId
    ].includes(currentUser.uid);

    if (!isClassAdviser) {
      throw new Error("Teachers can only add students to their own advisory section.");
    }

    const existingStudent = rawStudents.find((student) => student.id === studentId) || null;
    const existingUser = users.find((user) => user.id === studentId) || null;

    if (!existingStudent) {
      throw new Error("Select an existing student record.");
    }

    const existingStudentData = existingStudent ? { ...existingStudent } : {};
    delete existingStudentData.id;
    const existingUserData = existingUser ? { ...existingUser } : {};
    delete existingUserData.id;

    const oldClassId = existingStudent?.classId || existingStudent?.classKey || existingStudent?.sectionId || existingUser?.classId || null;
    if (oldClassId === classId || classroom.studentIds?.[studentId]) {
      throw new Error("This student is already in this section.");
    }

    const now = new Date().toISOString();
    const className = classroom.name || classroom.section || "";
    const gradeLevel = normalizeGradeLevel(classroom.gradeLevel || existingStudent?.gradeLevel || existingUser?.gradeLevel, gradeLevels);
    const studentName = existingStudent?.name
      || existingUser?.displayName
      || existingUser?.name
      || existingUser?.email
      || "Student";
    const studentEmail = existingStudent?.email || existingUser?.email || "";
    const studentNumber = existingStudent?.studentNumber || existingUser?.studentNumber || "";
    const teacherName = classroom.teacherName
      || classroom.adviserName
      || userData?.displayName
      || userData?.email
      || currentUser.email
      || "Assigned Teacher";
    const updates = {
      [`classes/${classId}/studentIds/${studentId}`]: true,
      [`students/${studentId}`]: {
        ...existingStudentData,
        name: studentName,
        email: studentEmail,
        studentNumber,
        gradeLevel,
        classId,
        className,
        teacherId: classroom.teacherId || classroom.teacherUid || currentUser.uid,
        teacherEmail: classroom.teacherEmail || classroom.adviserEmail || userData?.email || "",
        teacherName,
        updatedAt: now,
        updatedByName: userData?.displayName || userData?.email || currentUser.email || "System User",
        updatedByRole: "teacher",
        lastUpdateLabel: formatShortDate(now)
      },
      [`users/${studentId}`]: {
        ...existingUserData,
        displayName: studentName,
        name: studentName,
        email: studentEmail,
        role: "student",
        studentId,
        studentNumber,
        gradeLevel,
        classId,
        className,
        pendingClassId: null,
        pendingClassCode: null,
        updatedAt: now,
        updatedByName: userData?.displayName || userData?.email || currentUser.email || "System User",
        updatedByRole: "teacher"
      }
    };

    if (oldClassId && oldClassId !== classId) {
      updates[`classes/${oldClassId}/studentIds/${studentId}`] = null;
    }

    setSavingEnrollmentStudentId(studentId);

    try {
      await update(ref(db), updates);
      return studentId;
    } finally {
      setSavingEnrollmentStudentId("");
    }
  };

  const importBulkStudents = async ({ rows = [] }) => {
    assertAdminAccess();

    if (!Array.isArray(rows) || !rows.length) {
      throw new Error("Upload a CSV with at least one student row.");
    }

    const existingStudentNumbers = new Set([
      ...rawStudents.map((student) => normalizeLookupValue(student.studentNumber || student.studentIdNumber || student.lrn || student.idNumber)),
      ...users.map((user) => normalizeLookupValue(user.studentNumber || user.studentIdNumber || user.lrn || user.idNumber))
    ].filter(Boolean));
    const existingEmails = new Set(users.map((user) => normalizeLookupValue(user.email)).filter(Boolean));
    const seenStudentNumbers = new Set();
    const seenEmails = new Set();
    const imported = [];
    const skipped = [];
    const failed = [];
    const warnings = [];
    const getAvailableGeneratedEmail = (studentNumber, rowIndex, startVariant = 0) => {
      for (let variant = startVariant; variant < startVariant + 100; variant += 1) {
        const generatedEmail = buildGeneratedStudentEmail(studentNumber, rowIndex, variant);
        const generatedEmailKey = normalizeLookupValue(generatedEmail);

        if (!existingEmails.has(generatedEmailKey) && !seenEmails.has(generatedEmailKey)) {
          return {
            email: generatedEmail,
            emailKey: generatedEmailKey
          };
        }
      }

      return null;
    };
    const resolveImportEmail = ({ preferredEmail, studentNumber, rowIndex, rowNumber }) => {
      const preferredEmailKey = normalizeLookupValue(preferredEmail);

      if (preferredEmail && !existingEmails.has(preferredEmailKey) && !seenEmails.has(preferredEmailKey)) {
        return {
          email: preferredEmail,
          emailKey: preferredEmailKey
        };
      }

      const generated = getAvailableGeneratedEmail(studentNumber, rowIndex);

      if (generated && preferredEmail) {
        warnings.push(`Row ${rowNumber}: email ${preferredEmail} is already used; generated ${generated.email} for the student login.`);
      }

      return generated || {
        email: preferredEmail,
        emailKey: preferredEmailKey
      };
    };
    const isEmailConflictError = (error) => {
      const message = String(error?.message || "").toLowerCase();

      return message.includes("email") && (message.includes("already") || message.includes("used"));
    };
    const isAccountRateLimitError = (error) => {
      const message = String(error?.message || "").toLowerCase();

      return message.includes("temporarily limiting account creation") || message.includes("too-many-requests");
    };

    const sortedRows = [...rows].sort((left, right) => (
      formatPersonName({
        firstName: left.firstName,
        lastName: left.lastName,
        middleInitial: left.middleInitial,
        fallback: ""
      }).localeCompare(formatPersonName({
        firstName: right.firstName,
        lastName: right.lastName,
        middleInitial: right.middleInitial,
        fallback: ""
      }))
    ));

    for (const [index, row] of sortedRows.entries()) {
      const rowNumber = row.rowNumber || index + 2;
      const firstName = String(row.firstName || "").trim();
      const lastName = String(row.lastName || "").trim();
      const middleInitial = String(row.middleInitial || "").trim();
      const formattedStudentName = formatPersonName({
        firstName,
        lastName,
        middleInitial,
        fallback: "Unnamed student"
      });
      const studentNumber = String(row.studentNumber || "").trim();
      const gradeLevel = normalizeGradeLevel(row.gradeLevel, gradeLevels);
      const section = String(row.section || "").trim();
      const preferredEmail = String(row.email || "").trim();
      let { email } = resolveImportEmail({
        preferredEmail,
        studentNumber,
        rowIndex: index,
        rowNumber
      });
      const studentNumberKey = normalizeLookupValue(studentNumber);
      const rowErrors = [];

      if (!firstName) rowErrors.push("First name is required.");
      if (!lastName) rowErrors.push("Last name is required.");
      if (!gradeLevel) rowErrors.push("Grade level must match an active grade level.");
      if (!studentNumber) rowErrors.push("Student ID number is required.");
      if (studentNumber && studentNumber.length < 6) {
        rowErrors.push("Student ID number must be at least 6 characters for the temporary password.");
      }
      if (studentNumberKey && existingStudentNumbers.has(studentNumberKey)) {
        skipped.push({
          rowNumber,
          name: formattedStudentName || studentNumber,
          studentNumber,
          reason: "Student ID number already exists."
        });
        continue;
      }
      if (studentNumberKey && seenStudentNumbers.has(studentNumberKey)) {
        skipped.push({
          rowNumber,
          name: formattedStudentName || studentNumber,
          studentNumber,
          reason: "Student ID number is duplicated in this CSV."
        });
        continue;
      }
      if (!email) rowErrors.push("Student login email could not be generated.");

      let matchedClass = null;
      if (section) {
        matchedClass = classes.find((classroom) => (
          normalizeGradeLevel(classroom.gradeLevel, gradeLevels) === gradeLevel
          && normalizeLookupValue(classroom.section || classroom.name) === normalizeLookupValue(section)
        )) || null;

        if (!matchedClass && !rowErrors.length) {
          warnings.push(`Row ${rowNumber}: no section matched ${gradeLevel} - ${section}; imported without section assignment.`);
        }
      }

      if (rowErrors.length) {
        failed.push({
          rowNumber,
          name: formattedStudentName,
          reason: rowErrors.join(" ")
        });
        continue;
      }

      const buildImportPayload = (accountEmail) => ({
        name: formattedStudentName,
        firstName,
        lastName,
        middleInitial,
        email: accountEmail,
        studentNumber,
        gradeLevel,
        classId: matchedClass?.id || "",
        className: matchedClass?.name || matchedClass?.section || "",
        parentName: "",
        parentId: "",
        subjects: [],
        performanceStatus: "On Track",
        activities: [{
          date: formatShortDate(new Date().toISOString()),
          activity: "Bulk Import",
          result: matchedClass
            ? `Added to ${matchedClass.name || matchedClass.section}`
            : "Student account imported",
          remarks: `Temporary password is student ID number ${studentNumber}`
        }]
      });
      const addImportedStudent = (studentId, accountEmail) => {
        imported.push({
          rowNumber,
          studentId,
          name: formattedStudentName,
          className: matchedClass?.name || matchedClass?.section || "",
          email: accountEmail
        });
        existingStudentNumbers.add(studentNumberKey);
        existingEmails.add(normalizeLookupValue(accountEmail));
        seenEmails.add(normalizeLookupValue(accountEmail));
      };

      seenStudentNumbers.add(studentNumberKey);

      try {
        const studentId = await saveStudentRecord({
          payload: buildImportPayload(email)
        });

        addImportedStudent(studentId, email);
      } catch (importError) {
        if (isEmailConflictError(importError)) {
          const generated = getAvailableGeneratedEmail(studentNumber, index, 1);

          if (generated && generated.email !== email) {
            try {
              const studentId = await saveStudentRecord({
                payload: buildImportPayload(generated.email)
              });

              warnings.push(`Row ${rowNumber}: email ${email} could not be used; generated ${generated.email} for the student login.`);
              addImportedStudent(studentId, generated.email);
              continue;
            } catch (retryError) {
              if (isAccountRateLimitError(retryError)) {
                warnings.push(retryError.message);
                break;
              }

              failed.push({
                rowNumber,
                name: formattedStudentName,
                reason: retryError?.message || importError?.message || "Student could not be imported."
              });
              continue;
            }
          }
        }

        if (isAccountRateLimitError(importError)) {
          warnings.push(importError.message);
          break;
        }

        failed.push({
          rowNumber,
          name: formattedStudentName,
          reason: importError?.message || "Student could not be imported."
        });
      }
    }

    return {
      imported,
      skipped,
      failed,
      warnings
    };
  };

  const saveClassRecord = async ({ classId = "", payload }) => {
    if (!currentUser) {
      throw new Error("Sign in before saving a section.");
    }

    if (userData?.role !== "admin") {
      throw new Error("Only admin accounts can add or update sections.");
    }

    const sectionName = String(payload.section || "").trim();
    const gradeLevel = normalizeGradeLevel(payload.gradeLevel, gradeLevels);
    const className = [gradeLevel, sectionName].filter(Boolean).join(" - ");

    if (!gradeLevel) {
      throw new Error("Select a grade level for this section.");
    }

    if (!sectionName) {
      throw new Error("Section name is required.");
    }

    const existingClass = classId ? rawClasses.find((classroom) => classroom.id === classId) || null : null;
    const targetClassId = classId || push(ref(db, "classes")).key;
    const requestedTeacher = payload.teacherId
      ? teacherUsers.find((teacher) => teacher.id === payload.teacherId) || null
      : null;
    const teacherId = requestedTeacher?.id || payload.teacherId || "";
    const teacherEmail = requestedTeacher?.email || payload.teacherEmail || "";
    const teacherName = requestedTeacher?.name || payload.teacherName || "";
    const now = new Date().toISOString();
    const classCode = normalizeClassCode(payload.classCode)
      || existingClass?.classCode
      || generateClassCode(rawClasses.map((classroom) => classroom.classCode));

    if (!targetClassId) {
      throw new Error("Section ID could not be generated.");
    }

    if (hasDuplicateClassCode({ classes: rawClasses, classCode, exceptClassId: targetClassId })) {
      throw new Error("Section code must be unique.");
    }

    if (!teacherId) {
      throw new Error("Assign an adviser to this section.");
    }

    setSavingClass(true);

    try {
      const previousTeacherId = existingClass?.teacherId || existingClass?.teacherUid || existingClass?.adviserId || "";
      const previousAdvisoryClassId = requestedTeacher?.advisoryClassId || "";
      const updates = {
        [`classes/${targetClassId}`]: {
          ...(existingClass || {}),
          name: className,
          section: sectionName,
          subject: String(payload.subject || "").trim(),
          gradeLevel,
          classCode,
          teacherId,
          teacherUid: teacherId,
          adviserId: teacherId,
          teacherEmail,
          adviserEmail: teacherEmail,
          teacherName: teacherName || "Teacher not assigned",
          adviserName: teacherName || "Teacher not assigned",
          studentIds: existingClass?.studentIds || {},
          joinRequests: existingClass?.joinRequests || {},
          createdAt: existingClass?.createdAt || now,
          createdBy: existingClass?.createdBy || currentUser.uid,
          updatedAt: now,
          updatedByName: userData?.displayName || userData?.email || currentUser.email || "System User",
          updatedByRole: "admin"
        }
      };

      if (teacherId) {
        updates[`users/${teacherId}/advisoryClassId`] = targetClassId;
        updates[`users/${teacherId}/advisoryClassName`] = className;
      }

      if (previousTeacherId && previousTeacherId !== teacherId) {
        updates[`users/${previousTeacherId}/advisoryClassId`] = null;
        updates[`users/${previousTeacherId}/advisoryClassName`] = "";
      }

      if (previousAdvisoryClassId && previousAdvisoryClassId !== targetClassId) {
        updates[`classes/${previousAdvisoryClassId}/teacherId`] = null;
        updates[`classes/${previousAdvisoryClassId}/teacherUid`] = null;
        updates[`classes/${previousAdvisoryClassId}/adviserId`] = null;
        updates[`classes/${previousAdvisoryClassId}/teacherEmail`] = "";
        updates[`classes/${previousAdvisoryClassId}/adviserEmail`] = "";
        updates[`classes/${previousAdvisoryClassId}/teacherName`] = "Teacher not assigned";
        updates[`classes/${previousAdvisoryClassId}/adviserName`] = "Teacher not assigned";
      }

      await update(ref(db), updates);

      return targetClassId;
    } finally {
      setSavingClass(false);
    }
  };

  const saveGradeLevelRecord = async ({ name }) => {
    if (!currentUser) {
      throw new Error("Sign in before saving a grade level.");
    }

    assertAdminAccess();

    const gradeLevelName = normalizeGradeLevel(name, []) || buildGradeLevelLabel(name);
    if (!gradeLevelName) {
      throw new Error("Grade level name is required.");
    }

    const existingGradeLevel = gradeLevelRecords.find((entry) => (
      normalizeLookupValue(entry.name) === normalizeLookupValue(gradeLevelName)
    )) || null;

    if (existingGradeLevel?.status !== "inactive") {
      throw new Error(`${gradeLevelName} already exists.`);
    }

    const gradeLevelId = (!existingGradeLevel?.isDefault && existingGradeLevel?.id)
      || buildGradeLevelId(gradeLevelName)
      || push(ref(db, "gradeLevels")).key;
    const now = new Date().toISOString();

    if (!gradeLevelId) {
      throw new Error("Grade level ID could not be generated.");
    }

    setSavingGradeLevelName(gradeLevelName);

    try {
      await update(ref(db), {
        [`gradeLevels/${gradeLevelId}`]: {
          ...(existingGradeLevel && !existingGradeLevel.isDefault ? existingGradeLevel : {}),
          name: gradeLevelName,
          status: "active",
          createdAt: existingGradeLevel?.createdAt || now,
          createdBy: existingGradeLevel?.createdBy || currentUser.uid,
          updatedAt: now,
          updatedByName: userData?.displayName || userData?.email || currentUser.email || "System User",
          updatedByRole: "admin"
        }
      });

      return gradeLevelId;
    } finally {
      setSavingGradeLevelName("");
    }
  };

  const deactivateGradeLevelRecord = async (name) => {
    if (!currentUser) {
      throw new Error("Sign in before updating a grade level.");
    }

    assertAdminAccess();

    const gradeLevelName = normalizeGradeLevel(name, gradeLevels);
    if (!gradeLevelName) {
      throw new Error("Select a valid grade level.");
    }

    const hasAssignedSections = classes.some((classroom) => (
      normalizeLookupValue(classroom.gradeLevel) === normalizeLookupValue(gradeLevelName)
    ));

    if (hasAssignedSections) {
      throw new Error("Move or delete the sections under this grade level before deactivating it.");
    }

    const existingGradeLevel = gradeLevelRecords.find((entry) => (
      normalizeLookupValue(entry.name) === normalizeLookupValue(gradeLevelName)
    )) || null;
    const gradeLevelId = (!existingGradeLevel?.isDefault && existingGradeLevel?.id)
      || buildGradeLevelId(gradeLevelName)
      || push(ref(db, "gradeLevels")).key;
    const now = new Date().toISOString();

    if (!gradeLevelId) {
      throw new Error("Grade level ID could not be generated.");
    }

    setSavingGradeLevelName(gradeLevelName);

    try {
      await update(ref(db), {
        [`gradeLevels/${gradeLevelId}`]: {
          ...(existingGradeLevel && !existingGradeLevel.isDefault ? existingGradeLevel : {}),
          name: gradeLevelName,
          status: "inactive",
          createdAt: existingGradeLevel?.createdAt || now,
          createdBy: existingGradeLevel?.createdBy || currentUser.uid,
          updatedAt: now,
          updatedByName: userData?.displayName || userData?.email || currentUser.email || "System User",
          updatedByRole: "admin"
        }
      });

      return gradeLevelId;
    } finally {
      setSavingGradeLevelName("");
    }
  };

  const createClassRecord = async (payload) => saveClassRecord({ payload });

  const requestClassJoin = async (classCode) => {
    if (!currentUser) {
      throw new Error("Sign in before joining a section.");
    }

    if (userData?.role !== "student") {
      throw new Error("Only student accounts can request to join a section.");
    }

    const normalizedCode = normalizeClassCode(classCode);
    const classroom = classes.find((item) => (
      normalizeClassCode(item.classCode) === normalizedCode
      || normalizeClassCode(item.id) === normalizedCode
    ));

    if (!normalizedCode) {
      throw new Error("Enter a section code.");
    }

    if (!classroom) {
      throw new Error("No section was found for that code.");
    }

    if (currentStudent?.classId && currentStudent.classId !== classroom.id) {
      throw new Error("This account is already assigned to a section.");
    }

    if (currentStudent?.classId === classroom.id || classroom.studentIds?.[currentUser.uid]) {
      throw new Error("You are already in this section.");
    }

    const existingRequest = classroom.joinRequests?.[currentUser.uid];
    if (existingRequest?.status === "pending") {
      throw new Error("Your request is already waiting for teacher approval.");
    }

    const studentName = currentStudent?.name
      || userData?.displayName
      || userData?.name
      || currentUser.displayName
      || currentUser.email
      || "Student";
    const now = new Date().toISOString();

    await update(ref(db), {
      [`classes/${classroom.id}/joinRequests/${currentUser.uid}`]: {
        studentId: currentUser.uid,
        studentName,
        email: currentStudent?.email || userData?.email || currentUser.email || "",
        studentNumber: currentStudent?.studentNumber || userData?.studentNumber || "",
        status: "pending",
        requestedAt: now
      },
      [`users/${currentUser.uid}/pendingClassId`]: classroom.id,
      [`users/${currentUser.uid}/pendingClassCode`]: classroom.classCode || classroom.id
    });

    return classroom;
  };

  const approveClassJoinRequest = async ({ classId, studentId }) => {
    const classroom = classes.find((item) => item.id === classId) || null;
    const request = classroom?.joinRequests?.[studentId] || null;

    if (!classroom || !request) {
      throw new Error("This join request could not be found.");
    }

    const isClassTeacher = [
      classroom.teacherId,
      classroom.teacherUid,
      classroom.adviserId,
      classroom.ownerId
    ].includes(currentUser?.uid);

    if (userData?.role !== "admin" && !isClassTeacher) {
      throw new Error("Only the section adviser can accept this request.");
    }

    const existingStudent = rawStudents.find((student) => student.id === studentId) || null;
    const existingStudentData = existingStudent ? { ...existingStudent } : {};
    delete existingStudentData.id;
    const existingUser = users.find((user) => user.id === studentId) || null;
    const existingUserData = existingUser ? { ...existingUser } : {};
    delete existingUserData.id;

    const oldClassId = existingStudent?.classId || existingStudent?.classKey || existingStudent?.sectionId || existingUser?.classId || null;
    const now = new Date().toISOString();
    const className = classroom.name || classroom.section || "";
    const gradeLevel = normalizeGradeLevel(classroom.gradeLevel || existingStudent?.gradeLevel || existingUser?.gradeLevel, gradeLevels);
    const teacherName = classroom.teacherName
      || classroom.adviserName
      || userData?.displayName
      || userData?.email
      || currentUser?.email
      || "Assigned Teacher";
    const studentName = existingStudent?.name
      || existingUser?.displayName
      || existingUser?.name
      || request.studentName
      || "Student";
    const studentEmail = existingStudent?.email || existingUser?.email || request.email || "";
    const studentNumber = existingStudent?.studentNumber || existingUser?.studentNumber || request.studentNumber || "";
    const updates = {
      [`classes/${classId}/studentIds/${studentId}`]: true,
      [`classes/${classId}/joinRequests/${studentId}`]: null,
      [`students/${studentId}`]: {
        ...existingStudentData,
        name: studentName,
        email: studentEmail,
        studentNumber,
        gradeLevel,
        classId,
        className,
        teacherId: classroom.teacherId || classroom.teacherUid || currentUser?.uid || null,
        teacherEmail: classroom.teacherEmail || classroom.adviserEmail || userData?.email || "",
        teacherName,
        updatedAt: now,
        updatedByName: userData?.displayName || userData?.email || currentUser?.email || "System User",
        updatedByRole: userData?.role || "unknown",
        lastUpdateLabel: formatShortDate(now)
      },
      [`users/${studentId}`]: {
        ...existingUserData,
        displayName: studentName,
        name: studentName,
        email: studentEmail,
        role: "student",
        studentId,
        studentNumber,
        gradeLevel,
        classId,
        className,
        pendingClassId: null,
        pendingClassCode: null,
        updatedAt: now,
        updatedByName: userData?.displayName || userData?.email || currentUser?.email || "System User",
        updatedByRole: userData?.role || "unknown"
      }
    };

    if (oldClassId && oldClassId !== classId) {
      updates[`classes/${oldClassId}/studentIds/${studentId}`] = null;
    }

    setSavingEnrollmentStudentId(studentId);

    try {
      await update(ref(db), updates);
    } finally {
      setSavingEnrollmentStudentId("");
    }
  };

  const rejectClassJoinRequest = async ({ classId, studentId }) => {
    const classroom = classes.find((item) => item.id === classId) || null;

    if (!classroom?.joinRequests?.[studentId]) {
      throw new Error("This join request could not be found.");
    }

    const isClassTeacher = [
      classroom.teacherId,
      classroom.teacherUid,
      classroom.adviserId,
      classroom.ownerId
    ].includes(currentUser?.uid);

    if (userData?.role !== "admin" && !isClassTeacher) {
      throw new Error("Only the section adviser can decline this request.");
    }

    setSavingEnrollmentStudentId(studentId);

    try {
      await update(ref(db), {
        [`classes/${classId}/joinRequests/${studentId}`]: null,
        [`users/${studentId}/pendingClassId`]: null,
        [`users/${studentId}/pendingClassCode`]: null
      });
    } finally {
      setSavingEnrollmentStudentId("");
    }
  };

  const approveParentAccountRequest = async (requestId) => {
    assertAdminAccess();

    const request = parentAccountRequests.find((item) => item.id === requestId) || null;
    if (!request) {
      throw new Error("Parent account request could not be found.");
    }

    const parentName = String(request.name || request.displayName || "").trim() || "Parent";
    const parentEmail = String(request.email || "").trim();
    const parentPassword = String(request.password || "").trim();
    const requestedStudentNumber = String(request.studentNumber || "").trim();

    if (!parentEmail) {
      throw new Error("Parent email is required.");
    }

    if (parentPassword.length < 6) {
      throw new Error("Parent password must be at least 6 characters long.");
    }

    if (!requestedStudentNumber) {
      throw new Error("Student ID is required before approving a parent account.");
    }

    const linkedStudent = enrichedStudents.find((student) => (
      String(student.studentNumber || "").trim().toLowerCase() === requestedStudentNumber.toLowerCase()
    )) || null;

    if (!linkedStudent) {
      throw new Error("No student matched the requested student ID.");
    }

    if (linkedStudent.parentId) {
      throw new Error("This student already has a linked parent.");
    }

    const createdAccount = await createManagedAccount({
      role: "parent",
      email: parentEmail,
      password: parentPassword,
      displayName: parentName
    });
    const now = new Date().toISOString();

    await update(ref(db), {
      [`users/${createdAccount.uid}`]: {
        displayName: parentName,
        name: parentName,
        email: parentEmail,
        role: "parent",
        studentId: linkedStudent.id,
        studentIds: {
          [linkedStudent.id]: true
        },
        createdAt: now,
        createdFromRequestId: requestId,
        updatedAt: now,
        updatedByName: userData?.displayName || userData?.email || currentUser?.email || "System User",
        updatedByRole: "admin"
      },
      [`students/${linkedStudent.id}/parentId`]: createdAccount.uid,
      [`students/${linkedStudent.id}/parentName`]: parentName,
      [`parentAccountRequests/${requestId}/status`]: "accepted",
      [`parentAccountRequests/${requestId}/acceptedAt`]: now,
      [`parentAccountRequests/${requestId}/acceptedBy`]: currentUser?.uid || "",
      [`parentAccountRequests/${requestId}/createdParentId`]: createdAccount.uid,
      [`parentAccountRequests/${requestId}/password`]: null
    });

    return createdAccount.uid;
  };

  const rejectParentAccountRequest = async (requestId) => {
    assertAdminAccess();

    const request = parentAccountRequests.find((item) => item.id === requestId) || null;
    if (!request) {
      throw new Error("Parent account request could not be found.");
    }

    await update(ref(db), {
      [`parentAccountRequests/${requestId}/status`]: "rejected",
      [`parentAccountRequests/${requestId}/rejectedAt`]: new Date().toISOString(),
      [`parentAccountRequests/${requestId}/rejectedBy`]: currentUser?.uid || "",
      [`parentAccountRequests/${requestId}/password`]: null
    });
  };

  const requestParentStudentAccess = async ({ studentNumber, studentName }) => {
    if (!currentUser || userData?.role !== "parent") {
      throw new Error("Only parent accounts can request student access.");
    }

    const trimmedStudentNumber = String(studentNumber || "").trim();
    const trimmedStudentName = String(studentName || "").trim().toLowerCase();

    if (!trimmedStudentNumber && !trimmedStudentName) {
      throw new Error("Enter a student ID number or student name.");
    }

    const student = enrichedStudents.find((item) => {
      const matchesNumber = trimmedStudentNumber
        && String(item.studentNumber || "").trim().toLowerCase() === trimmedStudentNumber.toLowerCase();
      const matchesName = trimmedStudentName
        && String(item.name || "").trim().toLowerCase() === trimmedStudentName;

      return matchesNumber || matchesName;
    }) || null;

    if (!student) {
      throw new Error("No student matched those details.");
    }

    if (student.parentId && student.parentId !== currentUser.uid) {
      throw new Error("This student already has a linked parent.");
    }

    if (student.parentId === currentUser.uid || userData?.studentIds?.[student.id]) {
      throw new Error("You already have access to this student.");
    }

    const parentAccessRequestRef = push(ref(db, "parentStudentAccessRequests"));
    const requestId = parentAccessRequestRef.key;

    if (!requestId) {
      throw new Error("Access request could not be created.");
    }

    const now = new Date().toISOString();

    await update(ref(db), {
      [`parentStudentAccessRequests/${requestId}`]: {
        parentId: currentUser.uid,
        parentName: userData?.displayName || userData?.name || currentUser.displayName || currentUser.email || "Parent",
        parentEmail: userData?.email || currentUser.email || "",
        studentId: student.id,
        studentName: student.name,
        studentNumber: student.studentNumber || "",
        status: "pending",
        requestedAt: now
      },
      [`students/${student.id}/parentAccessRequests/${currentUser.uid}`]: true,
      [`users/${currentUser.uid}/pendingStudentAccessRequests/${student.id}`]: true
    });

    return student;
  };

  const cancelParentStudentAccessRequest = async (requestId) => {
    if (!currentUser || userData?.role !== "parent") {
      throw new Error("Only parent accounts can cancel student access requests.");
    }

    const request = parentStudentAccessRequests.find((item) => item.id === requestId) || null;

    if (!request || request.parentId !== currentUser.uid || request.status !== "pending") {
      throw new Error("Pending access request could not be found.");
    }

    await update(ref(db), {
      [`students/${request.studentId}/parentAccessRequests/${currentUser.uid}`]: null,
      [`users/${currentUser.uid}/pendingStudentAccessRequests/${request.studentId}`]: null,
      [`parentStudentAccessRequests/${requestId}/status`]: "cancelled",
      [`parentStudentAccessRequests/${requestId}/cancelledAt`]: new Date().toISOString(),
      [`parentStudentAccessRequests/${requestId}/cancelledBy`]: currentUser.uid
    });
  };

  const approveParentStudentAccessRequest = async (requestId) => {
    assertAdminAccess();

    const request = parentStudentAccessRequests.find((item) => item.id === requestId) || null;
    if (!request) {
      throw new Error("Parent student access request could not be found.");
    }

    const student = enrichedStudents.find((item) => item.id === request.studentId) || null;
    if (student?.parentId && student.parentId !== request.parentId) {
      throw new Error("This student already has a linked parent.");
    }

    const now = new Date().toISOString();

    await update(ref(db), {
      [`students/${request.studentId}/parentId`]: request.parentId,
      [`students/${request.studentId}/parentName`]: request.parentName || "",
      [`students/${request.studentId}/parentAccessRequests/${request.parentId}`]: null,
      [`users/${request.parentId}/studentIds/${request.studentId}`]: true,
      [`users/${request.parentId}/studentId`]: request.studentId,
      [`users/${request.parentId}/pendingStudentAccessRequests/${request.studentId}`]: null,
      [`parentStudentAccessRequests/${requestId}/status`]: "accepted",
      [`parentStudentAccessRequests/${requestId}/acceptedAt`]: now,
      [`parentStudentAccessRequests/${requestId}/acceptedBy`]: currentUser?.uid || ""
    });
  };

  const rejectParentStudentAccessRequest = async (requestId) => {
    assertAdminAccess();

    const request = parentStudentAccessRequests.find((item) => item.id === requestId) || null;
    if (!request) {
      throw new Error("Parent student access request could not be found.");
    }

    await update(ref(db), {
      [`students/${request.studentId}/parentAccessRequests/${request.parentId}`]: null,
      [`users/${request.parentId}/pendingStudentAccessRequests/${request.studentId}`]: null,
      [`parentStudentAccessRequests/${requestId}/status`]: "rejected",
      [`parentStudentAccessRequests/${requestId}/rejectedAt`]: new Date().toISOString(),
      [`parentStudentAccessRequests/${requestId}/rejectedBy`]: currentUser?.uid || ""
    });
  };

  const updateStudentRecord = async (studentId, payload) => {
    return saveStudentRecord({ studentId, payload });
  };

  const saveDailyAttendanceRecord = async ({
    classId,
    className,
    subjectName,
    subjectCode = "",
    date,
    isNoClass = false,
    noClassReason = "",
    entries = []
  }) => {
    if (!classId || !date) {
      throw new Error("Section and date are required to save attendance.");
    }

    const normalizedSubjectName = String(subjectName || "").trim();
    const normalizedSubjectCode = String(subjectCode || "").trim().toUpperCase();
    const subjectKey = buildSubjectKey(normalizedSubjectCode || normalizedSubjectName);
    if (!subjectKey) {
      throw new Error("Subject is required to save attendance.");
    }

    const classroom = classes.find((item) => item.id === classId) || null;
    const now = new Date().toISOString();
    const attendanceKey = `${classId}-${subjectKey}-${date}`;
    const normalizedEntries = entries.reduce((records, entry) => {
      if (!entry.studentId) return records;

      records[entry.studentId] = {
        studentId: entry.studentId,
        studentName: entry.studentName || "Student",
        status: entry.status || "",
        remarks: entry.remarks || ""
      };

      return records;
    }, {});
    const nextRecord = {
      classId,
      className: className || classroom?.name || classroom?.section || "",
      subjectName: normalizedSubjectName,
      subjectCode: normalizedSubjectCode,
      subjectKey,
      date,
      status: isNoClass ? "no-class" : "recorded",
      noClassReason: isNoClass ? noClassReason.trim() : "",
      records: isNoClass ? {} : normalizedEntries,
      updatedAt: now,
      updatedByName: userData?.displayName || userData?.email || currentUser?.email || "System User",
      updatedByRole: userData?.role || "unknown"
    };
    const updates = {
      [`attendanceRecords/${classId}/${subjectKey}/${date}`]: nextRecord
    };

    entries.forEach((entry) => {
      const student = enrichedStudents.find((item) => item.id === entry.studentId);
      if (!student) return;

      const attendanceRate = calculateAttendanceRate({
        classId,
        studentId: entry.studentId,
        date,
        nextRecord,
        subjectName: normalizedSubjectName,
        subjectCode: normalizedSubjectCode
      });
      const nextAttendanceLabel = attendanceRate === null ? "N/A" : `${attendanceRate}%`;
      const existingSubjects = student.subjects || [];
      const subjectIndex = normalizedSubjectCode
        ? existingSubjects.findIndex((subject) => (
          String(subject.code || subject.subjectCode || "").trim().toUpperCase() === normalizedSubjectCode
        ))
        : existingSubjects.findIndex((subject) => (
          String(subject.name || "").trim().toLowerCase() === normalizedSubjectName.toLowerCase()
        ));
      const previousSubject = subjectIndex >= 0 ? existingSubjects[subjectIndex] : {};
      const nextSubject = {
        ...previousSubject,
        id: previousSubject.id || `subject-${subjectKey}`,
        code: normalizedSubjectCode || previousSubject.code || "",
        name: previousSubject.name || normalizedSubjectName,
        teacher: previousSubject.teacher || userData?.displayName || userData?.email || currentUser?.email || "Teacher",
        attendanceRate,
        attendanceLabel: nextAttendanceLabel
      };
      const nextSubjects = subjectIndex >= 0
        ? existingSubjects.map((subject, index) => (index === subjectIndex ? nextSubject : subject))
        : [...existingSubjects, nextSubject];
      const overallAttendanceRate = averageValues(nextSubjects.map((subject) => subject.attendanceRate));
      const overallAttendanceLabel = overallAttendanceRate === null ? "" : `${overallAttendanceRate}%`;
      const performanceStatus = computePerformanceStatus({
        gpa: student.gpa,
        attendanceRate: overallAttendanceRate,
        subjects: nextSubjects
      });

      updates[`students/${entry.studentId}/subjects`] = nextSubjects;
      updates[`students/${entry.studentId}/attendance`] = overallAttendanceLabel;
      updates[`students/${entry.studentId}/attendanceRate`] = overallAttendanceRate;
      updates[`students/${entry.studentId}/performanceStatus`] = performanceStatus;
      updates[`students/${entry.studentId}/updatedAt`] = now;
      updates[`students/${entry.studentId}/updatedByName`] = userData?.displayName || userData?.email || currentUser?.email || "System User";
      updates[`students/${entry.studentId}/updatedByRole`] = userData?.role || "unknown";
      updates[`students/${entry.studentId}/lastUpdateLabel`] = formatShortDate(now);
    });

    setSavingAttendanceKey(attendanceKey);

    try {
      await update(ref(db), updates);
      return nextRecord;
    } finally {
      setSavingAttendanceKey("");
    }
  };

  const saveClassFee = async ({ classId, feeId = "", payload }) => {
    if (!currentUser) {
      throw new Error("Sign in before saving a fee.");
    }

    const classroom = rawClasses.find((item) => item.id === classId) || null;
    if (!classroom) {
      throw new Error("Advisory class not found.");
    }

    const isAdmin = userData?.role === "admin";
    const isAssignedTeacher = userData?.role === "teacher" && [
      classroom.teacherId,
      classroom.teacherUid,
      classroom.adviserId
    ].includes(currentUser.uid);

    if (!isAdmin && !isAssignedTeacher) {
      throw new Error("Only the assigned adviser can manage fees for this class.");
    }

    const feeName = String(payload?.name || "").trim();
    const amount = Number(payload?.amount);
    const dueDate = String(payload?.dueDate || "").trim();
    const notes = String(payload?.notes || "").trim();

    if (!feeName) {
      throw new Error("Fee name is required.");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter a valid fee amount.");
    }

    const targetFeeId = feeId || push(ref(db, `classes/${classId}/fees`)).key;
    if (!targetFeeId) {
      throw new Error("Fee ID could not be generated.");
    }

    const existingFee = classroom.fees?.[targetFeeId] || null;
    const now = new Date().toISOString();
    const actorName = userData?.displayName || userData?.email || currentUser.email || "System User";
    const actorRole = userData?.role || "teacher";

    await update(ref(db), {
      [`classes/${classId}/fees/${targetFeeId}`]: {
        ...(existingFee || {}),
        name: feeName,
        amount: Number(amount.toFixed(2)),
        dueDate,
        notes,
        status: existingFee?.status || "active",
        createdAt: existingFee?.createdAt || now,
        createdBy: existingFee?.createdBy || currentUser.uid,
        updatedAt: now,
        updatedByName: actorName,
        updatedByRole: actorRole
      }
    });

    return targetFeeId;
  };

  const deleteClassFee = async ({ classId, feeId }) => {
    if (!currentUser) {
      throw new Error("Sign in before deleting a fee.");
    }

    const classroom = rawClasses.find((item) => item.id === classId) || null;
    if (!classroom) {
      throw new Error("Advisory class not found.");
    }

    const isAdmin = userData?.role === "admin";
    const isAssignedTeacher = userData?.role === "teacher" && [
      classroom.teacherId,
      classroom.teacherUid,
      classroom.adviserId
    ].includes(currentUser.uid);

    if (!isAdmin && !isAssignedTeacher) {
      throw new Error("Only the assigned adviser can manage fees for this class.");
    }

    if (!String(feeId || "").trim()) {
      throw new Error("Fee record not found.");
    }

    await update(ref(db), {
      [`classes/${classId}/fees/${feeId}`]: null
    });
  };

  const saveClassFeePayment = async ({ classId, feeId, studentId, paid }) => {
    if (!currentUser) {
      throw new Error("Sign in before updating fee payments.");
    }

    const classroom = rawClasses.find((item) => item.id === classId) || null;
    if (!classroom) {
      throw new Error("Advisory class not found.");
    }

    const fee = classroom.fees?.[feeId] || null;
    if (!fee) {
      throw new Error("Fee record not found.");
    }

    const isAdmin = userData?.role === "admin";
    const isAssignedTeacher = userData?.role === "teacher" && [
      classroom.teacherId,
      classroom.teacherUid,
      classroom.adviserId
    ].includes(currentUser.uid);

    if (!isAdmin && !isAssignedTeacher) {
      throw new Error("Only the assigned adviser can manage fee payments for this class.");
    }

    const student = enrichedStudents.find((item) => item.id === studentId) || null;
    if (!student) {
      throw new Error("Student record not found.");
    }

    const paymentPath = `classes/${classId}/fees/${feeId}/payments/${studentId}`;

    if (!paid) {
      await update(ref(db), {
        [paymentPath]: null
      });
      return null;
    }

    const now = new Date().toISOString();
    const actorName = userData?.displayName || userData?.email || currentUser.email || "System User";
    const actorRole = userData?.role || "teacher";

    await update(ref(db), {
      [paymentPath]: {
        studentId,
        studentName: student.name || formatPersonName(student),
        paid: true,
        paidAt: now,
        updatedAt: now,
        updatedByName: actorName,
        updatedByRole: actorRole
      }
    });

    return true;
  };

  const saveTeacherRecord = async ({ teacherId, payload }) => {
    assertAdminAccess();

    const isNewTeacher = !teacherId;
    const teacherName = payload.name?.trim() || "Teacher";
    const teacherEmail = payload.email?.trim() || "";
    let targetTeacherId = teacherId;

    if (isNewTeacher) {
      const teacherPassword = String(payload.password || "").trim();

      if (!teacherEmail) {
        throw new Error("Teacher email is required to create the account.");
      }

      if (teacherPassword.length < 6) {
        throw new Error("Teacher password must be at least 6 characters long.");
      }

      const createdAccount = await createManagedAccount({
        role: "teacher",
        email: teacherEmail,
        password: teacherPassword,
        displayName: teacherName
      });

      targetTeacherId = createdAccount.uid;
    } else {
      await syncManagedAccount({
        uid: teacherId,
        email: teacherEmail,
        displayName: teacherName
      });
    }

    if (!targetTeacherId) {
      throw new Error("Teacher ID could not be generated.");
    }

    setSavingTeacherId(targetTeacherId);

    const existingTeacher = users.find((user) => user.id === targetTeacherId) || null;
    const existingTeacherData = existingTeacher ? { ...existingTeacher } : {};
    delete existingTeacherData.id;

    const teacherSubjects = normalizeTeacherSubjectRecords(payload.subjects);
    const teacherSubjectClassIds = teacherSubjects.reduce((subjectMap, subject, index) => {
      const subjectKey = buildTeacherSubjectStorageKey(subject);
      if (!subjectKey) return subjectMap;

      const classIds = Array.isArray(payload.subjects?.[index]?.classIds)
        ? payload.subjects[index].classIds
        : [];
      const normalizedClassIds = [...new Set(
        classIds
          .map((classId) => String(classId || "").trim())
          .filter((classId) => classes.some((classroom) => classroom.id === classId))
      )];

      subjectMap[subjectKey] = normalizedClassIds.reduce((classMap, classId) => ({
        ...classMap,
        [classId]: true
      }), {});
      return subjectMap;
    }, {});
    const now = new Date().toISOString();
    const advisoryClassId = String(payload.advisoryClassId || "").trim();
    const advisoryClass = classes.find((classroom) => classroom.id === advisoryClassId) || null;
    const previousAdvisoryClassId = existingTeacher?.advisoryClassId || "";

    try {
      const updates = {
        [`users/${targetTeacherId}`]: {
          ...existingTeacherData,
          displayName: teacherName,
          name: teacherName,
          email: teacherEmail,
          role: "teacher",
          subjects: teacherSubjects,
          subjectClassIds: teacherSubjectClassIds,
          advisoryClassId,
          advisoryClassName: advisoryClass?.name || advisoryClass?.section || "",
          updatedAt: now,
          updatedByName: userData?.displayName || userData?.email || currentUser?.email || "System User",
          updatedByRole: userData?.role || "unknown"
        }
      };

      if (previousAdvisoryClassId && previousAdvisoryClassId !== advisoryClassId) {
        updates[`classes/${previousAdvisoryClassId}/teacherId`] = null;
        updates[`classes/${previousAdvisoryClassId}/teacherUid`] = null;
        updates[`classes/${previousAdvisoryClassId}/adviserId`] = null;
        updates[`classes/${previousAdvisoryClassId}/teacherEmail`] = "";
        updates[`classes/${previousAdvisoryClassId}/adviserEmail`] = "";
        updates[`classes/${previousAdvisoryClassId}/teacherName`] = "Teacher not assigned";
        updates[`classes/${previousAdvisoryClassId}/adviserName`] = "Teacher not assigned";
      }

      if (advisoryClassId) {
        updates[`classes/${advisoryClassId}/teacherId`] = targetTeacherId;
        updates[`classes/${advisoryClassId}/teacherUid`] = targetTeacherId;
        updates[`classes/${advisoryClassId}/adviserId`] = targetTeacherId;
        updates[`classes/${advisoryClassId}/teacherEmail`] = teacherEmail;
        updates[`classes/${advisoryClassId}/adviserEmail`] = teacherEmail;
        updates[`classes/${advisoryClassId}/teacherName`] = teacherName;
        updates[`classes/${advisoryClassId}/adviserName`] = teacherName;
        updates[`classes/${advisoryClassId}/updatedAt`] = now;
        updates[`classes/${advisoryClassId}/updatedByName`] = userData?.displayName || userData?.email || currentUser?.email || "System User";
        updates[`classes/${advisoryClassId}/updatedByRole`] = userData?.role || "unknown";
      }

      await update(ref(db), updates);
      return targetTeacherId;
    } finally {
      setSavingTeacherId("");
    }
  };

  const deleteStudentRecord = async (studentId) => {
    assertAdminAccess();

    const targetStudentId = String(studentId || "").trim();
    if (!targetStudentId) {
      throw new Error("Select a student to delete.");
    }

    const student = rawStudents.find((item) => item.id === targetStudentId) || null;
    const studentUser = users.find((user) => user.id === targetStudentId) || null;
    const updates = {
      [`students/${targetStudentId}`]: null,
      [`users/${targetStudentId}`]: null
    };

    classes.forEach((classroom) => {
      if (classroom.studentIds?.[targetStudentId]) {
        updates[`classes/${classroom.id}/studentIds/${targetStudentId}`] = null;
      }

      if (classroom.joinRequests?.[targetStudentId]) {
        updates[`classes/${classroom.id}/joinRequests/${targetStudentId}`] = null;
      }
    });

    users
      .filter((user) => user.role === "parent")
      .forEach((parent) => {
        if (parent.studentId === targetStudentId) {
          updates[`users/${parent.id}/studentId`] = null;
        }

        if (parent.studentIds?.[targetStudentId]) {
          updates[`users/${parent.id}/studentIds/${targetStudentId}`] = null;
        }

        if (parent.pendingStudentAccessRequests?.[targetStudentId]) {
          updates[`users/${parent.id}/pendingStudentAccessRequests/${targetStudentId}`] = null;
        }
      });

    parentStudentAccessRequests.forEach((request) => {
      if (request.studentId === targetStudentId) {
        updates[`parentStudentAccessRequests/${request.id}`] = null;
      }
    });

    const parentAccessRequests = student?.parentAccessRequests && typeof student.parentAccessRequests === "object"
      ? Object.keys(student.parentAccessRequests)
      : [];
    parentAccessRequests.forEach((parentId) => {
      updates[`users/${parentId}/pendingStudentAccessRequests/${targetStudentId}`] = null;
    });

    setSavingStudentId(targetStudentId);

    try {
      await update(ref(db), updates);

      if (studentUser) {
        await cleanupManagedAccountAfterRecordDelete({ uid: targetStudentId, role: "student" });
      }

      return targetStudentId;
    } finally {
      setSavingStudentId("");
    }
  };

  const deleteTeacherRecord = async (teacherId) => {
    assertAdminAccess();

    const targetTeacherId = String(teacherId || "").trim();
    if (!targetTeacherId) {
      throw new Error("Select a teacher to delete.");
    }

    const teacher = users.find((user) => user.id === targetTeacherId) || null;
    const updates = {
      [`users/${targetTeacherId}`]: null
    };
    const teacherClassIds = [];

    classes.forEach((classroom) => {
      const isAssignedTeacher = [
        classroom.teacherId,
        classroom.teacherUid,
        classroom.adviserId,
        classroom.ownerId
      ].includes(targetTeacherId);

      if (!isAssignedTeacher) return;

      teacherClassIds.push(classroom.id);
      updates[`classes/${classroom.id}/teacherId`] = null;
      updates[`classes/${classroom.id}/teacherUid`] = null;
      updates[`classes/${classroom.id}/adviserId`] = null;
      updates[`classes/${classroom.id}/teacherEmail`] = "";
      updates[`classes/${classroom.id}/adviserEmail`] = "";
      updates[`classes/${classroom.id}/teacherName`] = "Teacher not assigned";
      updates[`classes/${classroom.id}/adviserName`] = "Teacher not assigned";
    });

    rawStudents.forEach((student) => {
      if (
        student.teacherId === targetTeacherId
        || teacherClassIds.includes(student.classId || student.classKey || student.sectionId)
      ) {
        updates[`students/${student.id}/teacherId`] = null;
        updates[`students/${student.id}/teacherEmail`] = "";
        updates[`students/${student.id}/teacherName`] = "Teacher not assigned";
      }
    });

    setSavingTeacherId(targetTeacherId);

    try {
      await update(ref(db), updates);

      if (teacher) {
        await cleanupManagedAccountAfterRecordDelete({ uid: targetTeacherId, role: "teacher" });
      }

      return targetTeacherId;
    } finally {
      setSavingTeacherId("");
    }
  };

  const deleteParentRecord = async (parentId) => {
    assertAdminAccess();

    const targetParentId = String(parentId || "").trim();
    if (!targetParentId) {
      throw new Error("Select a parent to delete.");
    }

    const parent = users.find((user) => user.id === targetParentId && user.role === "parent") || null;
    const updates = {
      [`users/${targetParentId}`]: null
    };

    rawStudents.forEach((student) => {
      if (student.parentId === targetParentId) {
        updates[`students/${student.id}/parentId`] = null;
        updates[`students/${student.id}/parentName`] = "";
      }

      if (student.parentAccessRequests?.[targetParentId]) {
        updates[`students/${student.id}/parentAccessRequests/${targetParentId}`] = null;
      }
    });

    parentStudentAccessRequests.forEach((request) => {
      if (request.parentId === targetParentId) {
        updates[`parentStudentAccessRequests/${request.id}`] = null;
      }
    });

    await update(ref(db), updates);

    if (parent) {
      await cleanupManagedAccountAfterRecordDelete({ uid: targetParentId, role: "parent" });
    }

    return targetParentId;
  };

  const saveTeacherSubjects = async (subjects) => {
    if (!currentUser || userData?.role !== "teacher") {
      throw new Error("Only teacher accounts can update their subjects.");
    }

    const teacherUser = users.find((user) => user.id === currentUser.uid) || userData || {};
    const previousSubjects = normalizeTeacherSubjectRecords(teacherUser.subjects);
    const teacherSubjects = normalizeTeacherSubjectRecords(subjects);
    const nextSubjectKeys = new Set(teacherSubjects.map((subject) => buildTeacherSubjectStorageKey(subject)));
    const now = new Date().toISOString();
    const updates = {
      [`users/${currentUser.uid}/subjects`]: teacherSubjects,
      [`users/${currentUser.uid}/updatedAt`]: now,
      [`users/${currentUser.uid}/updatedByName`]: userData?.displayName || userData?.email || currentUser?.email || "Teacher",
      [`users/${currentUser.uid}/updatedByRole`]: "teacher"
    };

    previousSubjects
      .filter((subject) => !nextSubjectKeys.has(buildTeacherSubjectStorageKey(subject)))
      .forEach((subject) => {
        updates[`users/${currentUser.uid}/subjectClassIds/${buildTeacherSubjectStorageKey(subject)}`] = null;
      });

    setSavingTeacherId(currentUser.uid);

    try {
      await update(ref(db), updates);

      return teacherSubjects;
    } finally {
      setSavingTeacherId("");
    }
  };

  const saveTeacherSubjectClasses = async ({ subjectName, subjectCode = "", classIds = [], subjectNames = [] }) => {
    if (!currentUser || userData?.role !== "teacher") {
      throw new Error("Only teacher accounts can assign sections to their subjects.");
    }

    const normalizedSubjectName = String(subjectName || "").trim();
    const normalizedSubjectCode = String(subjectCode || "").trim().toUpperCase();
    const subjectKey = buildTeacherSubjectStorageKey({
      code: normalizedSubjectCode,
      name: normalizedSubjectName
    });
    const teacherUser = users.find((user) => user.id === currentUser.uid) || userData || {};
    const teacherSubjects = normalizeTeacherSubjectRecords([
      ...(Array.isArray(teacherUser.subjects) ? teacherUser.subjects : []),
      ...subjectNames
    ]);
    const canManageSubject = teacherSubjects.some((subject) => (
      (normalizedSubjectCode && subject.code.toUpperCase() === normalizedSubjectCode)
      || subject.name.toLowerCase() === normalizedSubjectName.toLowerCase()
    ));

    if (!subjectKey || !canManageSubject) {
      throw new Error("Select one of your assigned subjects before assigning sections.");
    }

    const allowedClassIds = new Set(classes.map((classroom) => classroom.id));
    const normalizedClassIds = classIds
      .map((classId) => String(classId || "").trim())
      .filter((classId, index, list) => classId && allowedClassIds.has(classId) && list.indexOf(classId) === index);
    const classMap = normalizedClassIds.reduce((records, classId) => ({
      ...records,
      [classId]: true
    }), {});
    const now = new Date().toISOString();

    setSavingTeacherId(currentUser.uid);

    try {
      await update(ref(db), {
        [`users/${currentUser.uid}/subjectClassIds/${subjectKey}`]: classMap,
        [`users/${currentUser.uid}/updatedAt`]: now,
        [`users/${currentUser.uid}/updatedByName`]: userData?.displayName || userData?.email || currentUser?.email || "Teacher",
        [`users/${currentUser.uid}/updatedByRole`]: "teacher"
      });

      return classMap;
    } finally {
      setSavingTeacherId("");
    }
  };

  const saveSubjectScores = async ({ studentId, subjectName, subjectCode = "", scores = {} }) => {
    if (!currentUser || userData?.role !== "teacher") {
      throw new Error("Only teacher accounts can update subject scores.");
    }

    const normalizedSubjectName = String(subjectName || "").trim();
    const normalizedSubjectCode = String(subjectCode || "").trim().toUpperCase();
    const teacherUser = users.find((user) => user.id === currentUser.uid) || userData || {};
    const teacherSubjectRecords = normalizeTeacherSubjectRecords(teacherUser.subjects);
    const matchedTeacherSubject = normalizedSubjectCode
      ? teacherSubjectRecords.find((subject) => subject.code.toUpperCase() === normalizedSubjectCode) || null
      : teacherSubjectRecords.find((subject) => subject.name.toLowerCase() === normalizedSubjectName.toLowerCase()) || null;
    const canManageSubject = Boolean(matchedTeacherSubject);

    if ((!normalizedSubjectName && !normalizedSubjectCode) || !canManageSubject) {
      throw new Error("Select one of your assigned subjects before saving scores.");
    }

    const targetStudentId = String(studentId || "").trim();
    const existingStudent = rawStudents.find((student) => student.id === targetStudentId) || null;
    const enrichedStudent = enrichedStudents.find((student) => student.id === targetStudentId) || null;

    if (!targetStudentId || !existingStudent || !enrichedStudent) {
      throw new Error("Student record could not be found.");
    }

    const teacherName = userData?.displayName || userData?.name || userData?.email || currentUser.email || "Teacher";
    const existingSubjects = enrichedStudent.subjects || [];
    const resolvedSubjectName = matchedTeacherSubject?.name || normalizedSubjectName;
    const resolvedSubjectCode = matchedTeacherSubject?.code || normalizedSubjectCode;
    const subjectIndex = resolvedSubjectCode
      ? existingSubjects.findIndex((subject) => (
        String(subject.code || subject.subjectCode || "").trim().toUpperCase() === resolvedSubjectCode
      ))
      : existingSubjects.findIndex((subject) => (
        String(subject.name || "").trim().toLowerCase() === resolvedSubjectName.toLowerCase()
      ));
    const previousSubject = subjectIndex >= 0 ? existingSubjects[subjectIndex] : {};
    const gradeWeights = normalizeGradeWeights(scores.gradeWeights || previousSubject.gradeWeights);
    const quarters = normalizeQuarterScores(
      { ...scores, quarters: scores.quarters || createDefaultQuarterScores() },
      previousSubject
    );
    const quarterValues = TERM_KEYS.map((quarterKey) => calculateQuarterGrade(quarters[quarterKey], gradeWeights));
    const finalGrade = calculateFinalGrade(quarterValues);
    const nextSubject = {
      ...previousSubject,
      id: previousSubject.id || `subject-${buildSubjectKey(resolvedSubjectCode || resolvedSubjectName)}`,
      code: resolvedSubjectCode,
      name: resolvedSubjectName,
      teacher: teacherName,
      gradeWeights,
      activities: quarters.q1.performanceTask.activities,
      quizzes: quarters.q1.writtenWork.quizzes,
      exams: quarters.q1.finalExam.exams,
      quarters,
      q1: quarterValues[0],
      q2: quarterValues[1],
      q3: quarterValues[2],
      finalGrade,
      status: finalGrade !== null && finalGrade >= 75 ? "Passed" : "Needs Attention"
    };
    const nextSubjects = subjectIndex >= 0
      ? existingSubjects.map((subject, index) => (index === subjectIndex ? nextSubject : subject))
      : [...existingSubjects, nextSubject];
    const subjectAverage = averageValues(nextSubjects.map((subject) => subject.finalGrade));
    const performanceStatus = computePerformanceStatus({
      gpa: subjectAverage,
      attendanceRate: enrichedStudent.attendanceRate,
      subjects: nextSubjects
    });
    const now = new Date().toISOString();
    const existingActivities = Array.isArray(existingStudent.activities)
      ? existingStudent.activities
      : Object.values(existingStudent.activities || {});
    const activityEntry = {
      date: formatShortDate(now),
      activity: `${normalizedSubjectName} Scores`,
      result: finalGrade === null ? "Subject scores updated" : `Final grade ${finalGrade}`,
      remarks: "Subject scores updated by teacher"
    };

    setSavingStudentId(targetStudentId);

    try {
      await update(ref(db), {
        [`students/${targetStudentId}/subjects`]: nextSubjects,
        [`students/${targetStudentId}/gpa`]: subjectAverage,
        [`students/${targetStudentId}/performanceStatus`]: performanceStatus,
        [`students/${targetStudentId}/activities`]: [activityEntry, ...existingActivities].slice(0, 6),
        [`students/${targetStudentId}/updatedAt`]: now,
        [`students/${targetStudentId}/updatedByName`]: teacherName,
        [`students/${targetStudentId}/updatedByRole`]: "teacher",
        [`students/${targetStudentId}/lastUpdateLabel`]: formatShortDate(now)
      });

      return nextSubject;
    } finally {
      setSavingStudentId("");
    }
  };

  const resetUserPassword = async ({ userId, password }) => {
    assertAdminAccess();

    if (!userId?.trim()) {
      throw new Error("A user account is required before the password can be reset.");
    }

    if (String(password || "").trim().length < 6) {
      throw new Error("Password must be at least 6 characters long.");
    }

    await updateManagedAccount({
      uid: userId.trim(),
      password: String(password).trim()
    });
  };

  const value = {
    loading,
    error,
    users,
    gradeLevels,
    gradeLevelRecords,
    classes,
    students: enrichedStudents,
    repositorySummary,
    classReports,
    teacherClassReports,
    teacherUsers,
    attendanceRecords,
    parentAccountRequests,
    parentStudentAccessRequests,
    currentStudent,
    linkedStudent,
    linkedStudents,
    savingStudentId,
    savingTeacherId,
    savingGradeLevelName,
    savingAttendanceKey,
    savingClass,
    savingEnrollmentStudentId,
    getTeacherClasses,
    getStudentsForClass,
    getClassAttendanceRecords,
    getAttendanceRecord,
    findStudentById,
    resetUserPassword,
    saveDailyAttendanceRecord,
    addStudentToClass,
    importBulkStudents,
    saveClassFee,
    saveClassFeePayment,
    saveGradeLevelRecord,
    deactivateGradeLevelRecord,
    saveClassRecord,
    createClassRecord,
    requestClassJoin,
    approveClassJoinRequest,
    rejectClassJoinRequest,
    approveParentAccountRequest,
    rejectParentAccountRequest,
    requestParentStudentAccess,
    cancelParentStudentAccessRequest,
    approveParentStudentAccessRequest,
    rejectParentStudentAccessRequest,
    deleteStudentRecord,
    deleteTeacherRecord,
    deleteParentRecord,
    saveStudentRecord,
    saveTeacherRecord,
    saveTeacherSubjects,
    saveTeacherSubjectClasses,
    saveSubjectScores,
    deleteClassFee,
    updateStudentRecord
  };

  return (
    <SchoolDataContext.Provider value={value}>
      {children}
    </SchoolDataContext.Provider>
  );
};
