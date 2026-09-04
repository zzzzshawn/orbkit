"use client";

import { SoundOffIcon, SoundOnIcon } from "@/components/matrix-icons";
import { playCue, setSoundEnabled, useSoundEnabled } from "@/lib/sound-cues";

/**
 * Header switch for the interaction sounds. Opted out of the global press cue
 * so muting is silent; turning sound back on plays a sparkle as confirmation.
 */
export function SoundToggle() {
  const enabled = useSoundEnabled();

  const toggle = () => {
    const next = !enabled;
    setSoundEnabled(next);
    if (next) playCue("sparkle");
  };

  return (
    <button
      type="button"
      aria-label={enabled ? "Turn sound off" : "Turn sound on"}
      data-cue="none"
      onClick={toggle}
      className="inline-flex h-8 w-8 min-w-0 items-center justify-center rounded-xl bg-preset p-2 text-fg-dim sm:h-9 sm:w-9 transition-colors duration-150 ease-out hover:text-link-hover focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
    >
      {enabled ? (
        <SoundOnIcon className="size-4 sm:size-5" />
      ) : (
        <SoundOffIcon className="size-4 sm:size-5" />
      )}
    </button>
  );
}
