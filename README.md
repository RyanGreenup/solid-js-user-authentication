# User Authentication in Solid-JS

This is adapted from the [with-auth](https://github.com/solidjs/solid-start/tree/main/examples/with-auth) solid-js template, with the following changes:

1. Auth db is a Sqlite Database
2. Auth db uses salt/hash with `bcrypt`
3. Some type annotations
3. A new function, `requireUser` is introduced as `getUser` can return `undefined` when a client blocks all cookies
    - This helps avoid unexpected behaviour in production
