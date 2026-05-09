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

    if (!name) {
      return sendJson(response, 400, { error: "Parent name is required." });
    }

    if (!email) {
      return sendJson(response, 400, { error: "Email is required." });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return sendJson(response, 400, { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.` });
    }

    const db = adminDb();
    const requestRef = db.ref("parentAccountRequests").push();
    const now = new Date().toISOString();

    await requestRef.set({
      name,
      email,
      password,
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
