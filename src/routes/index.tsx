import { createAsync, query, redirect } from "@solidjs/router";
import { Show, Suspense } from "solid-js";
import { getUser } from "~/lib/auth";
import { readNote } from "~/lib/db";

// Loading component
function LoadingSpinner() {
  return (
    <main class="text-center mx-auto text-gray-700 p-4">
      <p>Checking Auth...</p>
    </main>
  );
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

const getPrivatePosts = query(async function () {
  "use server";
  const user = await getUser();
  if (!user) {
    throw redirect("/login");
  }

  return readNote(1, user.id);
}, "AuthCheck");

export default function Home() {
  const note_id = 1;
  const note = createAsync(() => getPrivatePosts());

  // Although the Docs suggest Suspense, it flashes the page to the user
  // Show is more protective.
  return (
    <main class="text-center mx-auto text-gray-700 p-4">
        <Show when={note()} fallback={<LoadingSpinner />}>
          <PrivateDataCard data={note()} />
        </Show>
    </main>
  );
}
