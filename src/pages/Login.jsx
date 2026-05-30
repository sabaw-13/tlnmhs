import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { get, push, ref, set } from "firebase/database";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import "./Login.css";

const normalizeLookupValue = (value) => String(value || "").trim().toLowerCase();
const DEFAULT_GRADE_LEVELS = ["Grade 7", "Grade 8", "Grade 9", "Grade 10"];
const buildGradeLevelLabel = (value) => {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) return "";

  const matchedGrade = trimmedValue.match(/\d+/)?.[0] || "";
  return matchedGrade ? `Grade ${matchedGrade}` : trimmedValue;
};

const normalizeGradeLevel = (value, allowedGradeLevels = DEFAULT_GRADE_LEVELS) => {
  const gradeLevel = buildGradeLevelLabel(value);
  if (!gradeLevel) return "";

  const matchingGradeLevel = allowedGradeLevels.find((option) => (
    normalizeLookupValue(option) === normalizeLookupValue(gradeLevel)
  ));

  return matchingGradeLevel || (allowedGradeLevels.length ? "" : gradeLevel);
};

const getStudentNumberCandidates = (student) => [
  student?.studentNumber,
  student?.studentIdNumber,
  student?.lrn,
  student?.idNumber
].map(normalizeLookupValue).filter(Boolean);

