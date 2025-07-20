import { JSXElement } from "solid-js";
import AuthForm from "~/components/AuthForm";

export default function LoginPage(): JSXElement {
  return <AuthForm type="login" />;
}