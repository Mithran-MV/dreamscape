import { GallerySignIn } from "./providers";

export default function GalleryLayout({ children }: LayoutProps<"/">) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  return appId ? <GallerySignIn appId={appId}>{children}</GallerySignIn> : <>{children}</>;
}
