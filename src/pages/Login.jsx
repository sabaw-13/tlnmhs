import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { push, ref, set } from "firebase/database";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import "./Login.css";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [parentRequest, setParentRequest] = useState({
    name: "",
    email: "",
    password: ""
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
      throw new Error(payload.error || "Parent account request could not be sent.");
    }
    if (!payload.id && payload.status !== "pending") {
      throw new Error("Parent account request could not be sent.");
    }

    return payload;
  };

  const submitParentRequestDirectly = async ({ name, email, password }) => {
    const requestRef = push(ref(db, "parentAccountRequests"));

    await set(requestRef, {
      name,
      email,
      password,
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

      if (trimmedPassword.length < 6) {
        throw new Error("Password must be at least 6 characters long.");
      }

      const requestPayload = {
        name: trimmedName,
        email: trimmedEmail,
        password: trimmedPassword
      };

      try {
        await parseRequestResponse(await fetch("/api/parent/account-requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestPayload)
        }));
      } catch {
        await submitParentRequestDirectly(requestPayload);
      }

      setParentRequest({ name: "", email: "", password: "" });
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
        <h1>TLNMHS Progress Tracker</h1>
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
                  onClick={() => setIsPasswordVisible((currentValue) => !currentValue)}
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
