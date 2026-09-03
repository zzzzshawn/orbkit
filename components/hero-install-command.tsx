"use client";

import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { CopyButton } from "@/components/copy-button";

/** How long "Copied!" holds before the command comes back, in ms. */
const COPIED_HOLD = 1600;

/** Per-letter gap for a short line. "Copied!" runs at exactly this. */
const LETTER_STEP = 0.012;

/*
  Ceiling on how long the whole sweep may take. A fixed per-letter gap reads
  fine over seven characters and turns into a crawl over thirty-five, so the
  step shrinks once a line is long enough to exceed this — short lines keep
  LETTER_STEP untouched, long ones sweep faster to land in the same window.
*/
const MAX_SWEEP = 0.25;

export const HeroInstallCommand = memo(function HeroInstallCommand({
  installCommand
}: {
  installCommand: string;
}) {
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopied = useCallback(() => {
    setCopied(true);
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => {
      setCopied(false);
      resetRef.current = null;
    }, COPIED_HOLD);
  }, []);

  useEffect(() => {
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  /*
    Out and in are deliberately asymmetric. The outgoing line dissolves where
    it stands — no travel — so the eye stays on the pill instead of following
    something off the top. The incoming one is dealt out a letter at a time.

    The stagger lives on the line and the visuals on the letters: a container
    variant with `staggerChildren` orders them, and only the exit needs to act
    on the line as a whole, which is why `out` is the one variant carrying
    opacity here.
  */
  const text = copied ? "Copied!" : installCommand;
  const step = reduceMotion ? 0 : Math.min(LETTER_STEP, MAX_SWEEP / text.length);

  const line: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: step } },
    out: {
      opacity: 0,
      ...(reduceMotion ? {} : { filter: "blur(4px)" }),
      transition: { type: "spring", stiffness: 180, damping: 19 }
    }
  };

  const letter: Variants = {
    hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(3px)" },
    show: {
      opacity: 1,
      ...(reduceMotion ? {} : { filter: "blur(0px)" }),
      transition: { type: "spring", stiffness: 180, damping: 19 }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="w-max rounded-lg ">
        {/*
          `mode="wait"` so the old line clears before the new one arrives —
          overlapping them mid-flight reads as a smear rather than a swap.

          Both lines share one grid cell, so the box holds its size while one
          is leaving and the other has not landed; `overflow-hidden` keeps the
          travel from spilling past the pill's rounded edge.
        */}
        <div className="grid min-w-0 max-w-full items-center overflow-hidden rounded-xl bg-preset px-5 py-2">
          {/*
            An invisible copy of the command holds the cell open, so the pill
            keeps the wider of the two widths instead of collapsing around
            "Copied!". `mode="wait"` means only one real line is mounted at a
            time, so without this the box would have nothing to size to.
            Typography classes must match the animated line exactly.
          */}
          <span
            aria-hidden
            className="invisible col-start-1 row-start-1 whitespace-nowrap text-[11px] leading-normal font-semibold tracking-tight sm:text-base"
          >
            {installCommand}
          </span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={copied ? "copied" : "command"}
              variants={line}
              initial="hidden"
              animate="show"
              exit="out"
              aria-label={text}
              className="col-start-1 row-start-1 min-w-0 whitespace-nowrap text-[11px] leading-normal font-semibold tracking-tight text-fg sm:text-base text-center min-w-[290px]"
            >
              {/*
                Split for the stagger. `whitespace-pre` keeps the spaces from
                collapsing once each character is its own inline-block, and the
                whole line carries an aria-label so a screen reader hears the
                command rather than thirty-five separate letters.
              */}
              {[...text].map((char, i) => (
                <motion.span
                  key={`${i}-${char}`}
                  variants={letter}
                  aria-hidden
                  className="inline-block whitespace-pre"
                >
                  {char}
                </motion.span>
              ))}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
      <div className="w-max rounded-lg ">
        <div className="flex min-w-0 max-w-full items-center gap-1 rounded-xl bg-preset p-2 sm:p-[10px]">
          <CopyButton
            value={installCommand}
            onCopied={handleCopied}
            className="inline-flex items-center justify-center text-fg-strong transition-opacity duration-150 ease-out hover:opacity-80"
            iconClassName="size-[18px] sm:size-5"
          />
        </div>
      </div>
    </div>
  );
});
