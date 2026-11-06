"use client";
// The World Dream: the newest painting of what everyone dreamed, its themes and feeling, and the dreamer's circle.
import { AppShell } from "@/components/app-shell";
import { WorldView } from "@/components/world-card";

export default function WorldPage() {
  return (
    <AppShell active="world">
      <header className="max-w-3xl">
        <h1 className="font-display text-h1 md:text-display">The World Dream</h1>
        <p className="mt-4 text-lead text-mist">One painting a day from everyone&rsquo;s themes and feelings, never their words.</p>
      </header>
      <WorldView />
    </AppShell>
  );
}
