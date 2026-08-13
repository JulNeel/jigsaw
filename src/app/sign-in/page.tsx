import { SignInForm } from "@/app/sign-in/sign-in-form";
import { SignUpForm } from "@/app/sign-in/sign-up-form";

export default function SignInPage() {
  return (
    <div>
      <h1>Jigsaw</h1>

      <section aria-label="Sign in">
        <h2>Sign in</h2>
        <SignInForm />
      </section>

      <section aria-label="Create an account">
        <h2>Create an account</h2>
        <SignUpForm />
      </section>
    </div>
  );
}
