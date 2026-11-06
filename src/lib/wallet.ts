"use client";
// The dreamer's 0G wallet in the browser, for the few transactions only they may send,
// such as paying for an edition or revoking a pass. The server pays for everything else.
import { useWallets } from "@privy-io/react-auth";
import { useCallback } from "react";
import { createPublicClient, createWalletClient, custom, http, type Hex } from "viem";
import { sepolia } from "viem/chains";

export type Tx = { to: `0x${string}`; data: Hex; value?: string };

const reader = createPublicClient({ chain: sepolia, transport: http("https://ethereum-sepolia-rpc.publicnode.com") });

export function usePrivyWallet() {
  const { wallets, ready } = useWallets();
  // The 0G account's own wallet: embedded in 0G's sign-in, or the one the dreamer linked to it.
  const wallet = wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];

  // Sends each transaction in order and waits for it, so a later one never runs on a failed earlier one.
  const send = useCallback(
    async (txs: Tx[]) => {
      if (!wallet) throw new Error("Your wallet isn't ready yet. Sign in again.");
      await wallet.switchChain(sepolia.id);
      const client = createWalletClient({ account: wallet.address as `0x${string}`, chain: sepolia, transport: custom(await wallet.getEthereumProvider()) });
      const hashes: Hex[] = [];
      for (const tx of txs) {
        const hash = await client.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined });
        const receipt = await reader.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("That transaction didn't go through.");
        hashes.push(hash);
      }
      return hashes;
    },
    [wallet],
  );

  return { ready, address: wallet?.address ?? null, send };
}
