"use client";
// 0G's own sign-in, through 0G's Privy app. 0G allows it only on localhost:3000, 3001 and 5173.
import { PrivyProvider } from "@privy-io/react-auth";

export function ZeroGSignIn({ appId, children }: { appId: string; children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: { theme: "dark", accentColor: "#f0c878" },
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
