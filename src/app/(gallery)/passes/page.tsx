"use client";
// Family passes: who may knock on the gallery's door, who is at it now, and granting a new pass.
import { AppShell } from "@/components/app-shell";
import { PassesPanel } from "@/components/passes-panel";

export default function PassesPage() {
  return (
    <AppShell active="passes">
      <header className="max-w-3xl">
        <h1 className="font-display text-h1 md:text-display">Passes</h1>
        <p className="mt-4 text-lead text-mist">Your gallery is private. A pass lets someone knock, and you choose whether to let them in, and for how long.</p>
      </header>
      <PassesPanel />
    </AppShell>
  );
}
