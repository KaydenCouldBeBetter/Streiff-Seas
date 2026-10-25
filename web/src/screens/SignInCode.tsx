// AUTH-02a/b/c Sign in: code (Figma 66:5717): wrong and expired codes, and a new code after 60 s.

import { useEffect, useState, type FormEvent } from "react";
import type { RecordModel } from "pocketbase";
import { pb } from "../lib/pb";
import { canResend, cleanCode, codeError, errorCopy, isExpired, requestCode, signInWithCode, CODE_LENGTH } from "../lib/auth";
import { ActionBar, Button, NavBar, TextField } from "../components/ui";

interface Props {
  email: string;
  otpId: string;
  requestedAt: number;
  /** Which screen sent the code: the back button returns there. */
  from: "signin" | "signup";
  onBack: () => void;
  onDifferentEmail: () => void;
  onResent: (otpId: string, requestedAt: number) => void;
  onSignedIn: (user: RecordModel) => void;
}

const HELP = "Paste it, or tap the code iPhone suggests above the keyboard.";

export function SignInCode({ email, otpId, requestedAt, from, onBack, onDifferentEmail, onResent, onSignedIn }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(HELP);
  const [signingIn, setSigningIn] = useState(false);
  const [resending, setResending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // A clock for "Send a new code", which is offered 60 s after the last one was sent.
  useEffect(() => {
    if (canResend(requestedAt, now)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [requestedAt, now]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (signingIn) return;
    const incomplete = codeError(code);
    setError(incomplete);
    if (incomplete) return;
    setSigningIn(true);
    try {
      onSignedIn(await signInWithCode(pb, otpId, code));
    } catch (failure) {
      setError(errorCopy(failure, isExpired(requestedAt, Date.now())));
      setSigningIn(false);
    }
  }

  async function resend() {
    if (resending) return;
    setResending(true);
    try {
      const newOtpId = await requestCode(pb, email);
      const sentAt = Date.now();
      setCode("");
      setError(null);
      setHelp("We sent a new code. Use the newest one.");
      setNow(sentAt);
      onResent(newOtpId, sentAt);
    } catch (failure) {
      setError(errorCopy(failure));
    } finally {
      setResending(false);
    }
  }

  const sentLine =
    from === "signup" ? `We sent a sign-in code to ${email}.` : `If ${email} is registered, a sign-in code is on its way.`;

  return (
    <form className="screen" onSubmit={submit} noValidate>
      <NavBar
        title="Enter code"
        backLabel={from === "signup" ? "Back" : "Email"}
        backName={from === "signup" ? "Back to Create an account" : "Back to Sign in"}
        onBack={onBack}
      />
      <div className="screen-content">
        <h2 className="t-title-large">Check your email</h2>
        <p className="t-body t-secondary">{sentLine}</p>
        <TextField
          id="signin-code"
          label="Sign-in code"
          help={help}
          autoComplete="one-time-code"
          inputMode="numeric"
          autoFocus
          maxLength={CODE_LENGTH + 8}
          value={code}
          error={error}
          onValueChange={(value) => {
            setCode(cleanCode(value));
            if (error) setError(null);
          }}
        />
        {canResend(requestedAt, now) && (
          <Button variant="text" loading={resending} onClick={resend}>
            Send a new code
          </Button>
        )}
        <Button variant="text" onClick={onDifferentEmail}>
          Use a different email
        </Button>
      </div>
      <ActionBar>
        <Button variant="primary" large type="submit" loading={signingIn} loadingLabel="Signing in…">
          Sign in
        </Button>
      </ActionBar>
    </form>
  );
}
