import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Class Status NCR",
    short_name: "Class Status",
    description: "Metro Manila live class suspension tracker",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#3b82f6",
    icons: [
      {
        src: "/icons/class-status-icon-192.png?v=3",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/class-status-icon-512.png?v=3",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
