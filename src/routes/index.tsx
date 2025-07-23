import { createAsync, query, redirect } from "@solidjs/router";
import { createEffect, createSignal, Show, Suspense } from "solid-js";
import { getUser } from "~/lib/auth";
import { getNote, listNotes } from "~/lib/db";
import { RouteGuard } from "~/lib/RouteGuard";

// Loading component
function LoadingSpinner() {
  return (
    <main class="flex justify-center items-center p-4">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
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

const getPageData = query(async function () {
  "use server";
  const user = await getUser();
  if (!user) {
    throw redirect("/login");
  }

  // Execute all queries with the same user_id
  const notes = await listNotes();
  // Add more queries here as needed:
  // const tags = await readTags(user.id);

  return { content: notes };
}, "PageData");

export default function Home() {
  const pageData = createAsync(() => getPageData());

  // Although the Docs suggest Suspense, it flashes the page to the user
  // Show is more protective.
  return (
    <main class="text-center mx-auto text-gray-700 p-4">
      {/*Route Guard only shows page to Authorized Users*/}
      <RouteGuard>
        <Suspense fallback=<p>{"Loading Data..."}</p>>
          <PrivateDataCard data={pageData()?.content} />
        </Suspense>
      </RouteGuard>
    </main>
  );
}
