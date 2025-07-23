import Database, { Database as DatabaseType } from "better-sqlite3";
import * as fs from "fs";
import { getUser } from "./auth";
import { query, redirect } from "@solidjs/router";

let db: DatabaseType | null = null;

/**
 * Initializes the database if needed (creates DB file and schema)
 */
async function getDb(): Promise<DatabaseType | null> {
  "use server";
  // Do not give back the connection if the user is not authorized at all
  // Only users have need for a db connection
  const user = await getUser();
  if (!user || !user.id) {
    console.error(
      "Database access denied: User is not authenticated or missing user ID",
    );
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

/**
 * Read the note from the database based on id and user id
 *
 */
const getNote = query(async function (
  id: number,
): Promise<{ id: number; title: string; body: string } | undefined> {
  "use server";

  const user = await getUser();

  // NOTE could also use RLS, be mindful of SQL injection though
  if (!user || !user.id) {
    throw redirect("/login");
    // return undefined;
  }

  // Connect to the db
  const db = await getDb();
  if (!db) {
    return undefined;
  }

  const stmt = db.prepare("SELECT * FROM notes WHERE id = ?");
  const result = stmt.get(id) as
    | { id: number; title: string; body: string }
    | undefined;
  return result;
}, "getNote");

/**
 * List all notes from the database for the authenticated user
 */
const listNotes = query(async function (): Promise<
  Array<{ id: number; title: string; body: string }>
> {
  "use server";

  // Only users should be able to list notes
  const user = await getUser();
  if (!user || !user.id) {
    throw redirect("/login");
  }

  // Get the db connection
  const db = await getDb();
  if (!db) {
    return [];
  }

  // Get the notes
  const stmt = db.prepare("SELECT * FROM notes");
  const results = stmt.all() as Array<{
    id: number;
    title: string;
    body: string;
  }>;
  return results;
}, "listNotes");

export { getDb, getDb as useDb, getNote, listNotes };
