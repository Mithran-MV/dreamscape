"use client";
// 0G's own sign-in (0G's Privy app), the only way in. The dreamer's 0G account is who they are, its
// wallet holds their ENS name and pays in the market, and its iAI credit pays for their dreams.
// 0G allows this sign-in only on localhost:3000, 3001 and 5173.
import { PrivyProvider } from "@privy-io/react-auth";
import { sepolia } from "viem/chains";

export function GallerySignIn({ appId, children }: { appId: string; children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: { theme: "dark", accentColor: "#f0c878", landingHeader: "Sign in with 0G" },
        // The wallet comes with the 0G account; Dreamscape never makes one in 0G's app.
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
        defaultChain: sepolia,
        supportedChains: [sepolia],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
