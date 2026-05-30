import { adminDb } from "../_lib/firebaseAdmin.js";

const MIN_PASSWORD_LENGTH = 6;

const sendJson = (response, status, payload) => {
  response.status(status).json(payload);
};

const normalizeBody = (requestBody) => {
  if (!requestBody) return {};
  if (typeof requestBody === "string") {
    try {
      return JSON.parse(requestBody);
    } catch {
      return {};
    }
  }

  return requestBody;
};

const normalizeLookupValue = (value) => String(value || "").trim().toLowerCase();
const JUNIOR_HIGH_GRADE_LEVELS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10"];

const normalizeGradeLevel = (value) => {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) return "";

  const matchedGrade = trimmedValue.match(/\d+/)?.[0] || "";
  const gradeLevel = matchedGrade ? `Grade ${matchedGrade}` : trimmedValue;

  return JUNIOR_HIGH_GRADE_LEVELS.includes(gradeLevel) ? gradeLevel : "";
};

const getStudentNumberCandidates = (student) => [
  student?.studentNumber,
  student?.studentIdNumber,
  student?.lrn,
  student?.idNumber
].map(normalizeLookupValue).filter(Boolean);

const getStudentClassId = (student) => student?.classId || student?.classKey || student?.sectionId || "";

const studentNumberExists = async (db, studentNumber) => {
  const normalizedStudentNumber = normalizeLookupValue(studentNumber);
  if (!normalizedStudentNumber) return false;

  const studentsSnapshot = await db.ref("students").get();
  const classesSnapshot = await db.ref("classes").get();
  const students = studentsSnapshot.val() || {};
  const classEntries = Object.entries(classesSnapshot.val() || {});
  const juniorHighClassIds = new Set(
    classEntries
      .filter(([, classroom]) => normalizeGradeLevel(classroom?.gradeLevel))
      .map(([classId]) => classId)
  );
  const nonJuniorHighClassIds = new Set(
    classEntries
      .filter(([, classroom]) => !normalizeGradeLevel(classroom?.gradeLevel))
      .map(([classId]) => classId)
  );

  return Object.values(students).some((student) => {
    const classId = getStudentClassId(student);
    const isJuniorHighStudent = normalizeGradeLevel(student?.gradeLevel) || juniorHighClassIds.has(classId);

    if (classId && nonJuniorHighClassIds.has(classId)) return false;

    return isJuniorHighStudent && getStudentNumberCandidates(student).includes(normalizedStudentNumber);
  });
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  try {
    const body = normalizeBody(request.body);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const password = String(body.password || "").trim();
    const studentNumber = String(body.studentNumber || "").trim();

    if (!name) {
      return sendJson(response, 400, { error: "Parent name is required." });
    }

    if (!email) {
      return sendJson(response, 400, { error: "Email is required." });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return sendJson(response, 400, { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.` });
    }

    if (!studentNumber) {
      return sendJson(response, 400, { error: "Student ID is required." });
    }

    const db = adminDb();

    if (!(await studentNumberExists(db, studentNumber))) {
      return sendJson(response, 400, { error: "Student ID must match an existing student record." });
    }

    const requestRef = db.ref("parentAccountRequests").push();
    const now = new Date().toISOString();

    await requestRef.set({
      name,
      email,
      password,
      studentNumber,
      status: "pending",
      requestedAt: now
    });

    return sendJson(response, 200, {
      id: requestRef.key,
      status: "pending"
    });
  } catch (error) {
    console.error("Parent account request failed:", error);

    return sendJson(response, 500, {
      error: error?.message || "Parent account request could not be sent."
    });
  }
}
