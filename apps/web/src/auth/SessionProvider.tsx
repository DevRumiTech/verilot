import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type AuthSessionResponse,
  type Permission,
} from "@verilot/contracts";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Navigate, useLocation } from "react-router";

import { apiClient, ApiClientError, type ApiClient } from "../lib/api-client.js";
import { AuthApi, authApi, type SignInCredentials } from "./auth-api.js";

export type SessionStatus = "anonymous" | "authenticated" | "expired" | "loading";

interface SessionContextValue {
  client: ApiClient;
  error: ApiClientError | null;
  hasPermission(permission: Permission): boolean;
  session: AuthSessionResponse | null;
  signIn(credentials: SignInCredentials): Promise<void>;
  signOut(): Promise<void>;
  status: SessionStatus;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
  client = apiClient,
  service = authApi,
}: {
  children: ReactNode;
  client?: ApiClient;
  service?: AuthApi;
}) {
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<ApiClientError | null>(null);

  const expireSession = useCallback(() => {
    client.clearCsrfToken();
    setSession(null);
    setStatus("expired");
  }, [client]);

  useEffect(() => {
    client.setUnauthorizedHandler(expireSession);
    const controller = new AbortController();

    void service
      .loadSession(controller.signal)
      .then((loadedSession) => {
        client.setCsrfToken(loadedSession.csrfToken);
        setSession(loadedSession);
        setStatus("authenticated");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }

        client.clearCsrfToken();
        setSession(null);

        if (reason instanceof ApiClientError && reason.status === 401) {
          setStatus("anonymous");
          return;
        }

        setError(
          reason instanceof ApiClientError
            ? reason
            : new ApiClientError({
                code: "SESSION_UNAVAILABLE",
                message: "The session could not be loaded.",
                status: 503,
              }),
        );
        setStatus("anonymous");
      });

    return () => {
      controller.abort();
      client.setUnauthorizedHandler(null);
    };
  }, [client, expireSession, service]);

  const signIn = useCallback(
    async (credentials: SignInCredentials) => {
      setError(null);
      const signedInSession = await service.signIn(credentials);
      client.setCsrfToken(signedInSession.csrfToken);
      setSession(signedInSession);
      setStatus("authenticated");
    },
    [client, service],
  );

  const signOut = useCallback(async () => {
    setError(null);
    await service.signOut();
    client.clearCsrfToken();
    setSession(null);
    setStatus("anonymous");
  }, [client, service]);

  const value = useMemo<SessionContextValue>(
    () => ({
      client,
      error,
      hasPermission(permission) {
        return session === null ? false : ROLE_PERMISSIONS[session.user.role].includes(permission);
      },
      session,
      signIn,
      signOut,
      status,
    }),
    [client, error, session, signIn, signOut, status],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);

  if (value === null) {
    throw new Error("useSession must be used within SessionProvider.");
  }

  return value;
}

export function AccessDenied() {
  return (
    <section className="surface empty-state" aria-labelledby="access-denied-title">
      <p className="eyebrow">Access denied</p>
      <h1 id="access-denied-title">Permission required</h1>
      <p>Your account cannot open this page.</p>
    </section>
  );
}

export function AuthGuard({
  children,
  permission = PERMISSIONS.dashboardRead,
}: {
  children: ReactNode;
  permission?: Permission;
}) {
  const location = useLocation();
  const { hasPermission, status } = useSession();

  if (status === "loading") {
    return (
      <main className="site-main" id="main-content">
        <p role="status">Loading your secure session…</p>
      </main>
    );
  }

  if (status === "anonymous" || status === "expired") {
    return (
      <Navigate
        replace
        state={{ requestedPath: `${location.pathname}${location.search}` }}
        to="/sign-in"
      />
    );
  }

  if (!hasPermission(permission)) {
    return <AccessDenied />;
  }

  return children;
}
