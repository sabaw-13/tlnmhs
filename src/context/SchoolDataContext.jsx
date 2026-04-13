import React, { createContext, useContext, useEffect, useState } from "react";
import { onValue, push, ref, update } from "firebase/database";
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

const SchoolDataContext = createContext();
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingStudentId, setSavingStudentId] = useState("");

  useEffect(() => {
    if (authLoading) return undefined;

    if (!currentUser) {
      setUsers([]);
      setClasses([]);
      setRawStudents([]);
      setError("");
      setLoading(false);
      return undefined;
    }

    const initialState = {
      users: false,
      classes: false,
      students: false
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

    return () => {
      unsubscribeUsers();
      unsubscribeClasses();
      unsubscribeStudents();
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
    const generatedStudentRef = studentId ? null : push(ref(db, "students"));
    const targetStudentId = studentId || generatedStudentRef?.key;

    if (!targetStudentId) {
      throw new Error("Student ID could not be generated.");
    }

    setSavingStudentId(targetStudentId);

    try {
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
          name: payload.name?.trim() || existingStudent?.name || "Unnamed Student",
          email: payload.email?.trim() || "",
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

  const saveTeacherRecord = async ({ teacherId, payload }) => {
    const targetTeacherId = teacherId || payload.accountId?.trim() || push(ref(db, "users")).key;

    if (!targetTeacherId) {
      throw new Error("Teacher ID could not be generated.");
    }

    const existingTeacher = users.find((user) => user.id === targetTeacherId) || null;
    const existingTeacherData = existingTeacher ? { ...existingTeacher } : {};
    delete existingTeacherData.id;

    const teacherName = payload.name?.trim() || existingTeacher?.displayName || existingTeacher?.name || "Teacher";
    const teacherEmail = payload.email?.trim() || existingTeacher?.email || "";
    const teacherSubjects = normalizeTeacherSubjects(payload.subjects);
    const now = new Date().toISOString();

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
    currentStudent,
    linkedStudent,
    savingStudentId,
    getTeacherClasses,
    getStudentsForClass,
    findStudentById,
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
