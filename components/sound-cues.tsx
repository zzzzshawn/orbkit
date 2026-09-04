"use client";

import { useEffect } from "react";
import { sounds, type SoundName } from "cuelume";

import { playCue, syncSoundPreference } from "@/lib/sound-cues";

/**
 * Anything that reads as pressable. ARIA roles cover custom widgets, and the
 * DialKit classes cover the playground panel, whose controls carry no roles.
 * Set `data-cue` to a Cuelume sound name to change what a control plays, or
 * to "none" to keep it silent.
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

/** Controls whose value should tick as it moves. */
const SLIDER = "input[type=range], [role=slider], .dialkit-slider";

/** Fast ticks while a value scrubs: never closer together than this, in ms. */
const SCRUB_INTERVAL = 45;

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
 * Which cue a press plays: `data-cue` on the control wins, DialKit's panel
 * toggle blooms open and drips closed, and everything else ticks.
 */
function cueFor(element: Element): SoundName | null {
  const own = element.getAttribute("data-cue");
  if (own === "none") return null;
  if (own && (sounds as readonly string[]).includes(own)) return own as SoundName;
  if (element.matches('.dialkit-panel-icon, .dialkit-panel-inner[data-collapsed="true"]')) {
    const inner = element.closest(".dialkit-panel-inner");
    return inner?.getAttribute("data-collapsed") === "true" ? "bloom" : "droplet";
  }
  return "tick";
}

/**
 * One delegated listener that plays a Cuelume cue on every press of an
 * interactive element: mouse, touch, pen, and keyboard activation. Capture
 * phase, so widgets that stop propagation for their own drag handling still
 * sound. Sliders also tick rapidly as their value moves. Renders nothing.
 */
export function SoundCues() {
  useEffect(() => {
    syncSoundPreference();

    let lastScrub = 0;
    const scrubTick = () => {
      const now = performance.now();
      if (now - lastScrub < SCRUB_INTERVAL) return;
      lastScrub = now;
      playCue("tick", { volume: 0.7 });
    };

    const press = (element: Element) => {
      const cue = cueFor(element);
      if (cue) playCue(cue);
      // The press already sounded; a value jump on the same pointerdown should not.
      if (element.matches(SLIDER)) lastScrub = performance.now();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const element = pressTarget(event.target);
      if (element) press(element);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (event.key.startsWith("Arrow")) {
        if (active instanceof Element && active.matches(SLIDER)) scrubTick();
        return;
      }
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
      const element = pressTarget(active);
      if (element) press(element);
    };

    // Native range inputs report every step through `input`.
    const onInput = (event: Event) => {
      if (event.target instanceof Element && event.target.matches("input[type=range]")) {
        scrubTick();
      }
    };

    // DialKit sliders have no input element: they rewrite the value text as
    // you drag, so watch for that instead. One tick per batch, so a preset
    // reset that moves every slider at once is a single detent.
    const observer = new MutationObserver((records) => {
      const active = document.activeElement;
      for (const record of records) {
        const node = record.target;
        const element = node instanceof Element ? node : node.parentElement;
        const value = element?.closest(".dialkit-slider-value");
        if (!value) continue;
        if (active && value.contains(active)) continue;
        scrubTick();
        break;
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    document.addEventListener("keydown", onKeyDown, { capture: true, passive: true });
    document.addEventListener("input", onInput, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("input", onInput, { capture: true });
    };
  }, []);

  return null;
}
