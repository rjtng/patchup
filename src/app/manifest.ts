import type { MetadataRoute } from "next";

// Makes PatchUp installable ("Add to Home Screen") as a PWA.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PatchUp — Book trusted repair services",
    short_name: "PatchUp",
    description: "Find and book trusted repair services near you.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f6ff",
    theme_color: "#004aad",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
