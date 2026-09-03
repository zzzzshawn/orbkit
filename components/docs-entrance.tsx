"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/*
  The docs pages' entrance, in the home page's language: elements blur in
  top-down on the same easing and step the gallery header uses, so moving
  between home and a docs page reads as one site.

  Reduced motion keeps the fade and drops the blur — gentler, not absent.
*/
const ENTER_EASE = { duration: 0.5, ease: "easeOut" } as const;

export function DocsEnter({
  delay,
  blur = true,
  className,
  children
}: {
  /** Seconds after mount. */
  delay: number;
  /**
   * Blur as well as fade. Off for anything that wraps a backdrop-filter (a
   * `filter` on an ancestor breaks it) and for long runs of elements, where
   * many simultaneous filter passes cost more than the effect is worth.
   */
  blur?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const withBlur = blur && !reduceMotion;

  return (
    <motion.div
      initial={withBlur ? { opacity: 0, filter: "blur(10px)" } : { opacity: 0 }}
      animate={withBlur ? { opacity: 1, filter: "blur(0px)" } : { opacity: 1 }}
      transition={{ ...ENTER_EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
