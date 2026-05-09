import { deleteApp, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, signOut, updateProfile } from "firebase/auth";
import { auth, firebaseConfig } from "../firebase";

const SECONDARY_AUTH_CREATE_DELAY_MS = 2000;
const RATE_LIMIT_RETRY_DELAYS_MS = [5000, 10000, 20000, 40000];
let secondaryAuthQueue = Promise.resolve();

const wait = (milliseconds) => new Promise((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

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

const isMissingLocalApiError = (error) => error?.message === "The request could not be completed.";

const isRateLimitError = (error) => {
  const message = String(error?.message || "").toLowerCase();

  return error?.code === "auth/too-many-requests" || message.includes("too-many-requests");
};

const runQueuedSecondaryAuthCreate = async (operation) => {
  const previousOperation = secondaryAuthQueue;
  let releaseQueue = () => {};

  secondaryAuthQueue = new Promise((resolve) => {
    releaseQueue = resolve;
  });

  await previousOperation.catch(() => {});

  try {
    return await operation();
  } finally {
    await wait(SECONDARY_AUTH_CREATE_DELAY_MS);
    releaseQueue();
  }
};

const createSingleAccountWithSecondaryAuth = async ({ role, email, password, displayName }) => {
  if (!auth.currentUser) {
    throw new Error("You must be signed in to manage accounts.");
  }

  const secondaryApp = initializeApp(firebaseConfig, `account-create-${Date.now()}-${Math.random()}`);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);

    if (displayName) {
      await updateProfile(credential.user, { displayName });
    }

    return {
      uid: credential.user.uid,
      email: credential.user.email || email,
      displayName,
      role
    };
  } catch (error) {
    if (error?.code === "auth/email-already-in-use") {
      throw new Error("That email is already used by another account.");
    }

    if (error?.code === "auth/invalid-email") {
      throw new Error("Enter a valid email address.");
    }

    if (error?.code === "auth/weak-password") {
      throw new Error("Password must be at least 6 characters long.");
    }

    throw error;
  } finally {
    await signOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }
};

const createAccountWithSecondaryAuth = async (accountPayload) => {
  return runQueuedSecondaryAuthCreate(async () => {
    for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await createSingleAccountWithSecondaryAuth(accountPayload);
      } catch (error) {
        if (!isRateLimitError(error) || attempt === RATE_LIMIT_RETRY_DELAYS_MS.length) {
          if (isRateLimitError(error)) {
            throw new Error("Firebase is temporarily limiting account creation. Wait a few minutes, then import the same CSV again; existing student IDs will be skipped.");
          }

          throw error;
        }

        await wait(RATE_LIMIT_RETRY_DELAYS_MS[attempt]);
      }
    }

    throw new Error("The account could not be created.");
  });
};

export const createManagedAccount = async ({ role, email, password, displayName }) => {
  const accountPayload = {
    role,
    email,
    password,
    displayName
  };

  try {
    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: await getAdminHeaders(),
      body: JSON.stringify(accountPayload)
    });

    const createdAccount = await parseResponse(response);

    if (createdAccount?.uid) {
      return createdAccount;
    }

    return createAccountWithSecondaryAuth(accountPayload);
  } catch (error) {
    if (!isMissingLocalApiError(error)) {
      throw error;
    }

    return createAccountWithSecondaryAuth(accountPayload);
  }
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

export const deleteManagedAccount = async ({ uid }) => {
  const response = await fetch("/api/admin/accounts", {
    method: "DELETE",
    headers: await getAdminHeaders(),
    body: JSON.stringify({ uid })
  });

  return parseResponse(response);
};
