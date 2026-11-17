import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BUILDEX",
    short_name: "BUILDEX",
    description: "Build Beyond Limits.",
    start_url: "/",
    display: "standalone",
    background_color: "#121212",
    theme_color: "#ff4d1c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
