"use client";

import { useSyncExternalStore } from "react";
import { play, setEnabled, setVolume, type SoundName } from "cuelume";

export const SOUND_STORAGE_KEY = "orbkit-sound";
const CHANGE_EVENT = "orbkit-sound-change";

/** Global level for every cue. Ticks should sit under the UI, not on top of it. */
const CUE_VOLUME = 0.6;

function readStored(): boolean {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Cached on the client so a press does not hit localStorage every time. */
let current: boolean | null = null;

export function isSoundEnabled(): boolean {
  if (current === null) {
    current = readStored();
  }
  return current;
}

/** Push the stored preference into Cuelume. Runs once on mount, before any press. */
export function syncSoundPreference() {
  setVolume(CUE_VOLUME);
  setEnabled(isSoundEnabled());
}

export function setSoundEnabled(enabled: boolean) {
  current = enabled;
  setEnabled(enabled);
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage is unavailable in restricted contexts; the session still honours the choice.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Play a cue unless the user has turned sound off. */
export function playCue(name: SoundName, options?: { volume?: number }) {
  if (!isSoundEnabled()) return;
  play(name, options);
}

function subscribe(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SOUND_STORAGE_KEY) return;
    current = readStored();
    setEnabled(current);
    onStoreChange();
  };
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Sound defaults to on, so the server snapshot must agree. */
function getServerSnapshot(): boolean {
  return true;
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, isSoundEnabled, getServerSnapshot);
}
