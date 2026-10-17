import type { Metadata, Viewport } from "next";
import "@fontsource-variable/montserrat";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PatchUp — Book trusted repair services",
    template: "%s · PatchUp",
  },
  description:
    "Find and book trusted plumbers, electricians, technicians and repair shops near you.",
  applicationName: "PatchUp",
  appleWebApp: {
    capable: true,
    title: "PatchUp",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#004aad",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        {/* Mobile-first: the app is a phone-width column, centered on larger screens. */}
        <div className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-surface shadow-[0_0_40px_rgba(0,74,173,0.08)]">
          {children}
        </div>
      </body>
    </html>
  );
}
