"use client";
// A value only the browser can know, such as today's date in the viewer's own time zone.
// The server and the first client render both use `fallback`, so hydration always matches.
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function useClientValue<T extends string | number | boolean>(read: () => T, fallback: T): T {
  return useSyncExternalStore(subscribe, read, () => fallback);
}
