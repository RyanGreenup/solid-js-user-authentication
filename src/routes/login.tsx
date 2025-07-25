import { useSubmission, type RouteSectionProps } from "@solidjs/router";
import CircleAlert from "lucide-solid/icons/circle-alert";
import { JSXElement, Show } from "solid-js";
import { loginOrRegister } from "~/lib/auth";

export const LOGIN_ROUTE = "/login";

const Card = (props: { children: JSXElement }): JSXElement => {
  return (
    <div class="card w-full max-w-md bg-base-100 shadow-xl">
      <div class="card-body">{props.children}</div>
    </div>
  );
};

const CardHeading = (props: { title: string }): JSXElement => {
  return (
    <h1 class="card-title text-2xl font-bold text-center w-full">
      {props.title}
    </h1>
  );
};

export default function Login(props: RouteSectionProps) {
  const loggingIn = useSubmission(loginOrRegister);

  return (
    <main class="min-h-screen flex items-center justify-center bg-base-200">
      <Card>
        <CardHeading title="Member Portal" />
        <form action={loginOrRegister} method="post" class="space-y-6">
          <input
            type="hidden"
            name="redirectTo"
            value={props.params.redirectTo ?? "/"}
          />

          <AccountActionSelector />

          <div class="form-control">
            <FormLabel label="Username" />
            <input
              id="username-input"
              name="username"
              type="text"
              placeholder="Enter username"
              class="input input-bordered"
              required
              autocomplete="username"
            />
          </div>

          <div class="form-control">
            <FormLabel label="Password" />

            <input
              id="password-input"
              name="password"
              type="password"
              placeholder="Enter password (32 char)"
              class="input input-bordered"
              required
              autocomplete="current-password"
            />
          </div>

          <button
            type="submit"
            class="btn btn-primary w-full"
            disabled={loggingIn.pending}
          >
            <Show when={loggingIn.pending} fallback="Continue">
              <span class="loading loading-spinner"></span>
            </Show>
          </button>

          <Show when={loggingIn.result}>
            <div class="alert alert-error">
              <CircleAlert class="stroke-current shrink-0 h-6 w-6" />
              <span role="alert" id="error-message">
                {loggingIn.result!.message}
              </span>
            </div>
          </Show>
        </form>
      </Card>
    </main>
  );
}

const FormLabel = (props: { label: string }) => {
  return (
    <label class="label">
      <span class="label-text font-medium">{props.label}</span>
    </label>
  );
};

const RadioOption = (props: {
  name: string;
  value: string;
  label: string;
  checked?: boolean;
}) => {
  return (
    <label class="label cursor-pointer flex items-center gap-2">
      <input
        type="radio"
        name={props.name}
        value={props.value}
        checked={props.checked}
        class="radio radio-primary"
      />
      <span class="label-text">{props.label}</span>
    </label>
  );
};

const AccountActionSelector = () => {
  return (
    <div>
      <FormLabel label="Account Action" />
      <div class="flex gap-4">
        <RadioOption
          name="loginType"
          value="login"
          label="Login"
          checked={true}
        />
        <RadioOption name="loginType" value="register" label="Register" />
      </div>
    </div>
  );
};
