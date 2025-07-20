import { createSignal, JSXElement, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { loginUser, registerUser } from "~/lib/auth";

interface AuthFormProps {
  type: "login" | "register";
}

export default function AuthForm(props: AuthFormProps): JSXElement {
  const [username, setUsername] = createSignal<string>("");
  const [password, setPassword] = createSignal<string>("");
  const navigate = useNavigate();

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    
    const result = props.type === "login" 
      ? await loginUser(username(), password())
      : await registerUser(username(), password());
    
    if (result.success) {
      navigate("/");
    } else {
      alert(result.error || "Authentication failed");
    }
  };

  let usernameInputRef: HTMLInputElement | undefined;

  onMount(() => {
    if (usernameInputRef) {
      usernameInputRef.focus();
    }
  });

  const buttonText = props.type === "login" ? "Sign in" : "Register";

  return (
    <form
      onSubmit={handleSubmit}
      class="max-w-sm mx-auto p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded"
    >
      <div class="mb-4">
        <label
          for="username"
          class="block text-sm text-gray-900 dark:text-gray-100 mb-2"
        >
          Name:
        </label>
        <input
          ref={usernameInputRef}
          id="username"
          type="text"
          value={username()}
          onInput={(e) => setUsername(e.target.value)}
          class="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:border-blue-500"
        />
      </div>
      <div class="mb-4">
        <label
          for="password"
          class="block text-sm text-gray-900 dark:text-gray-100 mb-2"
        >
          Password:
        </label>
        <input
          id="password"
          type="password"
          value={password()}
          onInput={(e) => setPassword(e.target.value)}
          class="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <input
          type="submit"
          value={buttonText}
          class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded cursor-pointer"
        />
      </div>
    </form>
  );
}