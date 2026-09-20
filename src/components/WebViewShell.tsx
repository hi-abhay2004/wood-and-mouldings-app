import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";
import type { WebViewErrorEvent, WebViewHttpErrorEvent, WebViewMessageEvent } from "react-native-webview/lib/WebViewTypes";
import { useFocusEffect } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import CookieManager from "@preeternal/react-native-cookie-manager";

import { WEB_APP_URL, webAppPath } from "@/lib/web-app-url";
import { registerForPushNotificationsAsync } from "@/lib/push-notifications";
import { isAppRootRoute } from "@/lib/root-routes";

/**
 * The web app has no way to trigger a real device download from inside a
 * bare WebView (blob: URLs and <a download> only work in a real browser) —
 * so gala-kitchen-project's triggerDownload() (vendor-bill-export.ts)
 * detects window.ReactNativeWebView and posts the file here instead, base64
 * encoded, for the export flows (PDF/Excel) that need it.
 */
interface DownloadMessage {
  type: "download";
  filename: string;
  mime: string;
  base64: string;
}

function isDownloadMessage(value: unknown): value is DownloadMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "download" &&
    typeof (value as { filename?: unknown }).filename === "string" &&
    typeof (value as { base64?: unknown }).base64 === "string"
  );
}

async function handleDownloadMessage(message: DownloadMessage): Promise<void> {
  const file = new File(Paths.cache, message.filename);
  file.write(message.base64, { encoding: "base64" });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: message.mime, dialogTitle: message.filename });
  }
}

export interface WebViewShellHandle {
  /** Navigates to a path within the web app — used for notification-tap deep links. */
  navigateTo: (path: string) => void;
}

/**
 * Injected into the page context (not run natively) so the fetch carries the
 * page's own session cookie automatically via `credentials: "include"` —
 * avoids needing a native cookie-jar reader just to authenticate one POST.
 * Silently no-ops if the user isn't logged in yet (401, ignored).
 */
function buildRegisterTokenScript(
  token: string,
  platform: string,
  installationId: string,
  appVersion: string,
  deviceName: string | null,
): string {
  const payload = JSON.stringify({ token, platform, installationId, appVersion, deviceName });
  return `
    (function () {
      try {
        fetch(${JSON.stringify(webAppPath("/api/push/register"))}, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: ${JSON.stringify(payload)},
        }).catch(function () {});
      } catch (e) {}
    })();
    true;
  `;
}

export interface WebViewShellProps {
  /** Path to open on first load — e.g. a notification-tap deep link. Defaults to the app root. */
  initialPath?: string;
}