const getStudentClassId = (student) => student?.classId || student?.classKey || student?.sectionId || "";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [parentRequest, setParentRequest] = useState({
    name: "",
    email: "",
    password: "",
    studentNumber: ""
  });
  const [showParentRequest, setShowParentRequest] = useState(false);
  const [requestMessage, setRequestMessage] = useState(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const { login, authError } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError("Failed to login. Please check your credentials.");
      console.error(err);
    }
  };

  const parseRequestResponse = async (response) => {
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(payload.error || "Parent account request could not be sent.");
      error.status = response.status;
      throw error;
    }
    if (!payload.id && payload.status !== "pending") {
      throw new Error("Parent account request could not be sent.");
    }

    return payload;
  };

  const verifyStudentNumberExists = async (studentNumber) => {
    const normalizedStudentNumber = normalizeLookupValue(studentNumber);
    if (!normalizedStudentNumber) return false;

    const studentsSnapshot = await get(ref(db, "students"));
    const students = studentsSnapshot.val() || {};
    let classEntries = [];
    let activeGradeLevels = DEFAULT_GRADE_LEVELS;

    try {
      const classesSnapshot = await get(ref(db, "classes"));
      classEntries = Object.entries(classesSnapshot.val() || {});
    } catch (classesError) {
      console.warn("Section data could not be checked while verifying parent request.", classesError);
    }

    try {
      const gradeLevelsSnapshot = await get(ref(db, "gradeLevels"));
      const gradeLevelEntries = Object.values(gradeLevelsSnapshot.val() || {})
        .filter((entry) => entry?.status !== "inactive")
        .map((entry) => normalizeGradeLevel(entry?.name || entry?.gradeLevel || entry?.label, []))
        .filter(Boolean);

      activeGradeLevels = Array.from(new Set([...DEFAULT_GRADE_LEVELS, ...gradeLevelEntries]));
    } catch (gradeLevelsError) {
      console.warn("Grade level data could not be checked while verifying parent request.", gradeLevelsError);
    }

    const juniorHighClassIds = new Set(
      classEntries
        .filter(([, classroom]) => normalizeGradeLevel(classroom?.gradeLevel, activeGradeLevels))
        .map(([classId]) => classId)
    );
    const nonJuniorHighClassIds = new Set(
      classEntries
        .filter(([, classroom]) => !normalizeGradeLevel(classroom?.gradeLevel, activeGradeLevels))
        .map(([classId]) => classId)
    );

    return Object.values(students).some((student) => {
      const classId = getStudentClassId(student);
      const hasExplicitGradeLevel = Boolean(String(student?.gradeLevel || "").trim());
      const isJuniorHighStudent = normalizeGradeLevel(student?.gradeLevel, activeGradeLevels)
        || juniorHighClassIds.has(classId)
        || (!hasExplicitGradeLevel && !classEntries.length);

      if (classId && nonJuniorHighClassIds.has(classId)) return false;
      if (hasExplicitGradeLevel && !normalizeGradeLevel(student?.gradeLevel, activeGradeLevels)) return false;

      return isJuniorHighStudent && getStudentNumberCandidates(student).includes(normalizedStudentNumber);
    });
  };

  const submitParentRequestDirectly = async ({ name, email, password, studentNumber }) => {
    if (!(await verifyStudentNumberExists(studentNumber))) {
      throw new Error("Student ID must match an existing student record.");
    }

    const requestRef = push(ref(db, "parentAccountRequests"));

    await set(requestRef, {
      name,
      email,
      password,
      studentNumber,
      status: "pending",
      requestedAt: new Date().toISOString()
    });

    return {
      id: requestRef.key,
      status: "pending"
    };
  };

  const handleParentRequestSubmit = async (event) => {
    event.preventDefault();
    setRequestMessage(null);
    setSubmittingRequest(true);

    try {
      const trimmedName = parentRequest.name.trim();
      const trimmedEmail = parentRequest.email.trim();
      const trimmedPassword = parentRequest.password.trim();
      const trimmedStudentNumber = parentRequest.studentNumber.trim();

      if (trimmedPassword.length < 6) {
        throw new Error("Password must be at least 6 characters long.");
      }

      if (!trimmedStudentNumber) {
        throw new Error("Student ID is required.");
      }

      const requestPayload = {
        name: trimmedName,
        email: trimmedEmail,
        password: trimmedPassword,
        studentNumber: trimmedStudentNumber
      };

      try {
        await parseRequestResponse(await fetch("/api/parent/account-requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestPayload)
        }));
      } catch (apiError) {
        if (apiError?.status && apiError.status < 500 && ![404, 405].includes(apiError.status)) {
          throw apiError;
        }

        await submitParentRequestDirectly(requestPayload);
      }

      setParentRequest({ name: "", email: "", password: "", studentNumber: "" });
      setRequestMessage({
        type: "success",
        text: "Parent account request sent. Wait for admin approval before logging in."
      });
    } catch (requestError) {
      setRequestMessage({
        type: "error",
        text: requestError?.message || "Parent account request could not be sent."
      });
    } finally {
      setSubmittingRequest(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>TLNMHS</h1>
        {!showParentRequest ? (
          <form onSubmit={handleSubmit}>
            {authError && <div className="error-message">{authError}</div>}
            {error && <div className="error-message">{error}</div>}
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <div className="password-field">
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                  aria-pressed={isPasswordVisible}
                  onClick={() => setIsPasswordVisible((v) => !v)}
                >
                  {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" className="login-button">Login</button>
            <button type="button" className="login-link-button" onClick={() => setShowParentRequest(true)}>
              Request parent account
            </button>
          </form>
        ) : (
          <form onSubmit={handleParentRequestSubmit}>
            {requestMessage && (
              <div className={requestMessage.type === "error" ? "error-message" : "success-message"}>
                {requestMessage.text}
              </div>
            )}
            <div className="form-group">
              <label>Parent Name</label>
              <input
                type="text"
                value={parentRequest.name}
                onChange={(event) => setParentRequest({ ...parentRequest, name: event.target.value })}
                placeholder="Enter your full name"
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={parentRequest.email}
                onChange={(event) => setParentRequest({ ...parentRequest, email: event.target.value })}
                placeholder="Enter your email"
                required
              />
            </div>
            <div className="form-group">
              <label>Requested Password</label>
              <input
                type="password"
                value={parentRequest.password}
                onChange={(event) => setParentRequest({ ...parentRequest, password: event.target.value })}
                placeholder="At least 6 characters"
                required
              />
            </div>
            <div className="form-group">
              <label>Student ID</label>
              <input
                type="text"
                value={parentRequest.studentNumber}
                onChange={(event) => setParentRequest({ ...parentRequest, studentNumber: event.target.value })}
                placeholder="Enter linked student ID"
                required
              />
            </div>
            <button type="submit" className="login-button" disabled={submittingRequest}>
              {submittingRequest ? "Sending..." : "Send Request"}
            </button>
            <button type="button" className="login-link-button" onClick={() => setShowParentRequest(false)}>
              Back to login
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
