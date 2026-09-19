import { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";

import WebViewShell, { type WebViewShellHandle } from "@/components/WebViewShell";
import { PermissionPrimer } from "@/components/PermissionPrimer";
import { addNotificationTapListener, getInitialNotificationLink } from "@/lib/push-notifications";
import { hasSeenPermissionPrimer, markPermissionPrimerSeen } from "@/lib/onboarding";

export default function Index() {
  const shellRef = useRef<WebViewShellHandle>(null);
  const [ready, setReady] = useState(false);
  const [showPrimer, setShowPrimer] = useState(false);
  const [initialPath, setInitialPath] = useState<string | undefined>(undefined);

  // Cold start via a notification tap: resolve the deep link before the
  // WebView ever renders, so it opens straight there instead of the app root.
  // Resolved alongside the one-time permission primer check so neither
  // delays the other.
  useEffect(() => {
    Promise.all([getInitialNotificationLink(), hasSeenPermissionPrimer()]).then(([link, seen]) => {
      setInitialPath(link);
      setShowPrimer(!seen);
      setReady(true);
    });
  }, []);

  // Notification tapped while the app is already running (foreground or
  // backgrounded-but-alive) — navigate the existing WebView instead.
  useEffect(() => {
    const subscription = addNotificationTapListener((link) => {
      if (link) shellRef.current?.navigateTo(link);
    });
    return () => subscription.remove();
  }, []);

  if (!ready) return null;

  if (showPrimer) {
    return (
      <PermissionPrimer
        onContinue={() => {
          setShowPrimer(false);
          void markPermissionPrimerSeen();
        }}
      />
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <WebViewShell ref={shellRef} initialPath={initialPath} />
    </>
  );
}
