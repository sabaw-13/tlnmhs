import React, { createContext, useContext, useEffect, useState } from "react";
import { onValue, ref, update } from "firebase/database";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import {
  buildClassReport,
  buildRepositorySummary,
  buildStudentRecord,
  clamp,
  computePerformanceStatus,
  formatShortDate,
  normalizeCollection,
  toNumber
} from "../utils/reporting";
import { createManagedAccount, updateManagedAccount } from "../utils/adminAccounts";

const SchoolDataContext = createContext();
const ATTENDED_ATTENDANCE_STATUSES = new Set(["present", "late", "excused"]);

const averageValues = (values) => {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (!validValues.length) return null;

  const total = validValues.reduce((sum, value) => sum + value, 0);
  return Number((total / validValues.length).toFixed(1));
};
const normalizeTeacherSubjects = (subjectSource) => {
  if (!subjectSource) return [];

  if (Array.isArray(subjectSource)) {
    return subjectSource
      .map((subject) => {
        if (typeof subject === "string") return subject.trim();
        if (subject && typeof subject === "object") return String(subject.name || subject.subject || "").trim();
        return "";
      })
      .filter(Boolean);
  }

  if (typeof subjectSource === "string") {
    return subjectSource
      .split(",")
      .map((subject) => subject.trim())
      .filter(Boolean);
  }

  if (typeof subjectSource === "object") {
    return Object.values(subjectSource)
      .map((subject) => {
        if (typeof subject === "string") return subject.trim();
        if (subject && typeof subject === "object") return String(subject.name || subject.subject || "").trim();
        return "";
      })
      .filter(Boolean);
  }

  return [];
};

export const useSchoolData = () => useContext(SchoolDataContext);

