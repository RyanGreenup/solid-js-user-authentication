Ok, I was wrong before. We can check the cookie as many times as we like on the server side, Solid-JS will automatically handle that to check once.


However, one MUST wrap all data in `<Suspense>` like so:



```tsx
const getPageData = query(async function () {
  "use server";
  const user = await getUser();
  if (!user) {
    throw redirect("/login");
  }

   const notes = await listNotes(user.id);
   const tags = await readTags(user.id);

  return { notes, user };
}, "PageData");

export default function Home() {
  const pageData = createAsync(() => getPageData());

  return (
    <main class="text-center mx-auto text-gray-700 p-4">
        <Suspense>
          <PrivateDataCard data={Notes()} />
      </Show>
    </main>
  );

}
```


That will flash the contents underneath though, which can look unprofessional. Using `<Show` should hide it but it will cause the session to be checked multiple times an the server will throw errors, it's essentially a data race, which may lead to unexpected behaviour.

Do NOT do this:

```tsx

export default function Home() {
  const pageData = createAsync(() => getPageData());

  return (
    <main class="text-center mx-auto text-gray-700 p-4">
    /* NOTE pageData() = {} would be truthy, be careful of this */
      <Show when={pageData()}>
        <Suspense>
          <PrivateDataCard data={Notes()} />
        </Suspense>
      </Show>
    </main>
  );

}
```


Instead one must use the reactivity of solid-js, with a Signal and createEffect to control `<Show` if the page content really is that private. Here's an example of a RouteGuard component that hides and redirects a route if a user is not set:


```tsx

import { createAsync, query, redirect } from "@solidjs/router";
import { getUser } from "./auth";
import { createEffect, createSignal, JSXElement, Show, Suspense } from "solid-js";

// Create a simple RouteGuard
const ensureAuthenticated = query(async function () {
  "use server";
  const user = await getUser();

  /* NOTE if user = {} it is truthy, must check user.id */
  /* NOTE, probably best to ONLY track user.id, ALWAYS validate user information
     directly against the database, not the cookie, it may change in between
     cookie session */
  if (!user || !user.id) {
    throw redirect("/login");
  }
  return true;
}, "isValidUser");

export function RouteGuard(props: { children: JSXElement }) {
  const userAuthStatus = createAsync(() => ensureAuthenticated());
  const [isUser, setIsUser] = createSignal(false);

  createEffect(() => {
    if (userAuthStatus()) {
      setIsUser(true);
    }
  });

  return (
    <Suspense>
      <Show when={isUser()}>{props.children}</Show>
    </Suspense>
  );
}
```


Which could be used like so, to ensure that only users that are logged in may see the route whatso-ever at all:


```tsx

  return (
    <main class="text-center mx-auto text-gray-700 p-4">
      <RouteGuard>
        <Suspense>
          <PrivateDataCard data={Notes()} />
        </Suspense>
      </RouteGuard>
    </main>
  );

```


One could probably alsu use `ensureAuthenticated` in place of `getUser` throughout the server side code to save re-checking the cookie. I wouldn't recommend this, checking the cookie is cheap, so one may as well.


The key insight:


1. The session can be accessed as many times on the server side
    - Check that a valid user is set as close to the data as possible
2. Wrap server-side data fetches in `query` to reduce latency
3. Expose data to client using createAsync (not createResource) [^838932893]
4. Always wrap the signal of createAsync in `<Suspense>`
    - Note a `throw redirect` in a `Suspense` may still show the underlying page
    - Use `<Show` with a signal to hide the page until the data has loaded
5. Never use `<Show` on the Result of a createAsync that is checking the session
    - It will lead to a data race
    - Instead, use a signal with `createEffect` that is set when the data is available, that way the session is only checked once and there is no data race.







[^838932893]: https://docs.solidjs.com/solid-router/reference/data-apis/create-async
