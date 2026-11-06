// The phone app (mobile/) shows this same site inside a native shell. Web Push doesn't reach it there,
// so the morning reminder is a notification the phone schedules for itself, at the dreamer's usual time.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const MORNING = 1;

export const inApp = () => Capacitor.isNativePlatform();

export async function reminderOn() {
  const { notifications } = await LocalNotifications.getPending();
  return notifications.some((n) => n.id === MORNING);
}

// minute: the local minute of the day, as /api/mornings reports it in `wake`. False when the phone said no.
export async function remindEachMorning(minute: number) {
  let { display } = await LocalNotifications.checkPermissions();
  if (display === "prompt" || display === "prompt-with-rationale") ({ display } = await LocalNotifications.requestPermissions());
  if (display !== "granted") return false;
  if (Capacitor.getPlatform() === "android") await LocalNotifications.createChannel({ id: "mornings", name: "Morning reminder", importance: 4 });
  await LocalNotifications.cancel({ notifications: [{ id: MORNING }] });
  await LocalNotifications.schedule({
    notifications: [
      {
        id: MORNING,
        channelId: "mornings",
        title: "Before it fades",
        body: "What did you dream? One tap lights today's star.",
        schedule: { on: { hour: Math.floor(minute / 60), minute: minute % 60 }, allowWhileIdle: true },
        extra: { url: "/tell" },
      },
    ],
  });
  return true;
}

export const stopReminder = () => LocalNotifications.cancel({ notifications: [{ id: MORNING }] });

// Opens the page a tapped reminder points at. Returns the unsubscribe.
export function onReminderTap(open: (url: string) => void) {
  const listener = LocalNotifications.addListener("localNotificationActionPerformed", ({ notification }) => {
    const url = notification.extra?.url;
    if (typeof url === "string" && url.startsWith("/")) open(url);
  });
  return () => void listener.then((l) => l.remove());
}
