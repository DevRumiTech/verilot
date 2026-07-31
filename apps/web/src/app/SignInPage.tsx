import { useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useSession } from "../auth/SessionProvider.js";
import { ApiClientError } from "../lib/api-client.js";
import { moveKeyboardPosition } from "../lib/keyboard.js";

interface SignInFieldErrors {
  email?: string;
  password?: string;
}

interface RequestedLocationState {
  requestedPath?: unknown;
}

export function safeRequestedPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  try {
    const candidate = new URL(value, window.location.origin);

    if (candidate.origin !== window.location.origin) {
      return "/dashboard";
    }

    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return "/dashboard";
  }
}

function validate(email: string, password: string): SignInFieldErrors {
  const errors: SignInFieldErrors = {};

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (password.length === 0) {
    errors.password = "Enter your password.";
  }

  return errors;
}

export function SignInPage() {
  const location = useLocation();
  const { signIn, status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SignInFieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const requestedPath = safeRequestedPath(
    (location.state as RequestedLocationState | null)?.requestedPath,
  );

  if (status === "authenticated") {
    return <Navigate replace to={requestedPath} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    const nextErrors = validate(email, password);
    setFieldErrors(nextErrors);
    setServerError(null);

    if (nextErrors.email !== undefined) {
      moveKeyboardPosition(emailInput.current);
      emailInput.current?.select();
      return;
    }

    if (nextErrors.password !== undefined) {
      moveKeyboardPosition(passwordInput.current);
      passwordInput.current?.select();
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      await signIn({ email: email.trim(), password });
    } catch (reason) {
      if (reason instanceof ApiClientError) {
        const responseErrors: SignInFieldErrors = {
          ...(reason.fieldErrors.email?.[0] === undefined
            ? {}
            : { email: reason.fieldErrors.email[0] }),
          ...(reason.fieldErrors.password?.[0] === undefined
            ? {}
            : { password: reason.fieldErrors.password[0] }),
        };
        setFieldErrors(responseErrors);
        if (responseErrors.email !== undefined) {
          moveKeyboardPosition(emailInput.current);
          emailInput.current?.select();
        } else if (responseErrors.password !== undefined) {
          moveKeyboardPosition(passwordInput.current);
          passwordInput.current?.select();
        }
        setServerError(
          reason.code === "INVALID_CREDENTIALS"
            ? "Email or password is incorrect."
            : "Sign-in could not be completed. Try again.",
        );
      } else {
        setServerError("Sign-in could not be completed. Try again.");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout" id="main-content">
      <section className="auth-intro" aria-labelledby="sign-in-title">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            VL
          </span>
          <span>VeriLot</span>
        </div>
        <div>
          <p className="eyebrow">Secure operations</p>
          <h1 id="sign-in-title">Sign in to VeriLot</h1>
          <p>
            Access product traceability, custody, alert, and recall records for your organization.
          </p>
        </div>
      </section>

      <section className="surface auth-card" aria-label="Account access">
        {status === "expired" ? (
          <p className="notice" role="status">
            Your session ended. Sign in again to continue.
          </p>
        ) : null}
        <form noValidate onSubmit={(event) => void handleSubmit(event)}>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              aria-describedby={fieldErrors.email === undefined ? undefined : "email-error"}
              aria-invalid={fieldErrors.email !== undefined}
              autoComplete="username"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              ref={emailInput}
              type="email"
              value={email}
            />
            {fieldErrors.email === undefined ? null : (
              <p className="field-error" id="email-error">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              aria-describedby={fieldErrors.password === undefined ? undefined : "password-error"}
              aria-invalid={fieldErrors.password !== undefined}
              autoComplete="current-password"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              ref={passwordInput}
              type="password"
              value={password}
            />
            {fieldErrors.password === undefined ? null : (
              <p className="field-error" id="password-error">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <p aria-live="polite" className="form-error">
            {serverError}
          </p>
          <button className="button button-primary button-full" disabled={submitting} type="submit">
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
