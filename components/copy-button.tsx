"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CheckIcon, CopyClipboardIcon } from "@/components/matrix-icons";

export interface CopyButtonProps {
  value: string;
  className?: string;
  iconClassName?: string;
  /** How long the check state sticks, in ms. */
  resetAfter?: number;
}

export function CopyButton({
  value,
  className,
  iconClassName = "size-[18px]",
  resetAfter = 2000
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => {
        setCopied(false);
        resetRef.current = null;
      }, resetAfter);
    } catch {
      // Clipboard is unavailable in insecure contexts — nothing useful to do.
    }
  }, [value, resetAfter]);

  useEffect(() => {
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      className={
        className ??
        "inline-flex items-center justify-center rounded-md p-1.5 text-fg-strong transition-opacity duration-150 ease-out hover:opacity-80"
      }
    >
      {copied ? (
        <CheckIcon className={iconClassName} />
      ) : (
        <CopyClipboardIcon className={iconClassName} />
      )}
    </button>
  );
}
