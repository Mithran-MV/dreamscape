import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dreamscape",
    short_name: "Dreamscape",
    description: "Your brain deletes your dreams. Dreamscape keeps them.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0c1c",
    theme_color: "#0f0c1c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Tell last night's dream", url: "/tell", icons: [{ src: "/icon-192.png", sizes: "192x192" }] }],
  };
}
