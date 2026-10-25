// AUTH-01a Sign in: email (Figma 66:5708, with the sign-up link from row "1b").

import { useState, type FormEvent } from "react";
import { pb } from "../lib/pb";
import { emailError, errorCopy, normalizeEmail, requestCode } from "../lib/auth";
import { ActionBar, Brand, Button, TextField } from "../components/ui";

interface Props {
  initialEmail: string;
  onCodeSent: (email: string, otpId: string) => void;
  onCreateAccount: (email: string) => void;
}

export function SignInEmail({ initialEmail, onCodeSent, onCreateAccount }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    const value = normalizeEmail(email);
    const invalid = emailError(value);
    setError(invalid);
    if (invalid) return;
    setSending(true);
    try {
      onCodeSent(value, await requestCode(pb, value));
    } catch (failure) {
      setError(errorCopy(failure));
      setSending(false);
    }
  }

  return (
    <form className="screen" onSubmit={submit} noValidate>
      <div className="screen-content">
        <Brand />
        <h1 className="t-title-section">Sign in</h1>
        <TextField
          id="signin-email"
          label="Email"
          help="Use the email the club has on file. We'll send you a sign-in code."
          placeholder="name@example.com"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          error={error}
          onValueChange={(value) => {
            setEmail(value);
            if (error) setError(null);
          }}
          onBlur={() => {
            const value = normalizeEmail(email);
            if (value) setError(emailError(value));
          }}
        />
        <Button variant="text" onClick={() => onCreateAccount(normalizeEmail(email))}>
          New here? Create an account
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
