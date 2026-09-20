import * as Device from "expo-device";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import type * as NotificationsType from "expo-notifications";
import { getInstallationId } from "@/lib/installation-id";

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * expo-notifications' own module-init code throws just from being imported
 * in Expo Go on Android (SDK 53+ removed remote push there) — this happens
 * at the top of the file, before any function body or runtime check ever
 * runs. A static `import * as Notifications from "expo-notifications"`
 * gets evaluated unconditionally regardless of any if-guard around its
 * *usage*, so the only fix is to not import it at all in that environment —
 * a conditional `require`, not a static import. `import type` above is
 * compile-time only (fully erased, zero runtime footprint) so it's safe to
 * keep for typing even though the real module is loaded conditionally.
 */
const Notifications: typeof NotificationsType | null = isExpoGo()
  ? null
  : (require("expo-notifications") as typeof NotificationsType); // eslint-disable-line @typescript-eslint/no-require-imports

/**
 * Foreground behavior: still show an alert/banner while the app is open
 * (docs/app-plan.md §11 — "app open / foreground ... without creating a
 * broken UX"). The WebView itself has no idea a push arrived, so this is the
 * only visible signal while the app is in front.
 */
export function configureNotificationHandler(): void {
  if (!Notifications) {
    console.warn("Push notifications are unavailable in Expo Go — use a development build.");
    return;
  }
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch (err) {
    console.warn("Failed to configure notification handler:", err);
  }
}

export type PushPlatform = "ios" | "android";

/**
 * Requests permission and returns an Expo push token, or null if permission
 * was denied, this isn't a physical device (push tokens don't work on
 * simulators/emulators), we're running in Expo Go, or the project isn't
 * linked to EAS yet (getExpoPushTokenAsync needs an EAS projectId — see the
 * mobile README for `eas init`).
 */
export async function registerForPushNotificationsAsync(): Promise<{
  token: string;
  platform: PushPlatform;
  installationId: string;
  appVersion: string;
  deviceName: string | null;
} | null> {
  if (!Notifications) {
    console.warn("Push notifications are unavailable in Expo Go — use a development build.");
    return null;
  }

  if (!Device.isDevice) {
    console.warn("Push notifications require a physical device, not a simulator/emulator.");
    return null;
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("wm_alerts_v1", {
        name: "Wood & Mouldings Alerts",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") {
      console.warn("Notification permission was not granted.");
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn(
        "No EAS projectId configured — run `eas init` before push tokens can be generated. See README.",
      );
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const installationId = await getInstallationId();
    const appVersion = `${Constants.nativeApplicationVersion ?? "?"} (${Constants.nativeBuildVersion ?? "?"})`;
    const deviceName = Device.deviceName ?? Device.modelName ?? null;
    return { token, platform: Platform.OS as PushPlatform, installationId, appVersion, deviceName };
  } catch (err) {
    console.error("Failed to obtain Expo push token:", err);
    return null;
  }
}

export function addNotificationTapListener(
  onTap: (link: string | undefined) => void,
): { remove: () => void } {
  if (!Notifications) {
    return { remove: () => {} };
  }
  try {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const link = response.notification.request.content.data?.link as string | undefined;
      onTap(link);
    });
    return subscription;
  } catch (err) {
    console.warn("Failed to attach notification tap listener:", err);
    return { remove: () => {} };
  }
}

/** The response that woke the app up (cold start via notification tap), if any. */
export async function getInitialNotificationLink(): Promise<string | undefined> {
  if (!Notifications) return undefined;
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    return response?.notification.request.content.data?.link as string | undefined;
  } catch (err) {
    console.warn("Failed to read initial notification response:", err);
    return undefined;
  }
}
