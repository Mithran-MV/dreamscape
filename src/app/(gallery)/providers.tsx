"use client";
// Our own Privy app: email or Google sign-in, with an embedded wallet made for anyone who has none.
// The /0g page sits outside this group because it uses 0G's Privy app instead.
import { PrivyProvider } from "@privy-io/react-auth";
import { sepolia } from "viem/chains";

export function GallerySignIn({ appId, children }: { appId: string; children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: "dark", accentColor: "#f0c878", landingHeader: "Open your gallery" },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: sepolia,
        supportedChains: [sepolia],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
