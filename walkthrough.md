# Implementing Authentication in Solid-JS

## Overview

Solid Start supports Authentication through Sessions, as described in
[docs/solid-start/advanced/auth] [^1752924311].

Sessions are a way to manage state in HTTP by providing the user a cookie encrypted by the server that is attached to requests, see [docs/solid-start/advanced/session](https://docs.solidjs.com/solid-start/advanced/session) [^1752924395]


This works by only returning data if a user session exists and otherwise throwing a redirect. The redirect should occur on the server side via the `"use server"` directive (see [docs/use server](https://docs.solidjs.com/solid-start/reference/server/use-server) [^1752924523] ) so no information makes it's way to the user.

Generally it's best to secure as near the data source as possible [^1752924552] :

> As a result, authorization checks should be performed as close to the data source as possible. This means it within API routes, server-only queries/actions, or other server-side utilities.

The simplest way would be to implement the database connection function so that it requires a valid user session:

```ts
// Initialize the database connection
async function getDb(): Database.Database {
    "use server"

    const user = await getUser();
    if(!user) {
        return null // or throw an error which can be handled (e.g. to throw a redirect or provide user info)
    }

  if (!db) {
    const dbPath = process.env.DB_PATH;
    if (!dbPath) {
      throw new Error("DB_PATH environment variable is not set");
    }

    db = new Database(dbPath);
  }
  return db;
}
```



## Walkthrough

### Protecting Data
#### Initialize a Project

```
# Choose Solid Start and Tailwind
npm init solid@latest
npm install
```

#### Set a Session Secret

Generate a session secret once, then save it somewhere secure. This will be
used to encrypt the cookie on the client side. Avoid changing it down the line,
this would invalidate user logins, they'd need to clear their cookies.

```
export SESSION_SECRET=$(openssl rand -base64 32)
```

#### Create Some Confidential Data

```sh
pnpm add better-sqlite3 @types/better-sqlite3
```



In `src/lib/db.ts`:

> [!NOTE]
> `"use server" functions must be marked async or return a promise.
> https://docs.solidjs.com/solid-start/reference/server/use-server

> [!WARNING]
> Using AUTOINCREMENT is a security risk. If Row level security is used, there is scope to enumerate through notes in an attempt to retrieve data. In producetion use UUID.

```ts
import Database, { Database as DatabaseType } from "better-sqlite3";
import * as fs from "fs";

let db: DatabaseType | null = null;

/**
 * Initializes the database if needed (creates DB file and schema)
 */
async function getDb(): Promise<DatabaseType > {
  // If the database hasn't been loaded yet
  if (!db) {
    // Get the path
    const dbPath = process.env.DB_PATH;
    if (!dbPath) {
      throw new Error("DB_PATH Environment Variable is not set!");
    }

    // Initialize it if needed
    const isNewDb = !fs.existsSync(dbPath);
    db = new Database(dbPath);

    // NOTE, we could also use `CREATE TABLE if NOT EXISTS` here too
    if (isNewDb) {
      db.exec(`
        CREATE TABLE notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          body TEXT NOT NULL
        );
        INSERT INTO notes (title, body) VALUES
          ('First Note', 'This is the first note in the database.'),
          ('Second Note', 'This is the second note for demonstration purposes.');
      `);
    }
  }
  return db;
}


// This is async because of the "use server"; directive
export async function readNote(
  id: number,
): Promise<{ id: number; title: string; body: string } | undefined> {
  "use server";
  const db = await getDb();
  const stmt = db.prepare("SELECT * FROM notes WHERE id = ?");
  const result = stmt.get(id) as
    | { id: number; title: string; body: string }
    | undefined;
  return result;
}

export { getDb, getDb as useDb };
```

This can be used in the `src/routes/index.tsx` like so:

```tsx
import { createResource, Suspense } from "solid-js";
import { readNote } from "~/lib/db";

// Loading component
function LoadingSpinner() {
  return <p>Loading...</p>;
}

// Private data display component
function PrivateDataCard({ data }: { data: any }) {
  return (
    <div class="bg-red-100 border-2 border-red-500 p-4 rounded-lg">
      <p class="text-red-800 font-bold">🔒 Private Data</p>
      <pre class="text-red-700 whitespace-pre-wrap break-words">
        {JSON.stringify(data)}
      </pre>
    </div>
  );
}

// Note display component
function NoteDisplay({ noteId }: { noteId: number }) {
  const [note] = createResource(noteId, readNote);

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <PrivateDataCard data={note()} />
    </Suspense>
  );
}

export default function Home() {
  const note_id = 1;

  return (
    <main class="text-center mx-auto text-gray-700 p-4">
      <NoteDisplay noteId={note_id} />
    </main>
  );
}

```

![The Image](:/2d90851b78fb4b8f89ab3e11de2q43k9)





#### Protect the data

##### Overview

[Sessions](https://docs.solidjs.com/solid-start/advanced/session) [^1752924395] access encrypted (with `SESSION_SECRET`) data uploaded by the client. This is a HTTP request so we can only check it once, ideally as close to the route as possible (to avoid the likelihood of accessing it twise, a race condition).

Data security should be implemented as close to the source of the data as possible [^1752924552], to ensure it there is no space in between the guard and the data.

There are three areas of concern:

1. Accessing the Route
    - Get the session
    - Check the user id is permitted to visit that route
        - Throw a server side redirect otherwise
2. Accessing rows from the database
    - Pass the user_id up to this function
    - Test if the user_id is permitted to:
        1. Access rows from the database at all
        2. Access specific rows
3. Establishing a connection to the database
    - Pass the user_id up to this function
    - Test of the `user_id` is permitted to establish a connection.


##### Create Connection Types

Create Two types, one to represent a User and the other to represent the
session details. We choose not to store the user details in the session and
instead retrieve details and permissions as needed from the auth database. If
the auth-scope is changed externally whilst the cookie is valid (`Max-Age`),
this will catch that in a single place.

> [!INFO]
> Imagine an ACL in the settings of a wiki. If an admin restricts the page
> access, this should be reflected immediately.

```ts
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
```

##### Guard the Connection

> [!NOTE]
> Always set guards as close to the data source as possible, don't expect a
> route block to catch everything (e.g. a sidebar may leak) and don't rely on
> Middleware.


The simplest way to protect the data, is to ensure the database getter `getDb`
requires a `user_id` and checks if that `user_id` has permission to establish a
connection.

```ts
async function getDb(user_id: string): Promise<DatabaseType | null> {
  "use server";
  // Check if the user has permission to connect to the database
  if (!user_id) {
    // Assume all valid users can connect to the database
    // Could query the auth database here
    return null;
  }
```

So the database connection getter would be:

```ts
/**
 * Initializes the database if needed (creates DB file and schema)
 */
async function getDb(user_id: string): Promise<DatabaseType | null> {
  "use server";
  // Check if the user has permission to connect to the database
  if (!user_id) {
    // Assume all valid users can connect to the database
    return null;
  }

  // If the database hasn't been loaded yet
  if (!db) {
    // Get the path
    const dbPath = process.env.DB_PATH;
    if (!dbPath) {
      throw new Error("DB_PATH Environment Variable is not set!");
    }

    // Initialize it if needed
    const isNewDb = !fs.existsSync(dbPath);
    db = new Database(dbPath);

    if (isNewDb) {
      db.exec(`
        CREATE TABLE notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          body TEXT NOT NULL
        );
        INSERT INTO notes (title, body) VALUES
          ('First Note', 'This is the first note in the database.'),
          ('Second Note', 'This is the second note for demonstration purposes.');
      `);
    }
  }
  return db;
}
```

##### Row Level Security

In addition, certain users should only be able to read certain things in the database, so the getters should also check for user_id:

```ts
export async function readNote(
  note_id: number,
  user_id: string,
): Promise<{ id: number; title: string; body: string } | undefined | null> {
  "use server";
  // Check if the user has permission to read any notes at all
  if (!user_id) {
    // Assume all valid users can read some notes
    return null;
  }

  // Connect to the db
  const db = await getDb(user_id);
  if (!db) {
    return undefined;
  }
  // Get the user id to filter the database with (RLS)
  // (Not implemented here, but use a `WHERE = ...`
  const user = await getUser();
  if (!user) {
    return undefined;
  }

  // Here we would pass user_id to implement Row Level Security
  const stmt = db.prepare("SELECT * FROM notes WHERE id = ?");
  const result = stmt.get(note_id) as
    | { id: number; title: string; body: string }
    | undefined;
  return result;
}

```

##### Fetching the Session

Thus far, we have only used a `user_id` value to test for database access. Here we call a function (we'll define it later) to retrieve the `user_id` if they've already logged in.

We haven't implemented it yet, but assume a function has been defined:

```ts
export async function getUser(): Promise<User | null>
```


Now in the route, the session should be fetched:

> [!WARNING]
> The `throw redirect`  **only** protects that **one** route. Always implement data protection as close to the source as possible.
> Do not rely on middleware for security [^1752924552].

> [!NOTE]
> `<Suspense>` will still flash the contents of `<PrivateDataCard` without the content of `note()`. Use `<Show when={note()} falback=<p>{"Checking Auth..."}</p>>` to
> hide the content without auth.

```tsx

import { createAsync, query, redirect } from "@solidjs/router";
import { Show } from "solid-js";
import { getUser } from "~/lib/auth";
import { readNote } from "~/lib/db";


const getPageData = query(async function () {
  "use server";
  const user = await getUser();
  if (!user) {
    throw redirect("/login");
  }

  // Execute all queries with the same user_id
  const notes = await readNote(1, user.id);
  // Add more queries here as needed:
  // const tags = await readTags(user.id);

  return { notes, user };
}, "PageData");

export default function Home() {
  const pageData = createAsync(() => getPageData());

  // Although the Docs suggest Suspense, it flashes the page to the user
  // Show is more protective.
  return (
    <main class="text-center mx-auto text-gray-700 p-4">
      <Show when={pageData()} fallback={<LoadingSpinner />}>
        <PrivateDataCard data={pageData()?.notes} />
      </Show>
    </main>
  );
}
```


The `query` function creates a
[memo](https://www.solidjs.com/tutorial/introduction_memos?solved) with cache
invalidation that persists
across server and client side as well as browser navigation, this reduces the
data being refetched each time. If the data should be refetched very
frequently, like a very active forum , consider omitting that, for a weekly
client dashboard this will improve performance.

"*Using `query` in `createResource` directly will not work since the fetcher is not reactive, so it will not invalidate properly.*"  instead we use [createSync] [^1752926042]


> [!NOTE]
> The [createAsync] function is a light wrapper of `createResource` which
> serves as a stand-in for a future primitive being brought to Solid core in
> 2.0 [^1752926042], It's only available in Solid Router and for now Solid Core
> only has `createResource`. Unless one needs access to fetchers and mutaters,
> favour [createAsync] when using Server Side Rendering.
>
> See generally [Using createResource for Server Side function](000637828a620d59bb65e027e315306f), which needs to be updated to indicate a preference for [createAsync].



Note that this is similar to  [Using createResource for Server Side function](000637828a620d59bb65e027e315306f), however, `query` is used instead

> [!INFO]
> The example at [docs/solid-start/advanced/auth] [^1752924311] is not fully complete, this was adapted also from [docs/solid-router/reference/data-apis/create-async] [^1752926042]

If one merely wants to protect a route that doesn't require any data, this pattern can still be implemented:


```tsx
// Use an explicit route guard pattern for clarity
const routeGuardQuery = query(async () => {
  "use server";

  const user = await getUser();
  if (!user) {
    throw redirect("/login");
  }
  return user.id;
}, "routeGuard");


export default function Home() {
  const routeGuard = createAsync(() => routeGuardQuery());

  // Assume this data does not require any user authentication (e.g. random photos from imgur)
  const photo_id = 1;
  const photoURL = createAsync(() => getPhotoURL(photo_id));

  // Although the Docs suggest Suspense, it flashes the page to the user
  // Show is more protective.
  return (
    <Show when={routeGuard()} fallback=<p>{"Checking Auth..."}</p>>
      <main class="text-center mx-auto text-gray-700 p-4">
        <Suspense fallback={"Loading..."}>
          <Gallery data={photoURL()} />
        </Suspense>
      </main>
    </Show>
  );
}
```


In this case the `getUser` function is throwing a server side redirect if the user is not authenticated.

### Implementing an Auth Session


Now that we've seen how an Auth Session can be used to implement security against data and routes we show how to implement that authentication logic.

Overall it's quite straightforward, the only complex part is the user sessions:

> [!WARNING]
> There is a risk of inadvertantly hard coding a valid `user_id` during dev
> The hope is the route level protection would catch this. **NEVER** hard code client ID values in development.
>
> Create `user_id` as a UUID and then join back to resolve external `supplier_id` to reduce the risk of enumeration.

1. Sessions
    - Create a Session (`useSession<UserSessionData>()`)
        - This is an empty session without `user_id`, if it's called inadvertantly, it will be invalid.
    - Read a Session into User details (match `id` in Auth database)
    - Update a Session
        - Not important, we keep all user details in the database
        - Could be handly for client side stuff like themes
    - Delete a Session (logout)
2. Auth Database
    - Create Entry (Register User)
        - Updating the Auth database with a new user
        - Salt and Hash the password before writing
    - Read
        - Check a client username and password against the database
            - Compare the Hash
        - Create a Session as a side effect.
    - Update
        - Modify user details
    - Delete
        - Remove a user
3. Routes
    - Login Route
    - Registration Route
        - It's likely simplest to have a route for this with a global variable to guard against unpriviliged registration
            - As opposed to hunting for a loose script.
    - Change Password
        - Again, quality of life tool, just set a global variable.

Create a file in `src/lib/auth.ts`

#### Creating an Auth Database


The following logic loads/initializes a database and creates a couple helper functions.
Here we use a separate database for auth details, this way we can block access to the database connection itself.

```ts
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

```

#### Session Management
##### Overview
Sessions use a password `SESSION_SECRET` (an enironment variable) that encrypts a cookie the client stores. When the client visits they upload that cookie which is decrypted on the server and this can be used to get details from a user who has previously logged in.

```
# Export the output of this command as SESSION_SECRET
openssl rand -base64 32
```


The user fills out a form to create this session so any subsequent pages they visit can use that to allow them view data from the `db`. If they do not have a session, we redirect them to that form (`/login`) so they can create one (which requires there details in the database).

##### Notes
###### Always Validate Session Against Database

The following code demonstrates a footgun:

```ts
if (await useAuthSession().data) {
    // will ALWAYS RUN
} else {
    // will never run
}
```

The `.data` will always return an empty dict `{}` which is truthy in Javascript. It is **insufficient** to check if a user has been authorized, instead one should fetch the user object from the database, this confirms:

1. There is indeed a `user_id` in the session
2. That ID is still valid
    - Access may have been revoked in between the cookie (imagine a wiki/forum), without this check their session cookie will remain valid after revoked rights until `Max-Age`.
        - Whilst `query()` provides some caching, the scope is limited and a reasonable trade off for user experience.

Instead, use only the `id` from the session data and fetch the remaining details directly from the server database.



##### Code

> [!WARNING]
> `await useAuthSession().data` is always `true`. Always retrieve user details
> from the database to get current details such as access control

> [!NOTE] If this won't run over SSL (e.g. VPN) then enable httpOnly cookies:
>
> ```ts
>      cookie: {
>        secure: process.env.NODE_ENV === "production" && process.env.FORCE_HTTPS === "true",
>        httpOnly: true,
>        sameSite: "lax",
>      },
> ```

```ts
////////////////////////////////////////////////////////////////////////////////
// Session Management //////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

// Create Session ...............................................................
export type UserSessionData = {
  id: string;
  username: string;
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
/**
 * Get the current user data from the Session
 *
 * Do not rely on merely getting the session
 *    1. session.data = {} which is truth
 *    2. The user could have been removed from the db
 *    3. User details may have changed
 *        - These need to be pulled out of the db
 * @returns Promise that resolves to the user session data if authenticated, or null if not authenticated
 */
export async function getUser(): Promise<UserSessionData | null> {
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
      clearAuthSessionLougout();
      return null;
    }

    // Build and return user object with current data from database
    const userData: UserSessionData = {
      id: result.id,
      username: result.username,
      theme: session.data.theme, // Preserve theme from session if it exists
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
export async function clearAuthSessionLougout() {
  "use server";
  const session = await useAuthSession();
  await session.clear();
}
```


#### Creating Users
When a user logs in, the submitted details are checked against the database to
ensure they are authorized, if they do, a new session is created, this is what
is checked before they can load data.

##### Salting and Hashing

> [!NOTE]
> Bcrypt adds a random salt to a string, hashes that string and then appends the salt to the end.
> This is convenient but it means the server must see the password, which is probably fine.


```ts
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

```

##### Creating Users
###### Create (Register) and Read (Login)

```ts
////////////////////////////////////////////////////////////////////////////////
// Users Registration //////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

interface RegistrationMessage {
  success: boolean;
  error?: string;
}

const REGISTRATION_OPEN = false;

// Create User (Register) .......................................................
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
  if (!REGISTRATION_OPEN) {
    return {
      success: false,
      error: `Registration is Closed`,
    };
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
    session.update({ id: userId, username: username });
    return { success: true };
  } catch (error) {
    const error_msg = `Error Logging in User: ${error}`;
    console.error(error_msg);
    return { success: false, error: error_msg };
  }
}

```


###### Update and Delete

```ts
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
```

### Implementing a Login Page
#### Login Page
```tsx
import { createSignal, JSXElement, onMount } from "solid-js";
import { loginUser } from "~/lib/auth";

export default function LoginPage(): JSXElement {
  const [username, setUsername] = createSignal<string>("");
  const [password, setPassword] = createSignal<string>("");

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const result = await loginUser(username(), password());
    alert(JSON.stringify(result));
    console.log(username, password);
  };

  let usernameInputRef: HTMLInputElement | undefined;

  onMount(() => {
    if (usernameInputRef) {
      usernameInputRef.focus();
    }
  });

  return (
    <form
      onSubmit={handleSubmit}
      class="max-w-sm mx-auto p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded"
    >
      <div class="mb-4">
        <label
          for="username"
          class="block text-sm text-gray-900 dark:text-gray-100 mb-2"
        >
          Name:
        </label>
        <input
          ref={usernameInputRef}
          id="username"
          type="text"
          value={username()}
          onInput={(e) => setUsername(e.target.value)}
          class="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:border-blue-500"
        ></input>
      </div>
      <div class="mb-4">
        <label
          for="password"
          class="block text-sm text-gray-900 dark:text-gray-100 mb-2"
        >
          Password:
        </label>
        <input
          id="password"
          type="password"
          value={password()}
          onInput={(e) => setPassword(e.target.value)}
          class="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:border-blue-500"
        ></input>
      </div>
      <div>
        <input
          type="submit"
          value="Sign in"
          class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded cursor-pointer"
        />
      </div>
    </form>
  );
}
```
#### Generic Component
Login would be:

```tsx

import { JSXElement } from "solid-js";
import AuthForm from "~/components/AuthForm";

export default function LoginPage(): JSXElement {
  return <AuthForm type="login" />;
}
```

Register:

```tsx

import { JSXElement } from "solid-js";
import AuthForm from "~/components/AuthForm";

export default function RegisterPage(): JSXElement {
  return <AuthForm type="register" />;
}
```


The general component

```tsx

import { createSignal, JSXElement, onMount } from "solid-js";
import { loginUser } from "~/lib/auth";

export default function LoginPage(): JSXElement {
  const [username, setUsername] = createSignal<string>("");
  const [password, setPassword] = createSignal<string>("");

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const result = await loginUser(username(), password());
    alert(JSON.stringify(result));
    console.log(username, password);
  };

  let usernameInputRef: HTMLInputElement | undefined;

  onMount(() => {
    if (usernameInputRef) {
      usernameInputRef.focus();
    }
  });

  return (
    <form
      onSubmit={handleSubmit}
      class="max-w-sm mx-auto p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded"
    >
      <div class="mb-4">
        <label
          for="username"
          class="block text-sm text-gray-900 dark:text-gray-100 mb-2"
        >
          Name:
        </label>
        <input
          ref={usernameInputRef}
          id="username"
          type="text"
          value={username()}
          onInput={(e) => setUsername(e.target.value)}
          class="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:border-blue-500"
        ></input>
      </div>
      <div class="mb-4">
        <label
          for="password"
          class="block text-sm text-gray-900 dark:text-gray-100 mb-2"
        >
          Password:
        </label>
        <input
          id="password"
          type="password"
          value={password()}
          onInput={(e) => setPassword(e.target.value)}
          class="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:border-blue-500"
        ></input>
      </div>
      <div>
        <input
          type="submit"
          value="Sign in"
          class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded cursor-pointer"
        />
      </div>
    </form>
  );
}

```





## See Also


- [Authentication and Caddy](:/6484bb0d-cf36-456d-a221-169117db4aa1)
    - Shows how to set up  HTTP Basic Authentication



[^1752924311]: https://docs.solidjs.com/solid-start/advanced/auth
[^1752924395]: https://docs.solidjs.com/solid-start/advanced/session
[^1752924523]: https://docs.solidjs.com/solid-start/reference/server/use-server
[^1752926042]: https://docs.solidjs.com/solid-router/reference/data-apis/create-async
[^1752926214]: https://docs.solidjs.com/solid-router/reference/data-apis/query
[^1752924552]: https://docs.solidjs.com/solid-start/advanced/middleware
[docs/solid-start/advanced/auth]: https://docs.solidjs.com/solid-start/advanced/auth
[docs/solid-router/reference/data-apis/create-async]: https://docs.solidjs.com/solid-router/reference/data-apis/create-async
[createAsync]: https://docs.solidjs.com/solid-router/reference/data-apis/create-async


