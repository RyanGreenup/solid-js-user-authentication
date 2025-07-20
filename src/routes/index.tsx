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
