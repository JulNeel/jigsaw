import { SignUpForm } from "@/app/sign-in/sign-up-form";

// Sign-in form arrives in Story 1.3, alongside this sign-up form, on the
// same screen (EXPERIENCE.md IA: a single "Connexion / Inscription" surface).
export default function SignInPage() {
  return (
    <div>
      <h1>Jigsaw</h1>
      <SignUpForm />
    </div>
  );
}
