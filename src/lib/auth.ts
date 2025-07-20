import bcrypt from "bcrypt";
import Database, { Database as DatabaseType } from "better-sqlite3";
import { useSession } from "vinxi/http";
const REGISTRATION_OPEN = false;

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

// Create Session ...............................................................

//

/**
 * User details as stored in the Auth database
 */
export type User = {
  id: string;
  username: string;
};

/**
 * Information used to identify a user in the Auth Database
 *
 * Also includes current but fleeting details about the current
 * session such as the theme
 */
export type UserSessionData = {
  id: string;
  theme?: string;
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
      cookie: {
        secure: process.env.NODE_ENV === "production" && process.env.FORCE_HTTPS === "true",
        httpOnly: true,
        sameSite: "lax",
      },
    });
  } catch (error) {
    console.error("session error for auth: ", error);
    throw error;
  }
}
// Read Session (Get) ...........................................................

/**
 * Get the current user data from the Session
 *
 * Do not rely on getting all the user details from the session:
 *    1. session.data = {} which is truthy -- confusing
 *    2. The user could have been removed from the db
 *        - Whilst the session is still valid, checking the Auth db for additional
 *          details throughout increases the likelihood of invalidating an unauthorized
 *          user with a valid cookie (due to max-time)
 *    3. User details / priviliges may have changed from elsewhere
 *        - Get this straight from the source
 * @returns Promise that resolves to the user session data if authenticated, or null if not authenticated
 */
export async function getUser(): Promise<User | null> {
  "use server";
  try {
    const session = await useAuthSession();

    // If no session data or no user id, return null
    if (!session.data || !session.data.id) {
      return null;
    }

    const db = await getAuthDb();
    const result = db
      .prepare(`SELECT id, username FROM users WHERE id = ?`)
      .get(session.data.id) as { id: string; username: string } | undefined;

    if (!result) {
      // Don't clear session here as it may cause headers to be sent twice
      // The session will be invalid anyway since the user doesn't exist
      return null;
    }

    // Build and return user object with current data from database
    const userData: User = {
      id: result.id,
      username: result.username,
    };

    return userData;
  } catch (error) {
    console.error("Error getting user session: ", error);
    return null;
  }
}
// Update Session ...............................................................
// Not implemented, just use .update, see <https://docs.solidjs.com/solid-start/advanced/session>
// Delete Session (Logout) ......................................................
export async function clearAuthSessionLogout() {
  "use server";
  const session = await useAuthSession();
  await session.clear();
}

////////////////////////////////////////////////////////////////////////////////
// Users Registration //////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

interface RegistrationMessage {
  success: boolean;
  error?: string;
}

// Create User (Register) .......................................................
/**
 * Adds a user to the database
 *
 * @param username - The username for the new user account
 * @param password - The plain text password for the new user account
 * @returns Promise that resolves to a RegistrationMessage indicating success or failure
 */
export async function registerUser(
  username: string,
  password: string,
): Promise<RegistrationMessage> {
  "use server";
  if (process.env.REGISTRATION_ENABLED !== "true") {
    return { success: false, error: "Registration is currently closed" };
  }
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
// Read user (Login) ............................................................
/**
 * Checks user details against the database and creates an Auth Session for the client
 *
 * @param username - The username of the user attempting to log in
 * @param password - The plain text password for authentication
 * @returns Promise that resolves to an object indicating success or failure with error message
 */
export async function loginUser(username: string, password: string) {
  "use server";
  try {
    const db = await getAuthDb();
    // Check the database for the user
    const userId = await getUserId(username);
    if (!userId) {
      return { success: false, error: "Error, user does not exists" };
    }
    // Compare the password
    const isVerified = await verifyPassword(
      password,
      await getStoredPasswordHash(userId),
    );
    // Drop password
    password = "";

    if (!isVerified) {
      return { success: false, error: "Invalid password" };
    }

    // Create the session
    const session = await useAuthSession();
    await session.update({ id: userId, username: username });
    return { success: true };
  } catch (error) {
    const error_msg = `Error Logging in User: ${error}`;
    console.error(error_msg);
    return { success: false, error: error_msg };
  }
}

// Update User (Change Password) ................................................
/**
 * Update a user's password in the database
 *
 * @param userId - The unique identifier of the user to update
 * @param newPassword - The new plain text password for the user
 * @returns Promise that resolves to a RegistrationMessage indicating success or failure
 */
async function updateUserPassword(
  userId: string,
  newPassword: string,
): Promise<RegistrationMessage> {
  "use server";
  try {
    const db = await getAuthDb();

    // Check if the user exists
    const result = db
      .prepare(`SELECT id FROM users WHERE id = ?`)
      .get(userId) as { id: string } | undefined;

    if (!result) {
      return { success: false, error: "Error, user does not exist" };
    }

    // Hash the new password
    const hash = await hashPassword(newPassword);
    // Drop password
    newPassword = "";

    // Update the user's password in the database
    db.prepare(`UPDATE users SET pass_hash = ? WHERE id = ?`).run(hash, userId);

    console.log("User Password Successfully Updated: ", userId);
    return { success: true };
  } catch (error) {
    console.log("Error Updating User Password: ", error);
    return {
      success: false,
      error: `Failed to update password for user ${userId}: ${error}`,
    };
  }
}

// Delete User ..................................................................
/**
 * Delete a user from the database
 *
 * @param userId - The unique identifier of the user to delete
 * @returns Promise that resolves to an object indicating success or failure with error message
 */
async function deleteUser(userId: string): Promise<RegistrationMessage> {
  "use server";
  try {
    const db = await getAuthDb();

    // Check if the user exists
    const result = db
      .prepare(`SELECT id FROM users WHERE id = ?`)
      .get(userId) as { id: string } | undefined;

    if (!result) {
      return { success: false, error: "Error, user does not exist" };
    }

    // Delete the user from the database
    db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);

    console.log("User Successfully Deleted: ", userId);
    return { success: true };
  } catch (error) {
    console.log("Error Deleting User: ", error);
    return {
      success: false,
      error: `Failed to delete user ${userId}: ${error}`,
    };
  }
}
