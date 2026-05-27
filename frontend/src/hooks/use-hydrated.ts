import { useEffect, useState } from "react";

/**
 * Returns `true` only after the component has mounted (hydrated on the client).
 *
 * In React 18 concurrent mode (enabled by `v7_startTransition: true` in
 * BrowserRouter), text nodes that change between render passes inside a
 * transition cause error #300 ("Text content did not match"). This hook
 * prevents rendering time-sensitive text until the component is fully
 * committed, avoiding the mismatch.
 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}
