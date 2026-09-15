/**
 * True app-root routes — the top of each role's navigation, where Android
 * hardware Back should exit/minimize the app rather than consult the
 * WebView's history (which may still have real entries behind it, e.g. from
 * a deep link). Centralized here so the mobile shell doesn't hardcode role
 * paths inline — extend this list, not the back-handling logic itself, when
 * a new role/dashboard root is added on the web side.
 */
const APP_ROOT_ROUTES = [
  "/login",
  "/m",
  "/m/pending",
  "/m/completed",
  "/sales",
  "/manager",
  "/vendor",
  "/admin",
];

export function isAppRootRoute(pathname: string): boolean {
  return APP_ROOT_ROUTES.includes(pathname);
}
