import {
  createAsync,
  query,
  redirect,
  type RouteDefinition,
} from "@solidjs/router";
import { getUser, logout, requireUser } from "~/lib/auth";

export const route = {
  preload() {
    getUser();
  },
} satisfies RouteDefinition;

export default function Home() {
  const user = createAsync(() => getUser(), { deferStream: true });
  const data = createAsync(() => privateData(), { deferStream: true });

  return (
    <main class="w-full p-4 space-y-2">
      <h2 class="font-bold text-3xl">Hello {user()?.username}</h2>
      <h3 class="font-bold text-xl">Message board</h3>
      <p>{data()}</p>
      <form action={logout} method="post">
        <button name="logout" type="submit">
          Logout
        </button>
      </form>
    </main>
  );
}

/**
 * Simulate getting Private data by:
 *
 * 1. Checking the user is defined (i.e. are cookies enabled)
 * 2. Checking the user is authorized
 * 3. Connecting to the database
 * 4. Returning the data
 *
 */
const privateData = query(async function (): Promise<string> {
  "use server";
  // Check the user is authorized to get this data
  const user = await requireUser();
  if (await isAuthorized(user.id)) {
    // Get the database connection
    const conn = await getDbConnection();
    return conn.data;
  }

  throw redirect("/login");
}, "privateData");

/**
 * Simulate Getting a Database Connection
 *
 * 1. Is the user defined (i.e. are cookies enabled)
 * 2. Is the user authorized
 * 3. Return the db object (in this case just true)
 *
 */
const getDbConnection = query(async function (): Promise<{ data: string }> {
  "use server";
  // Confirm the user is permitted to have a db connection
  const user = await requireUser();
  if (await isAuthorized(user.id)) {
    // Return true as db connection
    return { data: "Some Private Data" };
  }
  throw redirect("/login");
}, "conn");

/**
 * Simulate verifying user auth
 */
const isAuthorized = query(async function (user_id: string): Promise<boolean> {
  "use server";
  if (user_id.length > 0) {
    return true;
  }
  return true;
}, "userAuth");
