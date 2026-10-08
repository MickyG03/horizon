"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/* False on the server and during hydration, true afterwards. For views whose first paint
   depends on client-only data (query cache, URL params under Suspense). */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
