import { action, query, redirect } from "@solidjs/router";
import { findUserById } from "./db";
import {
  getSession,
  login,
  logout as logoutSession,
  register,
  validatePassword,
  validateUsername,
} from "./server";

export type User = {
  id: string;
  username: string;
};

/**
 * Get the currently authenticated user from the session
 *
 * @returns User object with id and username
 * @throws Redirects to /login if no user is authenticated or user not found
 *
 * NOTE, I've found If the client does not support cookies, this will return undefined
 */
export const getUser = query(async (): Promise<User | undefined> => {
  "use server";
  try {
    const session = await getSession();
    const userId = session.data.userId;
    if (userId === undefined) throw new Error("User not found");
    const user = await findUserById(userId);
    if (!user) throw new Error("User not found");
    return { id: user.id, username: user.username };
  } catch (error) {
    console.log(`[Session Warning]: ${error}`);
    await logoutSession();
    throw redirect("/login");
  }
}, "user");

/**
 * Get the currently authenticated user from the session
 *
 * @returns User object with id and username
 * @throws Redirects to /login if no user is authenticated or user not found
 *
 */
export async function requireUser(): Promise<User> {
  "use server";
  const user = await getUser();

  // Confirm the user is defined
  if (!user || typeof user !== "object" || !user.id || !user.username) {
    await logoutSession();
    throw redirect("/login");
  }

  return user;
}

/**
 * Handle user login or registration based on form submission
 *
 * @param formData - Form data containing:
 *   - username: User's username
 *   - password: User's password
 *   - loginType: "login" or any other value for registration
 * @returns Redirect to home page on success, or Error with message on failure
 *
 * Note: Username/password validation only occurs during registration
 */
export const loginOrRegister = action(async (formData: FormData) => {
  "use server";
  const username = String(formData.get("username"));
  const password = String(formData.get("password"));
  const loginType = String(formData.get("loginType"));

  // Only validate on registration
  if (loginType !== "login") {
    const error = validateUsername(username) || validatePassword(password);
    if (error) return new Error(error);
  }

  try {
    const user = await (loginType !== "login"
      ? register(username, password)
      : login(username, password));
    const session = await getSession();
    await session.update((d) => {
      d.userId = user.id;
    });
  } catch (err) {
    return err as Error;
  }
  return redirect("/");
});

export const logout = action(async () => {
  "use server";
  await logoutSession();
  return redirect("/login");
});
