/**
 * Authentication database module using SQLite
 *
 * This module provides user management functions with password storage.
 * All passwords are automatically hashed (with salt) using bcrypt before storage.
 *
 * Security notes:
 * - Passwords are stored as bcrypt hashes (never plain text)
 * - User IDs are random
 * - All functions use parameterized queries to prevent SQL injection
 */

"use server";

import Database from "better-sqlite3";
import { randomBytes } from "crypto";
import { hashPassword } from "./hash";
import { redirect } from "@solidjs/router";
import { User } from ".";

async function isSudoMode(): Promise<boolean> {
  "use server";
  return process.env.SUDO_MODE === "true";
}

////////////////////////////////////////////////////////////////////////////////
// Create //////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

// Initialize SQLite database
const db = new Database("./.data/users.sqlite");

// Create users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    username   TEXT UNIQUE NOT NULL,
    pass_hash  TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

/**
 * Create a new user with automatic password hashing
 *
 * @param username - The unique username for the new user
 * @param password - The plain text password (will be automatically hashed)
 * @returns Promise that resolves to object containing the new user's id and username
 * @throws Error if username already exists (UNIQUE constraint violation)
 */
export async function createUser(
  username: string,
  password: string,
): Promise<User> {
  if (await isSudoMode()) {
    const id = randomBytes(16).toString("hex");
    const passwordHash = await hashPassword(password);

    const stmt = db.prepare(
      "INSERT INTO users (id, username, pass_hash) VALUES (?, ?, ?)",
    );
    stmt.run(id, username, passwordHash);

    return { id, username };
  } else {
    throw new Error("User Registration is not Authorized");
  }
}
////////////////////////////////////////////////////////////////////////////////
// Read ////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

/**
 * Find a user by their username
 *
 * @param username - The username to search for
 * @returns User object with id, username, and pass_hash if found, undefined otherwise
 */
export async function findUserByUsername(
  username: string,
): Promise<User | undefined> {
  const stmt = db.prepare("SELECT id, username FROM users WHERE username = ?");
  return stmt.get(username) as User | undefined;
}

/**
 * Find a user by their ID
 *
 * @param id - The user ID to search for
 * @returns User object with id, username, and pass_hash if found, undefined otherwise
 */
export async function findUserById(id: string): Promise<User | undefined> {
  const stmt = db.prepare("SELECT id, username FROM users WHERE id = ?");
  return stmt.get(id) as User | undefined;
}

/**
 * Get a user's password hash by username
 * This is a separate function for security - it only retrieves the password hash
 * when specifically needed for authentication
 *
 * @param username - The username to get the password hash for
 * @returns The password hash if user found, undefined otherwise
 */
export async function getUserPasswordHash(username: string): Promise<string | undefined> {
  const stmt = db.prepare("SELECT pass_hash FROM users WHERE username = ?");
  const result = stmt.get(username) as { pass_hash: string } | undefined;
  return result?.pass_hash;
}

////////////////////////////////////////////////////////////////////////////////
// Update //////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

/**
 * Change a user's username
 *
 * @param userId - The ID of the user to update
 * @param newUsername - The new username (must be unique)
 * @throws Error if user not found or username already exists
 */
export async function changeUsername(
  userId: string,
  newUsername: string,
): Promise<void> {
  if (await isSudoMode()) {
    const stmt = db.prepare("UPDATE users SET username = ? WHERE id = ?");
    const result = stmt.run(newUsername, userId);

    if (result.changes === 0) {
      throw new Error("User not found");
    }
  } else {
    throw new Error("Username Change is not Authorized");
  }
}

/**
 * Change a user's password with automatic hashing
 *
 * @param userId - The ID of the user to update
 * @param newPassword - The new plain text password (will be automatically hashed)
 * @throws Error if user not found
 */
export async function changePassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  if (await isSudoMode()) {
    const passwordHash = await hashPassword(newPassword);
    const stmt = db.prepare("UPDATE users SET pass_hash = ? WHERE id = ?");
    const result = stmt.run(passwordHash, userId);

    if (result.changes === 0) {
      throw new Error("User not found");
    }
  } else {
    throw new Error("Password Change is not Authorized");
  }
}
////////////////////////////////////////////////////////////////////////////////
// Delete //////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

/**
 * Delete a user from the database
 *
 * @param userId - The ID of the user to delete
 * @throws Error if user not found
 */
export async function deleteUser(userId: string): Promise<void> {
  if (await isSudoMode()) {
    const stmt = db.prepare("DELETE FROM users WHERE id = ?");
    const result = stmt.run(userId);

    if (result.changes === 0) {
      throw new Error("User not found");
    }
  } else {
    throw new Error("User Removal is not Authorized");
  }
}
