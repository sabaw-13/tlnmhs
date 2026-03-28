import React, { createContext, useContext, useEffect, useState } from "react";
import { onValue, ref, update } from "firebase/database";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import {
  buildClassReport,
  buildRepositorySummary,
  buildStudentRecord,
  formatShortDate,
  normalizeCollection
} from "../utils/reporting";

const SchoolDataContext = createContext();

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

  const updateStudentRecord = async (studentId, payload) => {
    setSavingStudentId(studentId);

    try {
      await update(ref(db, `students/${studentId}`), {
        ...payload,
        updatedAt: new Date().toISOString(),
        updatedByName: userData?.displayName || userData?.email || currentUser?.email || "System User",
        updatedByRole: userData?.role || "unknown",
        lastUpdateLabel: formatShortDate(new Date().toISOString())
      });
    } finally {
      setSavingStudentId("");
    }
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
    currentStudent,
    linkedStudent,
    savingStudentId,
    getTeacherClasses,
    getStudentsForClass,
    findStudentById,
    updateStudentRecord
  };

  return (
    <SchoolDataContext.Provider value={value}>
      {children}
    </SchoolDataContext.Provider>
  );
};
