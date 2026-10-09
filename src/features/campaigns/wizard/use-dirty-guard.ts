"use client";

import { useEffect } from "react";

const MESSAGE = "You have unsaved changes. Leave this page?";

/**
 * Asks for confirmation before the user loses unsaved changes. Next's App Router has no API to block
 * navigation, so three browser-level cases are covered separately:
 * 1. closing / reloading the tab — `beforeunload`;
 * 2. clicking a link to another page — a capture-phase click listener, which runs before Next's own handler;
 * 3. the browser's Back button — the wizard's first history entry is "guarded" by pushing a marked entry
 *    on top of it; going back from the marked entries lands on the unmarked one, and that is the exit.
 * Moving between wizard steps never asks anything.
 */
export function useDirtyGuard(hasUnsavedChanges: () => boolean) {
  useEffect(() => {
    let confirmedLeaving = false; // the user already said "leave" in our own dialog: don't ask twice

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (confirmedLeaving || !hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = ""; // required by some browsers to show the native dialog
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return; // other origins are covered by beforeunload
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!hasUnsavedChanges()) return;
      if (!window.confirm(MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function onPopState(event: PopStateEvent) {
      if (event.state?.wizard) return; // a step of the wizard
      // We are on the unmarked entry below the wizard's steps: the user pressed Back to leave.
      if (hasUnsavedChanges() && !window.confirm(MESSAGE)) {
        window.history.go(1); // back onto the marked entry
        return;
      }
      confirmedLeaving = true;
      window.history.back(); // actually leave (this entry is the same page, so it would be a dead step)
    }

    // Put a marked entry on top of the one the user arrived on. This waits one tick: Next patches
    // `history.pushState` in a parent effect that runs after this one, and an entry pushed before
    // the patch lacks Next's internal state, so going back to it would reload the page.
    // (Strict Mode runs effects twice: the check makes sure the entry is pushed once.)
    const pushGuardEntry = setTimeout(() => {
      if (!window.history.state?.wizard) window.history.pushState({ wizard: true }, "", window.location.href);
    });

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      clearTimeout(pushGuardEntry);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [hasUnsavedChanges]);
}
