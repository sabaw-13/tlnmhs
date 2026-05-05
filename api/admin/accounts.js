import { adminAuth, adminDb } from "../_lib/firebaseAdmin.js";

const MIN_PASSWORD_LENGTH = 6;
const ALLOWED_ROLES = new Set(["student", "teacher"]);

const sendJson = (response, status, payload) => {
  response.status(status).json(payload);
};

const parseAuthorizationHeader = (request) => {
  const header = request.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
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

const validatePassword = (password) => {
  if (typeof password !== "string" || password.trim().length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }

  return password.trim();
};

const requireAdmin = async (request) => {
  const token = parseAuthorizationHeader(request);

  if (!token) {
    throw new Error("Missing admin authorization token.");
  }

  const authService = adminAuth();
  const db = adminDb();
  const decodedToken = await authService.verifyIdToken(token);
  const adminRoleSnapshot = await db.ref(`users/${decodedToken.uid}/role`).get();

  if (adminRoleSnapshot.val() !== "admin") {
    const error = new Error("Only admin accounts can manage user credentials.");
    error.statusCode = 403;
    throw error;
  }

  return decodedToken.uid;
};

export default async function handler(request, response) {
  if (!["POST", "PATCH"].includes(request.method)) {
    response.setHeader("Allow", "POST, PATCH");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  try {
    await requireAdmin(request);

    const authService = adminAuth();
    const body = normalizeBody(request.body);

    if (request.method === "POST") {
      const role = String(body.role || "").trim().toLowerCase();
      const email = String(body.email || "").trim();
      const displayName = String(body.displayName || "").trim();
      const password = validatePassword(body.password);

      if (!ALLOWED_ROLES.has(role)) {
        return sendJson(response, 400, { error: "Only student and teacher accounts can be created here." });
      }

      if (!email) {
        return sendJson(response, 400, { error: "Email is required to create an account." });
      }

      const userRecord = await authService.createUser({
        email,
        password,
        displayName: displayName || undefined
      });

      return sendJson(response, 200, {
        uid: userRecord.uid,
        email: userRecord.email || email,
        displayName: userRecord.displayName || displayName,
        role
      });
    }

    const uid = String(body.uid || "").trim();
    const updates = {};

    if (!uid) {
      return sendJson(response, 400, { error: "User ID is required." });
    }

    if (typeof body.email === "string") {
      const email = body.email.trim();

      if (!email) {
        return sendJson(response, 400, { error: "Email cannot be blank." });
      }

      updates.email = email;
    }

    if (typeof body.displayName === "string") {
      updates.displayName = body.displayName.trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, "password")) {
      updates.password = validatePassword(body.password);
    }

    if (!Object.keys(updates).length) {
      return sendJson(response, 400, { error: "No account updates were provided." });
    }

    const updatedUser = await authService.updateUser(uid, updates);

    return sendJson(response, 200, {
      uid: updatedUser.uid,
      email: updatedUser.email || updates.email || "",
      displayName: updatedUser.displayName || updates.displayName || ""
    });
  } catch (error) {
    console.error("Admin account management failed:", error);

    const message = error?.errorInfo?.message
      || error?.message
      || "The account request could not be completed.";
    const statusCode = error?.statusCode || 500;

    return sendJson(response, statusCode, { error: message });
  }
}
