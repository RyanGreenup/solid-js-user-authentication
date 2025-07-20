import bcrypt from "bcrypt";
import Database, { Database as DatabaseType } from "better-sqlite3";
import { useSession } from "vinxi/http";

let db: DatabaseType | null = null;

////////////////////////////////////////////////////////////////////////////////
// Auth Database ///////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
/**
 * Get the Path to the Users Database
 */
async function getAuthDbPath(): Promise<string> {
  "use server";
  return "./users.sqlite";
}

/**
 * Get the database connections
 *
 * Creates the database and table if it doesn't exist.
 */
async function getAuthDb(): Promise<DatabaseType> {
  "use server";
  if (!db) {
    db = new Database(await getAuthDbPath());
    // Create the users table if it's not there, for new db
    db.exec(`
                CREATE TABLE IF NOT EXISTS users (
                    id         TEXT NOT NULL PRIMARY KEY DEFAULT (hex(randomblob(16))),
                    username   TEXT NOT NULL UNIQUE,
                    pass_hash  TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                `);
  }

  return db;
}

/**
 * Get the stored password hash for a user by their ID
 *
 * @param userId - The unique identifier of the user
 * @returns The password hash stored in the database
 * @throws Error if the user is not found
 */
async function getStoredPasswordHash(userId: string): Promise<string> {
  "use server";
  const db = await getAuthDb();
  // NOTE pass_hash is NOT NULL so function should only return string
  const result = db
    .prepare(`SELECT pass_hash FROM users WHERE id = ?`)
    .get(userId) as { pass_hash: string };

  if (!result) {
    throw new Error(`User with id ${userId} not found`);
  }

  return result.pass_hash;
}

/**
 * Check if a user already exists in the database
 *
 * Returns the user id if user exists, null if no user
 */
async function getUserId(username: string): Promise<string | null> {
  "use server";
  const db = await getAuthDb();
  const result = db
    .prepare(`SELECT id FROM users WHERE username = ?`)
    .get(username) as { id: string } | undefined;
  if (result) {
    return result.id;
  }
  return null;
}

////////////////////////////////////////////////////////////////////////////////
// Salt and Hash Helpers ///////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

/**
 * Verify a password against a stored hash
 *
 * @param password - The plain text password to verify
 * @param hash - The stored bcrypt hash to compare against (must be bcrypt as salt is stored in hash output)
 * @returns Promise that resolves to true if password matches, false otherwise
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  "use server";
  return await bcrypt.compare(password, hash);
}

/**
 * Salt and Hash a Password
 *
 * Note that bcrypt appens the salt to the end of the hash
 * No need to save it
 *
 */
export async function hashPassword(password: string): Promise<string> {
  "use server";
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

////////////////////////////////////////////////////////////////////////////////
// Session Management //////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

export type UserSessionData = {
  user_id: string;
  username: string;
};

/**
 * Get the user session with authentication data
 *
 * @returns Promise that resolves to a session object containing user authentication data
 * @throws Error if session creation fails or SESSION_SECRET env var is not set
 */
export async function useAuthSession() {
  "use server";
  try {
    return await useSession<UserSessionData>({
      password: process.env.SESSION_SECRET as string,
      name: "auth_session",
    });
  } catch (error) {
    console.error("session error for auth: ", error);
    throw error;
  }
}

/**
 * Get the current user session data
 *
 * @returns Promise that resolves to the user session data if authenticated, or null if not authenticated
 */
export async function getUserSession(): Promise<UserSessionData | null> {
  "use server";
  try {
    const session = await useAuthSession();
    return session.data || null;
  } catch (error) {
    console.error("Error getting user session: ", error);
    return null;
  }
}

interface RegistrationMessage {
  success: boolean;
  error?: string;
}

/**
 * Adds a user to the database
 *
 * @param username - The username for the new user account
 * @param password - The plain text password for the new user account
 * @returns Promise that resolves to a RegistrationMessage indicating success or failure
 */
async function registerUser(
  username: string,
  password: string,
): Promise<RegistrationMessage> {
  "use server";
  try {
    const db = await getAuthDb();
    // Check if the user already exists
    const userId = await getUserId(username);
    if (userId) {
      return { success: false, error: "Error, user already exists" };
    }

    // Add the user to the database
    const hash = await hashPassword(password);
    // Drop Password
    password = "";

    // Add the user to the database
    db.prepare(`INSERT INTO users (username, pass_hash) VALUES (?, ?)`).run(
      username,
      hash,
    );
    console.log("User Succesfully Created: ", username);
    return { success: true };
  } catch (error) {
    console.log("Error Creating User: ", error);
    return {
      success: false,
      error: `Failed to create user ${username}: ${error}`,
    };
  }
}

/**
 * Checks user details against the database
 *
 * @param username - The username of the user attempting to log in
 * @param password - The plain text password for authentication
 * @returns Promise that resolves to an object indicating success or failure with error message
 */
async function loginUser(username: string, password: string) {
  "use server";
  try {
    const db = await getAuthDb();
    // Check the database for the user
    const userId = await getUserId(username);
    if (!userId) {
      return { success: false, error: "Error, user does not exists" };
    }
    // Compare the password
    const isVerified = verifyPassword(
      password,
      await getStoredPasswordHash(userId),
    );
    // Drop password
    password = "";

    // Create the session
    const session = await useAuthSession();
    session.update({ user_id: userId, username: username });
    return { success: true };
  } catch (error) {
    const error_msg = `Error Logging in User: ${error}`;
    console.error(error_msg);
    return { success: false, error: error_msg };
  }
}
