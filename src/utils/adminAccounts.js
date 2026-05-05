import { auth } from "../firebase";

const getAdminHeaders = async () => {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("You must be signed in to manage accounts.");
  }

  const token = await currentUser.getIdToken();

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
};

const parseResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "The request could not be completed.");
  }

  return payload;
};

export const createManagedAccount = async ({ role, email, password, displayName }) => {
  const response = await fetch("/api/admin/accounts", {
    method: "POST",
    headers: await getAdminHeaders(),
    body: JSON.stringify({
      role,
      email,
      password,
      displayName
    })
  });

  return parseResponse(response);
};

export const updateManagedAccount = async ({ uid, email, displayName, password }) => {
  const response = await fetch("/api/admin/accounts", {
    method: "PATCH",
    headers: await getAdminHeaders(),
    body: JSON.stringify({
      uid,
      email,
      displayName,
      password
    })
  });

  return parseResponse(response);
};
