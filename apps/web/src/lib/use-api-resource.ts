import { useCallback, useEffect, useState } from "react";

import { useSession } from "../auth/SessionProvider.js";
import { ApiClientError } from "./api-client.js";

type ResourceState<T> =
  | { status: "loading" }
  | { error: ApiClientError; status: "error" }
  | { data: T; status: "success" };

export function useApiResource<T>(path: string): ResourceState<T> & { retry(): void } {
  const { client } = useSession();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    void client
      .request<T>(path, { signal: controller.signal })
      .then((data) => setState({ data, status: "success" }))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }

        setState({
          error:
            reason instanceof ApiClientError
              ? reason
              : new ApiClientError({
                  code: "REQUEST_FAILED",
                  message: "The requested information could not be loaded.",
                  status: 503,
                }),
          status: "error",
        });
      });

    return () => controller.abort();
  }, [attempt, client, path]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  return { ...state, retry };
}
