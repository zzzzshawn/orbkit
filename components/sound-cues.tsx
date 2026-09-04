"use client";

import { useEffect } from "react";

import { playCue, syncSoundPreference } from "@/lib/sound-cues";

/**
 * Anything that reads as pressable. ARIA roles cover custom widgets, and the
 * DialKit classes cover the playground panel, whose controls carry no roles.
 * Opt an element in with `data-cue` or out with `data-cue="none"`.
 */
const INTERACTIVE = [
  "button",
  "a[href]",
  "summary",
  "select",
  "input[type=range]",
  "input[type=checkbox]",
  "input[type=radio]",
  "input[type=button]",
  "input[type=submit]",
  "input[type=color]",
  "[role=button]",
  "[role=slider]",
  "[role=switch]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=tab]",
  "[role=menuitem]",
  "[role=menuitemcheckbox]",
  "[role=menuitemradio]",
  "[role=option]",
  "[role=link]",
  "[data-cue]",
  ".dialkit-slider",
  ".dialkit-toggle",
  ".dialkit-segmented-button",
  ".dialkit-select-trigger",
  ".dialkit-select-option",
  ".dialkit-preset-trigger",
  ".dialkit-preset-item",
  ".dialkit-color-swatch",
  ".dialkit-folder-header",
  ".dialkit-panel-icon",
  '.dialkit-panel-inner[data-collapsed="true"]',
  ".dialkit-button",
  ".dialkit-toolbar-add"
].join(", ");

/** Typing targets never tick, even when they sit inside a pressable control. */
const TEXT_ENTRY =
  "input:not([type]), input[type=text], input[type=number], input[type=search], input[type=email], input[type=url], input[type=password], textarea, [contenteditable=''], [contenteditable=true]";

function pressTarget(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  if (target.closest(TEXT_ENTRY)) return null;
  const element = target.closest(INTERACTIVE);
  if (!element) return null;
  if (element.closest('[data-cue="none"]')) return null;
  if (element.matches(':disabled, [aria-disabled="true"]')) return null;
  return element;
}

/**
 * One delegated listener that plays Cuelume's `tick` on every press of an
 * interactive element: mouse, touch, pen, and keyboard activation. Capture
 * phase, so widgets that stop propagation for their own drag handling still
 * tick. Renders nothing.
 */
export function SoundCues() {
  useEffect(() => {
    syncSoundPreference();

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (pressTarget(event.target)) playCue("tick");
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
      if (pressTarget(document.activeElement)) playCue("tick");
    };

    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    document.addEventListener("keydown", onKeyDown, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, []);

  return null;
}
