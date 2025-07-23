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
