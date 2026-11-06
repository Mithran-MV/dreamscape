import type { CapacitorConfig } from "@capacitor/cli";

// The phone app is a native shell around the live site, so the gallery, sign-in and recording run the
// same code as on the web. DREAMSCAPE_URL=http://localhost:3000 points it at a laptop instead: 0G's
// sign-in accepts only localhost and 0G's own sites, and an Android phone or emulator reaches the
// laptop's localhost through `adb reverse tcp:3000 tcp:3000`.
const url = process.env.DREAMSCAPE_URL ?? "https://dreamscape.hacklabs.in";

const config: CapacitorConfig = {
  appId: "in.hacklabs.dreamscape",
  appName: "Dreamscape",
  webDir: "www",
  backgroundColor: "#0f0c1c",
  server: { url, cleartext: url.startsWith("http://"), errorPath: "offline.html" },
  plugins: {
    LocalNotifications: { smallIcon: "ic_stat_moon", iconColor: "#f0c870" },
  },
};

export default config;