export const SchoolDataProvider = ({ children }) => {
  const { currentUser, userData, loading: authLoading } = useAuth();
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [rawStudents, setRawStudents] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingStudentId, setSavingStudentId] = useState("");
  const [savingTeacherId, setSavingTeacherId] = useState("");
  const [savingAttendanceKey, setSavingAttendanceKey] = useState("");

  const assertAdminAccess = () => {
    if (userData?.role !== "admin") {
      throw new Error("Only admin accounts can manage student and teacher credentials.");
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
      setClasses([]);
      setRawStudents([]);
      setAttendanceRecords({});
      setError("");
      setLoading(false);
      return undefined;
    }

    const initialState = {
      users: false,
      classes: false,
      students: false,
      attendance: false
    };

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

    const unsubscribeClasses = onValue(
      ref(db, "classes"),
      (snapshot) => {
        setClasses(normalizeCollection(snapshot.val()));
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

    return () => {
      unsubscribeUsers();
      unsubscribeClasses();
      unsubscribeStudents();
      unsubscribeAttendance();
    };
  }, [authLoading, currentUser]);

  const enrichedStudents = rawStudents.map((student) => buildStudentRecord({ student, users, classes }));

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

    return matchedClasses.length > 0 ? matchedClasses : classes;
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

  const linkedStudent = userData?.studentId
    ? findStudentById(userData.studentId)
    : enrichedStudents.find((student) => student.parentId === currentUser?.uid)
      || null;

  const teacherUsers = users
    .filter((user) => user.role === "teacher")
    .map((teacher) => ({
      id: teacher.id,
      name: teacher.displayName || teacher.name || teacher.email || "Teacher",
      email: teacher.email || "",
      subjects: normalizeTeacherSubjects(teacher.subjects),
      classCount: classes.filter((classroom) => (
        classroom.teacherId === teacher.id
        || classroom.teacherUid === teacher.id
        || classroom.adviserId === teacher.id
        || classroom.ownerId === teacher.id
        || (teacher.email && [classroom.teacherEmail, classroom.adviserEmail].includes(teacher.email))
      )).length
    }));

  const getClassAttendanceRecords = (classId) => {
    const classRecords = attendanceRecords?.[classId] || {};

    return Object.entries(classRecords)
      .map(([date, record]) => ({
        date,
        ...(record && typeof record === "object" ? record : {})
      }))
      .sort((left, right) => String(right.date).localeCompare(String(left.date)));
  };

  const getAttendanceRecord = (classId, date) => {
    if (!classId || !date) return null;

    const record = attendanceRecords?.[classId]?.[date];
    if (!record || typeof record !== "object") return null;

    return record.date ? record : { date, ...record };
  };

  const calculateAttendanceRate = ({ classId, studentId, date, nextRecord }) => {
    const classRecords = {
      ...(attendanceRecords?.[classId] || {}),
      [date]: nextRecord
    };
    const countedRecords = Object.values(classRecords).filter((record) => (
      record
      && typeof record === "object"
      && record.status !== "no-class"
      && record.records?.[studentId]
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
    const isNewStudent = !studentId;
    const trimmedStudentNumber = String(payload.studentNumber || "").trim();
    const trimmedStudentEmail = String(payload.email || "").trim();
    const trimmedStudentName = payload.name?.trim() || "Unnamed Student";
    let targetStudentId = studentId;

    if (isNewStudent) {
      assertAdminAccess();

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
    } else if (userData?.role === "admin" && users.some((user) => user.id === studentId)) {
      await syncManagedAccount({
        uid: studentId,
        email: trimmedStudentEmail,
        displayName: trimmedStudentName
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
      const teacherDetails = getTeacherDetails({
        teacherId: payload.teacherId || existingStudent?.teacherId,
        teacherEmail: payload.teacherEmail || existingStudent?.teacherEmail,
        teacherName: payload.teacherName || existingStudent?.teacherName,
        classroom
      });
      const normalizedSubjects = (payload.subjects || [])
        .filter((subject) => subject.name?.trim())
        .map((subject, index) => {
          const quarterGrades = [
            toNumber(subject.q1),
            toNumber(subject.q2),
            toNumber(subject.q3),
            toNumber(subject.q4)
          ].filter((grade) => Number.isFinite(grade));
          const finalGrade = quarterGrades.length
            ? Number((quarterGrades.reduce((sum, grade) => sum + grade, 0) / quarterGrades.length).toFixed(1))
            : null;

          return {
            id: subject.id || `subject-${index + 1}`,
            name: subject.name.trim(),
            teacher: subject.teacher?.trim() || teacherDetails.teacherName,
            q1: toNumber(subject.q1),
            q2: toNumber(subject.q2),
            q3: toNumber(subject.q3),
            q4: toNumber(subject.q4),
            finalGrade,
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
      const updates = {
        [`students/${targetStudentId}`]: {
          ...existingStudentData,
          name: trimmedStudentName,
          email: trimmedStudentEmail,
          studentNumber: trimmedStudentNumber || existingStudent?.studentNumber || "",
          parentName: payload.parentName?.trim() || "",
          parentId: payload.parentId?.trim() || null,
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
          email: trimmedStudentEmail,
          role: "student",
          studentId: targetStudentId,
          studentNumber: trimmedStudentNumber || existingUser?.studentNumber || "",
          parentId: payload.parentId?.trim() || null,
          parentName: payload.parentName?.trim() || "",
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

  const updateStudentRecord = async (studentId, payload) => {
    return saveStudentRecord({ studentId, payload });
  };

  const saveDailyAttendanceRecord = async ({
    classId,
    className,
    date,
    isNoClass = false,
    noClassReason = "",
    entries = []
  }) => {
    if (!classId || !date) {
      throw new Error("Class and date are required to save attendance.");
    }

    const classroom = classes.find((item) => item.id === classId) || null;
    const now = new Date().toISOString();
    const attendanceKey = `${classId}-${date}`;
    const normalizedEntries = entries.reduce((records, entry) => {
      if (!entry.studentId) return records;

      records[entry.studentId] = {
        studentId: entry.studentId,
        studentName: entry.studentName || "Student",
        status: entry.status || "present",
        remarks: entry.remarks || ""
      };

      return records;
    }, {});
    const nextRecord = {
      classId,
      className: className || classroom?.name || classroom?.section || "",
      date,
      status: isNoClass ? "no-class" : "recorded",
      noClassReason: isNoClass ? noClassReason.trim() : "",
      records: isNoClass ? {} : normalizedEntries,
      updatedAt: now,
      updatedByName: userData?.displayName || userData?.email || currentUser?.email || "System User",
      updatedByRole: userData?.role || "unknown"
    };
    const updates = {
      [`attendanceRecords/${classId}/${date}`]: nextRecord
    };

    entries.forEach((entry) => {
      const student = enrichedStudents.find((item) => item.id === entry.studentId);
      if (!student) return;

      const attendanceRate = calculateAttendanceRate({
        classId,
        studentId: entry.studentId,
        date,
        nextRecord
      });
      const nextAttendanceLabel = attendanceRate === null ? "" : `${attendanceRate}%`;
      const performanceStatus = computePerformanceStatus({
        gpa: student.gpa,
        attendanceRate,
        subjects: student.subjects
      });

      updates[`students/${entry.studentId}/attendance`] = nextAttendanceLabel;
      updates[`students/${entry.studentId}/attendanceRate`] = attendanceRate;
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

    const teacherSubjects = normalizeTeacherSubjects(payload.subjects);
    const now = new Date().toISOString();

    try {
      const updates = {
        [`users/${targetTeacherId}`]: {
          ...existingTeacherData,
          displayName: teacherName,
          name: teacherName,
          email: teacherEmail,
          role: "teacher",
          subjects: teacherSubjects,
          updatedAt: now,
          updatedByName: userData?.displayName || userData?.email || currentUser?.email || "System User",
          updatedByRole: userData?.role || "unknown"
        }
      };

      await update(ref(db), updates);
      return targetTeacherId;
    } finally {
      setSavingTeacherId("");
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
    classes,
    students: enrichedStudents,
    repositorySummary,
    classReports,
    teacherClassReports,
    teacherUsers,
    attendanceRecords,
    currentStudent,
    linkedStudent,
    savingStudentId,
    savingTeacherId,
    savingAttendanceKey,
    getTeacherClasses,
    getStudentsForClass,
    getClassAttendanceRecords,
    getAttendanceRecord,
    findStudentById,
    resetUserPassword,
    saveDailyAttendanceRecord,
    saveStudentRecord,
    saveTeacherRecord,
    updateStudentRecord
  };

  return (
    <SchoolDataContext.Provider value={value}>
      {children}
    </SchoolDataContext.Provider>
  );
};
