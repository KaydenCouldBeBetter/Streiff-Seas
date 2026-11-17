// The signed-out screens and the step between them (screens.md §3): AUTH-01 Sign in or
// AUTH-03 Create an account → AUTH-02 code → signed in (MemberApp). A held session that has
// expired or been refused shows SYS-04a first, on open or when the app comes back (MemberApp).

import { useEffect, useState } from "react";
import type { RecordModel } from "pocketbase";
import { pb } from "../lib/pb";
import { checkSession } from "../lib/auth";
import { SignInEmail } from "./SignInEmail";
import { CreateAccount } from "./CreateAccount";
import { SignInCode } from "./SignInCode";
import { LiveCheck } from "./LiveCheck";
import { MemberApp } from "./MemberApp";
import { SessionEnded } from "./SessionEnded";

interface PendingCode {
  email: string;
  name: string;
  otpId: string;
  requestedAt: number;
  from: "signin" | "signup";
}

type Step =
  | { kind: "starting" }
  | { kind: "ended"; email: string }
  | { kind: "signin"; email: string }
  | { kind: "signup"; email: string; name: string }
  | ({ kind: "code" } & PendingCode)
  | { kind: "signedIn"; user: RecordModel };

// The code step survives a reload: a phone may drop the page while the member reads the email.
const PENDING_KEY = "cf.pendingCode";

function loadPending(): PendingCode | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as PendingCode | null;
    return saved && typeof saved.otpId === "string" && typeof saved.email === "string" ? saved : null;
  } catch {
    return null;
  }
}

function savePending(pending: PendingCode | null): void {
  try {
    if (pending) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Private browsing: the code step just won't survive a reload.
  }
}

// Signed in, MemberApp titles each screen.
const TITLES: Record<Exclude<Step["kind"], "signedIn">, string> = {
  starting: "Chromie Fishing",
  ended: "Session ended · Chromie Fishing",
  signin: "Sign in · Chromie Fishing",
  signup: "Create an account · Chromie Fishing",
  code: "Enter code · Chromie Fishing",
};

export function AuthFlow() {
  const [step, setStep] = useState<Step>({ kind: "starting" });

  useEffect(() => {
    let live = true;
    void checkSession(pb).then((session) => {
      if (!live) return;
      const pending = loadPending();
      if (session.kind === "active") setStep({ kind: "signedIn", user: session.user });
      else if (session.kind === "ended") setStep({ kind: "ended", email: session.email });
      else if (pending) setStep({ kind: "code", ...pending });
      else setStep({ kind: "signin", email: "" });
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (step.kind !== "signedIn") document.title = TITLES[step.kind];
  }, [step.kind]);

  function toCode(pending: PendingCode) {
    savePending(pending);
    setStep({ kind: "code", ...pending });
  }

  function leaveCode(next: Step) {
    savePending(null);
    setStep(next);
  }

  switch (step.kind) {
    case "starting":
      return null;
    case "ended":
      return <SessionEnded onSignIn={() => setStep({ kind: "signin", email: step.email })} />;
    case "signin":
      return (
        <SignInEmail
          key="signin"
          initialEmail={step.email}
          onCodeSent={(email, otpId) => toCode({ email, name: "", otpId, requestedAt: Date.now(), from: "signin" })}
          onCreateAccount={(email) => setStep({ kind: "signup", email, name: "" })}
        />
      );
    case "signup":
      return (
        <CreateAccount
          key="signup"
          initialName={step.name}
          initialEmail={step.email}
          onCodeSent={(name, email, otpId) => toCode({ email, name, otpId, requestedAt: Date.now(), from: "signup" })}
          onSignIn={(email) => setStep({ kind: "signin", email })}
        />
      );
    case "code": {
      const back: Step = step.from === "signup" ? { kind: "signup", email: step.email, name: step.name } : { kind: "signin", email: step.email };
      return (
        <SignInCode
          key={`code-${step.email}`}
          email={step.email}
          otpId={step.otpId}
          requestedAt={step.requestedAt}
          from={step.from}
          onBack={() => leaveCode(back)}
          onDifferentEmail={() => leaveCode(step.from === "signup" ? { kind: "signup", email: "", name: step.name } : { kind: "signin", email: "" })}
          onResent={(otpId, requestedAt) => toCode({ ...step, otpId, requestedAt })}
          onSignedIn={(user) => leaveCode({ kind: "signedIn", user })}
        />
      );
    }
    case "signedIn":
      // The bare live page (M0-03): /#live opens it instead of the app, after sign-in if needed.
      if (window.location.hash === "#live") {
        return (
          <LiveCheck
            onSignOut={() => {
              pb.authStore.clear();
              setStep({ kind: "signin", email: String(step.user.email ?? "") });
            }}
          />
        );
      }
      return (
        <MemberApp
          user={step.user}
          onUserChange={(user) => setStep({ kind: "signedIn", user })}
          onSessionEnded={(email) => setStep({ kind: "ended", email })}
          onSignOut={() => {
            pb.authStore.clear();
            setStep({ kind: "signin", email: String(step.user.email ?? "") });
          }}
        />
      );
  }
}
