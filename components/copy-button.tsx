"use client";

import { useCallback, useEffect, useRef, useState, type Ref } from "react";

import { CheckIcon, CopyClipboardIcon } from "@/components/matrix-icons";
import { playCue } from "@/lib/sound-cues";

export interface CopyButtonProps {
  value: string;
  className?: string;
  iconClassName?: string;
  /** How long the check state sticks, in ms. */
  resetAfter?: number;
  /** Fired after a successful write, for callers that show their own feedback. */
  onCopied?: () => void;
  /**
   * The button element. Lets a larger surface — a whole code block, say —
   * forward its clicks here rather than keeping a second copy of the copy
   * state, so one press drives the write, the check icon and the reset alike.
   */
  ref?: Ref<HTMLButtonElement>;
}

/*
  A 44px tappable square centred on the button, drawn as a transparent
  pseudo-element so it costs nothing in layout. The icon is 18px and callers
  set their own padding, so without this the real target is well under the
  44px that touch guidance asks for — and this way it grows without any of
  the call sites having to change their spacing.
*/
const HIT_AREA =
  "relative before:absolute before:left-1/2 before:top-1/2 before:size-11 " +
  "before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";

export function CopyButton({
  value,
  className,
  iconClassName = "size-[18px]",
  resetAfter = 2000,
  onCopied,
  ref
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.();
      playCue("success");
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => {
        setCopied(false);
        resetRef.current = null;
      }, resetAfter);
    } catch {
      // Clipboard is unavailable in insecure contexts; at least say so.
      playCue("error");
    }
  }, [value, resetAfter, onCopied]);

  useEffect(() => {
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      data-cue="none"
      onClick={() => void copy()}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      className={`${HIT_AREA} ${
        className ??
        "inline-flex items-center justify-center rounded-md p-1.5 text-fg-strong transition-opacity duration-150 ease-out hover:opacity-80"
      }`}
    >
      {copied ? (
        <CheckIcon className={iconClassName} />
      ) : (
        <CopyClipboardIcon className={iconClassName} />
      )}
    </button>
  );
}
