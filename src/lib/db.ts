import Database, { Database as DatabaseType } from "better-sqlite3";
import * as fs from "fs";
import { getUser } from "./auth";

let db: DatabaseType | null = null;

/**
 * Initializes the database if needed (creates DB file and schema)
 */
async function getDb(user_id: string): Promise<DatabaseType | null> {
  "use server";
  // Check if the user has permission to connect to the database
  if (!user_id) {
    // Assume all valid users can connect to the database
    // Could check the users database to check for this permission
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

export { getDb, getDb as useDb };
