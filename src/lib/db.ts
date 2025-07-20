import Database, { Database as DatabaseType } from "better-sqlite3";
import * as fs from "fs";

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
          id TEXT NOT NULL PRIMARY KEY DEFAULT (hex(randomblob(16))),
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO notes (id, title, body) VALUES
          (hex(randomblob(16)), 'First Note', 'This is the first note in the database.'),
          (hex(randomblob(16)), 'Second Note', 'This is the second note for demonstration purposes.');
      `);
    }
  }
  return db;
}

export async function listNotes(
  user_id: string,
): Promise<{ id: string; title: string; body: string }[]> {
  "use server";
  if (!user_id) {
    return [];
  }

  const db = await getDb(user_id);
  if (!db) {
    return [];
  }

  const stmt = db.prepare("SELECT * FROM notes ORDER BY created_at DESC");
  const results = stmt.all() as { id: string; title: string; body: string }[];
  return results;
}

export async function readNote(
  note_id: string,
  user_id: string,
): Promise<{ id: string; title: string; body: string } | undefined | null> {
  "use server";
  if (!user_id) {
    return null;
  }

  const db = await getDb(user_id);
  if (!db) {
    return undefined;
  }

  // Here we would pass user_id to implement Row Level Security
  const stmt = db.prepare("SELECT * FROM notes WHERE id = ?");
  const result = stmt.get(note_id) as
    | { id: string; title: string; body: string }
    | undefined;
  return result;
}

export { getDb, getDb as useDb };
