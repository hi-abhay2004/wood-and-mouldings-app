// Single source of truth for the web app URL (docs/app-plan.md §14) — never
// hardcode it elsewhere. EXPO_PUBLIC_* vars are inlined into the JS bundle at
// build time, so this is public info, not a secret.
export const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_APP_URL ?? "https://wood-and-mouldings.vercel.app";

export function webAppPath(path: string): string {
  const base = WEB_APP_URL.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
