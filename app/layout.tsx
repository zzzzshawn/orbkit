import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Public_Sans } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import {
  GeistPixelCircle,
  GeistPixelGrid,
  GeistPixelLine,
  GeistPixelSquare,
  GeistPixelTriangle
} from "geist/font/pixel";

import { DialKitRouteRoot } from "@/components/dialkit-route-root";
import { HomeLink } from "@/components/home-link";
import { RouteAwareSiteFooter } from "@/components/route-aware-site-footer";
import { OrbMark } from "@/components/orb-mark";
import { SiteNav } from "@/components/site-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  CREATOR_NAME,
  CREATOR_URL,
  SITE_DESCRIPTION,
  SITE_HOMEPAGE,
  SITE_NAME
} from "@/lib/site-config";
import "dialkit/styles.css";
import "./globals.css";

const siteUrl = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? SITE_HOMEPAGE);
  } catch {
    return undefined;
  }
})();

const publicSans = Public_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-public-sans"
});

const fontVariables = [
  publicSans.variable,
  GeistSans.variable,
  GeistMono.variable,
  GeistPixelSquare.variable,
  GeistPixelGrid.variable,
  GeistPixelCircle.variable,
  GeistPixelTriangle.variable,
  GeistPixelLine.variable
].join(" ");

/** Runs before paint so the first frame is already in the stored theme. */
const themeInitScript = `(() => {
  try {
    const stored = localStorage.getItem("orba-theme");
    const theme = stored === "light" || stored === "dark" ? stored : "dark";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
  }
})();`;

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: siteUrl } : {}),
  applicationName: SITE_NAME,
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "Orba",
    "shader orb",
    "WebGL",
    "GLSL",
    "React",
    "component library",
    "voice agent",
    "AI orb",
    "shadcn",
    "shadcn/ui",
    "registry",
    "Tailwind CSS",
    "open source"
  ],
  authors: [{ name: CREATOR_NAME, url: CREATOR_URL }],
  creator: CREATOR_NAME,
  publisher: CREATOR_NAME,
  category: "technology",
  formatDetection: { email: false, address: false, telephone: false },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  },
  alternates: siteUrl ? { canonical: "/" } : undefined,
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    ...(siteUrl ? { url: new URL("/", siteUrl).href } : {})
  },
  twitter: {
    card: "summary_large_image",
    site: "@zzzzshawn",
    creator: "@zzzzshawn",
    title: SITE_NAME,
    description: SITE_DESCRIPTION
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme="dark"
      className={fontVariables}
      style={{ colorScheme: "dark" }}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className="flex min-h-dvh flex-col font-sans font-medium antialiased"
      >
        <Link
          href="/"
          aria-label="Home"
          className="fixed left-4 top-4 z-20 inline-flex items-center justify-center gap-2 rounded-[10px] transition-transform duration-200 ease will-change-transform before:absolute before:left-1/2 before:top-1/2 before:z-0 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) motion-reduce:transition-none motion-reduce:will-change-auto [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1 [@media(hover:hover)_and_(pointer:fine)]:hover:rotate-4 [@media(hover:hover)_and_(pointer:fine)]:hover:scale-[1.03] motion-reduce:[@media(hover:hover)_and_(pointer:fine)]:hover:translate-y-0 motion-reduce:[@media(hover:hover)_and_(pointer:fine)]:hover:rotate-0 motion-reduce:[@media(hover:hover)_and_(pointer:fine)]:hover:scale-100"
        >
          <OrbMark size={34} className="pointer-events-none relative z-10 select-none" />
        </Link>

        <div className="fixed right-4 top-4 z-20 flex items-center gap-2">
          <SiteNav />
          <HomeLink />
          <ThemeToggle />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>

        <DialKitRouteRoot />
        <RouteAwareSiteFooter />
      </body>
    </html>
  );
}
