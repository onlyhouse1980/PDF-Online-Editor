import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { buildGoogleFontsHref } from "@/lib/font-presets";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { PwaRegistrar } from "@/components/pwa-registrar";
import { WorkspaceProvider } from "@/components/workspace-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PDFKit — Online PDF editing suite",
  description:
    "All the PDF tools you need — merge, split, edit, sign, convert, compress, protect — in your browser.",
  applicationName: "PDFKit",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PDFKit",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#dc2626",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {buildGoogleFontsHref() && (
          // eslint-disable-next-line @next/next/no-page-custom-font
          <link rel="stylesheet" href={buildGoogleFontsHref()} />
        )}
      </head>
      <body className="min-h-full flex flex-col">
        <PwaRegistrar />
        <WorkspaceProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </WorkspaceProvider>
      </body>
    </html>
  );
}
