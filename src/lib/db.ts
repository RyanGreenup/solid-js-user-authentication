import Database, { Database as DatabaseType } from "better-sqlite3";
import * as fs from "fs";
import { getUser } from "./auth";

let db: DatabaseType | null = null;

/**
 * Initializes the database if needed (creates DB file and schema)
 */
async function getDb(): Promise<DatabaseType | null> {
  "use server";
  // Do not give back the connection if the user is not authorized at all
  const user = await getUser();
  if (!user || !user.user_id) {
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

export async function readNote(
  id: number,
): Promise<{ id: number; title: string; body: string } | undefined> {
  "use server";
  // Connect to the db
  const db = await getDb();
  if (!db) {
    return undefined;
  }
  // Get the user id to filter the database with (RLS)
  // (Not implemented here, but use a `WHERE = ...`
  const user = await getUser();
  if (!user) {
    return undefined;
  }
  const userId = user.user_id;

  const stmt = db.prepare("SELECT * FROM notes WHERE id = ?");
  const result = stmt.get(id) as
    | { id: number; title: string; body: string }
    | undefined;
  return result;
}

export { getDb, getDb as useDb };
