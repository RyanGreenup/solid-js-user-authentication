import bcrypt from "bcrypt";

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
