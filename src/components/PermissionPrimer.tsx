import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface PrimerItem {
  icon: string;
  title: string;
  body: string;
}

const ITEMS: PrimerItem[] = [
  {
    icon: "📷",
    title: "Camera",
    body: "To photograph site, measurement and installation work.",
  },
  {
    icon: "🔔",
    title: "Notifications",
    body: "To alert you about new jobs and updates as they happen.",
  },
];

/**
 * Shown once, before the WebView ever loads (see src/app/index.tsx and
 * src/lib/onboarding.ts). Purely informational — the actual OS permission
 * prompts still fire later, in context, exactly when the web app first
 * needs the camera or first registers for push. This just means the user
 * has already been told why, once, before anything asks.
 */
export function PermissionPrimer({ onContinue }: { onContinue: () => void }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image source={require("../../logo.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Before you get started</Text>
        <Text style={styles.subtitle}>Wood & Mouldings uses a couple of permissions to work properly:</Text>

        <View style={styles.list}>
          {ITEMS.map((item) => (
            <View key={item.title} style={styles.row}>
              <Text style={styles.rowIcon}>{item.icon}</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowBody}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.footnote}>You&apos;ll be asked to allow each one the first time it&apos;s actually needed.</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={onContinue}>
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    gap: 8,
  },
  logo: {
    width: 160,
    height: 64,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    color: "#1A1D21",
  },
  subtitle: {
    fontSize: 14,
    color: "#60646C",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  list: {
    gap: 16,
    marginTop: 16,
  },
  row: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
    backgroundColor: "#F5F8FC",
    borderRadius: 14,
    padding: 14,
  },
  rowIcon: {
    fontSize: 24,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1D21",
  },
  rowBody: {
    fontSize: 13,
    color: "#60646C",
    marginTop: 2,
  },
  footnote: {
    fontSize: 12,
    color: "#9AA0A8",
    textAlign: "center",
    marginTop: 20,
  },
  button: {
    backgroundColor: "#208AEF",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 16,
  },
});
