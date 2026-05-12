import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "PDFKit - Online PDF editing suite",
    short_name: "PDFKit",
    description:
      "Edit, sign, convert, organize, and protect PDFs locally in your browser.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "browser"],
    background_color: "#f7f7f8",
    theme_color: "#dc2626",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/maskable-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Edit PDF",
        short_name: "Edit",
        description: "Add text, images, signatures, and drawings to a PDF.",
        url: "/edit",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Merge PDF",
        short_name: "Merge",
        description: "Combine several PDFs into one file.",
        url: "/merge",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
