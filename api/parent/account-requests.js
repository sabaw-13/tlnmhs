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

const getStudentNumberCandidates = (student) => [
  student?.studentNumber,
  student?.studentIdNumber,
  student?.lrn,
  student?.idNumber
].map(normalizeLookupValue).filter(Boolean);

const studentNumberExists = async (db, studentNumber) => {
  const normalizedStudentNumber = normalizeLookupValue(studentNumber);
  if (!normalizedStudentNumber) return false;

  const studentsSnapshot = await db.ref("students").get();
  const students = studentsSnapshot.val() || {};

  return Object.values(students).some((student) => (
    getStudentNumberCandidates(student).includes(normalizedStudentNumber)
  ));
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
