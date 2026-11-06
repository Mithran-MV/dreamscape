import { GallerySignIn } from "./providers";

export default function GalleryLayout({ children }: LayoutProps<"/">) {
  const zeroGAppId = process.env.NEXT_PUBLIC_ZG_PRIVY_APP_ID;
  const walletAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || undefined;
  return zeroGAppId ? (
    <GallerySignIn zeroGAppId={zeroGAppId} walletAppId={walletAppId}>
      {children}
    </GallerySignIn>
  ) : (
    <>{children}</>
  );
}
