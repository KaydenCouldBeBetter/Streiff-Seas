// AUTH-03a Create an account (Figma row "1b", approved 2026-10-25; decisions.md 2026-10-25).

import { useState, type FormEvent } from "react";
import { pb } from "../lib/pb";
import { emailError, errorCopy, nameError, normalizeEmail, normalizeName, signUp } from "../lib/auth";
import { ActionBar, Brand, Button, TextField } from "../components/ui";

interface Props {
  initialName: string;
  initialEmail: string;
  onCodeSent: (name: string, email: string, otpId: string) => void;
  onSignIn: (email: string) => void;
}

export function CreateAccount({ initialName, initialEmail, onCodeSent, onSignIn }: Props) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const [emailProblem, setEmailProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    const cleanName = normalizeName(name);
    const cleanEmail = normalizeEmail(email);
    const badName = nameError(cleanName);
    const badEmail = emailError(cleanEmail);
    setNameProblem(badName);
    setEmailProblem(badEmail);
    if (badName || badEmail) return;
    setName(cleanName);
    setSending(true);
    try {
      onCodeSent(cleanName, cleanEmail, await signUp(pb, cleanName, cleanEmail));
    } catch (failure) {
      setEmailProblem(errorCopy(failure));
      setSending(false);
    }
  }

  return (
    <form className="screen" onSubmit={submit} noValidate>
      <div className="screen-content">
        <Brand />
        <h1 className="t-title-section">Create an account</h1>
        <TextField
          id="signup-name"
          label="Name"
          help="Shown on the leaderboard. You can change it later in Profile."
          placeholder="Dana Ruiz"
          autoComplete="name"
          autoCapitalize="words"
          maxLength={100}
          value={name}
          error={nameProblem}
          onValueChange={(value) => {
            setName(value);
            if (nameProblem) setNameProblem(null);
          }}
          onBlur={() => {
            if (name) setNameProblem(nameError(normalizeName(name)));
          }}
        />
        <TextField
          id="signup-email"
          label="Email"
          help="We'll send a sign-in code to this address."
          placeholder="name@example.com"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          error={emailProblem}
          onValueChange={(value) => {
            setEmail(value);
            if (emailProblem) setEmailProblem(null);
          }}
          onBlur={() => {
            const value = normalizeEmail(email);
            if (value) setEmailProblem(emailError(value));
          }}
        />
        <Button variant="text" onClick={() => onSignIn(normalizeEmail(email))}>
          Already a member? Sign in
        </Button>
      </div>
      <ActionBar>
        <Button variant="primary" large type="submit" loading={sending}>
          Send code
        </Button>
      </ActionBar>
    </form>
  );
}
