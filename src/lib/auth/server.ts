import { useSession } from "vinxi/http";
import { findUserByUsername, createUser, getUserPasswordHash } from "./db";
import { verifyPassword } from "./hash";
import { randomBytes } from "crypto";

("use server");

// Generate or use existing session secret
// Single Server Application, secure secret favoured over potential vulnerability
const SESSION_SECRET =
  process.env.SESSION_SECRET || randomBytes(32).toString("hex");

// Log warning if using random secret
if (!process.env.SESSION_SECRET) {
  console.warn(
    "⚠️  No SESSION_SECRET env var found. Using random secret (sessions won't persist across restarts)",
  );
}

export function validateUsername(username: unknown) {
  if (typeof username !== "string" || username.length < 3) {
    return `Usernames must be at least 3 characters long`;
  }
}

export function validatePassword(password: unknown) {
  const n = 16;
  if (typeof password !== "string" || password.length < n) {
    return `Passwords must be at least ${n} characters long`;
  }
}

export async function login(username: string, password: string) {
  const user = await findUserByUsername(username);
  if (!user) throw new Error("Invalid login");

  const passwordHash = await getUserPasswordHash(username);
  if (!passwordHash) throw new Error("Invalid login");

  const isValid = await verifyPassword(password, passwordHash);
  if (!isValid) throw new Error("Invalid login");

  return { id: user.id, username: user.username };
}

export async function logout() {
  const session = await getSession();
  await session.update((d) => {
    d.userId = undefined;
  });
}

export async function register(username: string, password: string) {
  const existingUser = await findUserByUsername(username);
  if (existingUser) throw new Error("User already exists");

  return await createUser(username, password);
}

export function getSession() {
  return useSession({
    password: SESSION_SECRET,
  });
}
