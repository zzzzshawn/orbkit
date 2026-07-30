"use client";

import { memo } from "react";

import { CopyButton } from "@/components/copy-button";

export const HeroInstallCommand = memo(function HeroInstallCommand({
  installCommand
}: {
  installCommand: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-max rounded-lg bg-surface p-1">
        <div className="flex min-w-0 max-w-full items-center gap-1 rounded-sm bg-bg px-3 py-2">
          <p className="min-w-0 text-[11px] leading-normal text-fg sm:text-base">
            {installCommand}
          </p>
        </div>
      </div>
      <div className="w-max rounded-lg bg-surface p-1">
        <div className="flex min-w-0 max-w-full items-center gap-1 rounded-sm bg-bg p-2 sm:p-[10px]">
          <CopyButton
            value={installCommand}
            className="inline-flex items-center justify-center text-fg-strong transition-opacity duration-150 ease-out hover:opacity-80"
            iconClassName="size-[18px] sm:size-5"
          />
        </div>
      </div>
    </div>
  );
});
