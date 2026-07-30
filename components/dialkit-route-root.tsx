"use client";

import { DialRoot } from "dialkit";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useDocumentTheme } from "@/lib/use-document-theme";

/**
 * DialKit renders one global panel root. Mount it only on /playground, and flag
 * the route on <body> so the CSS in globals.css can move the header controls
 * out from under the collapsed dial.
 */
export function DialKitRouteRoot() {
  const pathname = usePathname();
  const isPlayground = pathname === "/playground";
  const dialTheme = useDocumentTheme();

  useEffect(() => {
    if (!isPlayground) {
      delete document.body.dataset.playgroundRoute;
      return;
    }

    document.body.dataset.playgroundRoute = "true";
    return () => {
      delete document.body.dataset.playgroundRoute;
    };
  }, [isPlayground]);

  if (!isPlayground) {
    return null;
  }

  return <DialRoot position="top-right" defaultOpen theme={dialTheme} productionEnabled />;
}