const WebViewShell = forwardRef<WebViewShellHandle, WebViewShellProps>(({ initialPath }, ref) => {
  const webViewRef = useRef<WebView>(null);
  const [initialUrl] = useState(() => (initialPath ? webAppPath(initialPath) : WEB_APP_URL));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const pushTokenRef = useRef<{
    token: string;
    platform: string;
    installationId: string;
    appVersion: string;
    deviceName: string | null;
  } | null>(null);
  // Tracks the current page's path for the hardware-Back decision below —
  // a ref (not state) since it only needs to be read at press-time, not
  // trigger a re-render on every navigation.
  const currentPathRef = useRef<string>("/");

  useImperativeHandle(ref, () => ({
    navigateTo(path: string) {
      const url = webAppPath(path);
      webViewRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(url)}; true;`);
    },
  }));

  // Android hardware back button. A true app root (dashboard home, a
  // top-level tab, /login) exits/minimizes the app via Android's own default
  // behavior instead of consulting WebView history — this only changes what
  // we DO on a root route, it never touches canGoBack or the WebView's
  // actual history state, so a genuine child/detail screen still uses real
  // WebView back exactly as before.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (isAppRootRoute(currentPathRef.current)) {
          return false;
        }
        if (canGoBack) {
          webViewRef.current?.goBack();
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [canGoBack]),
  );

  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    const wasOnLogin = currentPathRef.current.includes("/login");
    try {
      currentPathRef.current = new URL(navState.url).pathname;
    } catch {
      // Unparseable URL — leave currentPathRef at its last known value.
    }

    // Android's WebView cookie jar writes to disk lazily, so a session
    // cookie set by /api/auth/login can be lost if the app is force-quit
    // shortly after login, before the OS gets around to persisting it —
    // forcing a re-login on every restart. Flushing right after leaving
    // /login (i.e. login just succeeded) makes the write immediate. iOS's
    // WKWebView cookie store already persists reliably on its own.
    if (Platform.OS === "android" && wasOnLogin && !currentPathRef.current.includes("/login")) {
      CookieManager.flush().catch(() => {});
    }

    // Push-token registration used to re-fire on every single navigation,
    // which is unnecessary — the token doesn't change per-screen. It now
    // only fires on the specific /login → authenticated transition (using
    // wasOnLogin computed above), which is the "auth becomes available"
    // trigger; app-startup registration is handled separately in
    // handleLoadEnd. A best-effort unregister still happens when the user
    // lands back on /login — there's no explicit logout webhook, so this is
    // a heuristic, not a guarantee; ownership-scoped unregister on the
    // backend makes a spurious call harmless.
    if (pushTokenRef.current) {
      const nowOnLogin = currentPathRef.current.includes("/login");
      if (nowOnLogin) {
        const token = pushTokenRef.current.token;
        webViewRef.current?.injectJavaScript(`
          (function () {
            try {
              fetch(${JSON.stringify(webAppPath("/api/push/unregister"))}, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: ${JSON.stringify(JSON.stringify({ token }))},
              }).catch(function () {});
            } catch (e) {}
          })();
          true;
        `);
      } else if (wasOnLogin) {
        const { token, platform, installationId, appVersion, deviceName } = pushTokenRef.current;
        webViewRef.current?.injectJavaScript(
          buildRegisterTokenScript(token, platform, installationId, appVersion, deviceName),
        );
      }
    }
  }, []);

  const handleLoadEnd = useCallback(async () => {
    setLoading(false);
    if (!pushTokenRef.current) {
      const result = await registerForPushNotificationsAsync();
      if (result) {
        pushTokenRef.current = result;
        webViewRef.current?.injectJavaScript(
          buildRegisterTokenScript(
            result.token,
            result.platform,
            result.installationId,
            result.appVersion,
            result.deviceName,
          ),
        );
      }
    }
  }, []);

  const handleError = useCallback((event: WebViewErrorEvent) => {
    setLoading(false);
    setError(event.nativeEvent.description || "The page couldn't be loaded.");
  }, []);

  const handleHttpError = useCallback((event: WebViewHttpErrorEvent) => {
    // Only treat this as a fatal load error for the top-level document —
    // a failed sub-resource (an image, an API call the page itself retries)
    // shouldn't blank out the whole screen.
    if (event.nativeEvent.url === initialUrl || event.nativeEvent.url === WEB_APP_URL) {
      setLoading(false);
      setError(`Server returned an error (${event.nativeEvent.statusCode}).`);
    }
  }, [initialUrl]);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (isDownloadMessage(parsed)) {
      handleDownloadMessage(parsed).catch((err) => {
        console.error("Failed to hand off a downloaded file:", err);
      });
    }
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Can&apos;t reach Wood &amp; Mouldings</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <Text style={styles.errorHint}>Check your internet connection and try again.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          key={reloadKey}
          ref={webViewRef}
          source={{ uri: initialUrl }}
          style={styles.webview}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
          onHttpError={handleHttpError}
          onMessage={handleMessage}
          // Session cookie (httpOnly) must survive app restarts and be sent
          // on every request — this is what makes "stay logged in" work.
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          allowsBackForwardNavigationGestures={Platform.OS === "ios"}
          pullToRefreshEnabled={Platform.OS === "android"}
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(request) => {
            // Keep navigation to the web app inside the WebView; send
            // anything else (a mailto:, an external doc link, a different
            // domain) out to the system browser/handler instead of trying
            // to render it inline. Compare real origins, not a string
            // prefix — startsWith(WEB_APP_URL) would also match a lookalike
            // host like "wood-and-mouldings.vercel.app.evil.com".
            if (request.url === "about:blank") {
              return true;
            }
            try {
              if (new URL(request.url).origin === new URL(WEB_APP_URL).origin) {
                return true;
              }
            } catch {
              // Unparseable URL — fall through to external handling below.
            }
            Linking.openURL(request.url).catch(() => {});
            return false;
          }}
        />
      )}
      {loading && !error && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#208AEF" />
        </View>
      )}
    </SafeAreaView>
  );
});

WebViewShell.displayName = "WebViewShell";

export default WebViewShell;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 14,
    color: "#60646C",
    textAlign: "center",
  },
  errorHint: {
    fontSize: 13,
    color: "#9AA0A8",
    textAlign: "center",
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: "#208AEF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  retryButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 15,
  },
});
