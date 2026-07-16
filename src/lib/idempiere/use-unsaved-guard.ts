"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

/**
 * Warn user when navigating away with unsaved form changes.
 * Handles both browser navigation (beforeunload) and Next.js route changes.
 */
export function useUnsavedGuard(isDirty: boolean) {
  const _router = useRouter();

  React.useEffect(() => {
    if (!isDirty) return;

    // ponytail: browser-level guard for refresh/close
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
}
