import * as SecureStore from "expo-secure-store";

const STORE_KEY = "wm-installation-id";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `install-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let cached: string | null = null;

/**
 * Stable per-installation id — SecureStore is backed by Android Keystore /
 * iOS Keychain, which (unlike app-internal file storage) is scoped to the
 * app's own signing identity and is wiped on uninstall, not on a plain app
 * update. Exactly the "survives updates, not reinstalls" semantics the
 * push-token lifecycle needs.
 */
export async function getInstallationId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing = await SecureStore.getItemAsync(STORE_KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
  } catch {
    // Fall through to generate fresh — worst case a rare SecureStore read
    // failure costs one extra "installation" server-side, not a crash.
  }
  const id = generateId();
  try {
    await SecureStore.setItemAsync(STORE_KEY, id);
  } catch {
    // Best-effort — if the write fails, this session still registers with
    // a valid id, it just won't survive a restart.
  }
  cached = id;
  return id;
}
