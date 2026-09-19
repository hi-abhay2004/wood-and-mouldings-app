import { File, Paths } from "expo-file-system";

/**
 * Whether the one-time permission-primer screen has already been shown.
 * A marker file rather than a new storage dependency — expo-file-system is
 * already required for the download bridge (WebViewShell), so this reuses
 * it instead of adding AsyncStorage just for one boolean.
 */
const markerFile = new File(Paths.document, "permission-primer-seen");

export async function hasSeenPermissionPrimer(): Promise<boolean> {
  try {
    return markerFile.exists;
  } catch {
    // If the check itself fails, default to showing the primer — the cost
    // of showing it an extra time is far lower than never showing it.
    return false;
  }
}

export async function markPermissionPrimerSeen(): Promise<void> {
  try {
    markerFile.write("1");
  } catch {
    // Best-effort — worst case the primer shows again next launch.
  }
}
