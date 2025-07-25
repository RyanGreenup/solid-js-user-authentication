# Implementing User Auth in Solid-JS (WIP)

## Overview

1. Create a User Database
2. Create a Session Manager
3. Create a Login Route
4. Create an Example of Secure Data


## Create a User Database
### Overview (`./src/lib/auth/hash.ts`)
Create functions that can manage a user database by storing appropriate details
### Salt and Hash
#### Overview
These functions add a salt to a password, hash it and append the salt back. This can be stored in a database to compare the user password to without comprimising security.
#### Code

```ts
import bcrypt from "bcrypt";

export async function verifyPassword(
    password: string,
    hash: string,
): Promise<boolean> {
    "use server";
    return await bcrypt.compare(password, hash);
}

```

```ts
export async function hashPassword(password: string): Promise<string> {
    "use server";
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
}
```


### CRUD User Details
#### Overview
Add user credentials to a database so users can login/logout.
#### Code (`./src/lib/auth/db.ts`)
##### Init
```ts
import Database from "better-sqlite3";
import { randomBytes } from "crypto";
import { hashPassword } from "./hash";

// Initialize SQLite database
const db = new Database("./.data/auth.db");

// Create users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    username   TEXT UNIQUE NOT NULL,
    pass_hash  TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

```

##### Create
```ts

export async function createUser(
  username: string,
  password: string,
): Promise<{ id: string; username: string }> {
  const id = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password);

  const stmt = db.prepare(
    "INSERT INTO users (id, username, pass_hash) VALUES (?, ?, ?)",
  );
  stmt.run(id, username, passwordHash);

  return { id, username };
}
```

##### Read
```ts
export function findUserByUsername(
  username: string,
): { id: string; username: string; pass_hash: string } | undefined {
  const stmt = db.prepare(
    "SELECT id, username, pass_hash FROM users WHERE username = ?",
  );
  return stmt.get(username) as any;
}

export function findUserById(
  id: string,
): { id: string; username: string; pass_hash: string } | undefined {
  const stmt = db.prepare(
    "SELECT id, username, pass_hash FROM users WHERE id = ?",
  );
  return stmt.get(id) as any;
}

```

##### Update
```ts
export function changeUsername(userId: string, newUsername: string): void {
  const stmt = db.prepare("UPDATE users SET username = ? WHERE id = ?");
  const result = stmt.run(newUsername, userId);

  if (result.changes === 0) {
    throw new Error("User not found");
  }
}

export async function changePassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  const stmt = db.prepare("UPDATE users SET pass_hash = ? WHERE id = ?");
  const result = stmt.run(passwordHash, userId);

  if (result.changes === 0) {
    throw new Error("User not found");
  }
}
```


##### Delete

```ts
export function deleteUser(userId: string): void {
  const stmt = db.prepare("DELETE FROM users WHERE id = ?");
  const result = stmt.run(userId);

  if (result.changes === 0) {
    throw new Error("User not found");
  }
}
```

## Create a Session Manager
### Overview
This is the tricky part, Use the Solid JS sessions to retrieve a logged in user.
#### Create
##### Create Session (Login)
```ts
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
```

##### Register in Auth Db (Register)
#### Read -- Get User Id From Session
#### Upate -- Logout

## Create a Login Route
## Create an Example of Secure Data
