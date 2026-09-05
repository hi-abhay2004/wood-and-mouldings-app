import { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";

import WebViewShell, { type WebViewShellHandle } from "@/components/WebViewShell";
import { addNotificationTapListener, getInitialNotificationLink } from "@/lib/push-notifications";

export default function Index() {
  const shellRef = useRef<WebViewShellHandle>(null);
  const [ready, setReady] = useState(false);
  const [initialPath, setInitialPath] = useState<string | undefined>(undefined);

  // Cold start via a notification tap: resolve the deep link before the
  // WebView ever renders, so it opens straight there instead of the app root.
  useEffect(() => {
    getInitialNotificationLink().then((link) => {
      setInitialPath(link);
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

  return (
    <>
      <StatusBar style="auto" />
      <WebViewShell ref={shellRef} initialPath={initialPath} />
    </>
  );
}
