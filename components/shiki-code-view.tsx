"use client";

import type { BundledLanguage } from "shiki/bundle/web";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "framer-motion";
import Scritto from "@scritto/react";
import { useEffect, useMemo, useState } from "react";

import { ORBKIT_CODE_THEME } from "@/lib/orbkit-code-theme";

/*
  One theme, both colour schemes. lib/orbkit-code-theme.ts colours tokens with
  var(--color-code-*), which Shiki writes into the inline styles verbatim, so
  the generated HTML is already correct in light and dark — the cascade swaps
  the values. That is why there is no theme-mode state or MutationObserver
  here any more: nothing needs re-highlighting when the theme toggles.
*/

/** Just enough of Shiki's `ThemedToken` to render one; it isn't re-exported. */
interface CodeToken {
  content: string;
  color?: string;
  /** TextMate bit flags — 1 italic, 2 bold, 4 underline. */
  fontStyle?: number;
}

/*
  Line motion, for `animateLines`.

  Position only: a line's box is a line of text, and animating its size would
  scale the glyphs inside it. `layout="position"` moves the box and leaves the
  type alone.
*/
const LINE_TRANSITION: Transition = {
  layout: { type: "spring", stiffness: 460, damping: 40, mass: 0.6 },
  opacity: { duration: 0.22, ease: "easeOut" },
  filter: { duration: 0.22, ease: "easeOut" }
};

const LINE_EXIT_TRANSITION: Transition = { duration: 0.13, ease: "easeIn" };

/**
 * A token that is nothing but a number.
 *
 * Shiki gives numeric literals their own token, so this catches exactly the
 * values you can edit — `420` in `size={420}`, `0.7` in `speed: 0.7` — and
 * never a digit inside an identifier or a string.
 */
const NUMERIC_TOKEN = /^-?\d+(?:\.\d+)?$/;

/*
  Number motion, via Scritto: only the digits that changed move, each rolling
  from the old character to the new one while the rest hold. Shorter than its
  550ms default because these numbers change under a drag — a roll long enough
  to still be running when the next value lands reads as a smear.

  Hoisted rather than written inline: the binding re-applies its options
  whenever this object's identity changes, which for a literal is every render.
*/
const NUMBER_TRANSITION = { duration: 320, easing: "cubic-bezier(0.2, 0, 0, 1)" };

/**
 * A line's identity across edits to the code.
 *
 * Keys have to survive a value changing — dragging `size` must not make its
 * line count as new — while a prop that was not there before has to read as
 * genuinely new. So the key is structural rather than textual: the identifier
 * a line introduces, qualified by the identifiers of the blocks it sits inside
 * (indentation gives the nesting), with a running count to separate lines that
 * introduce nothing of their own — the closing braces.
 *
 * The upshot in the playground: editing a param rewrites a line in place,
 * adding one fades a line in and slides the rest down.
 */
function lineKeys(lines: readonly string[]): string[] {
  const stack: { indent: number; ident: string }[] = [];
  const seen = new Map<string, number>();

  return lines.map((line) => {
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    // Anything indented at or past this line has closed.
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();

    let ident: string;
    if (trimmed.startsWith("</") || trimmed.startsWith("/>") || trimmed === ">") ident = "close";
    else if (trimmed.startsWith("<")) ident = "open";
    else ident = /^([A-Za-z_$][\w$]*)/.exec(trimmed)?.[1] ?? trimmed;

    const base = [...stack.map((s) => s.ident), ident].join("/");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    stack.push({ indent, ident });

    return n === 0 ? base : `${base}#${n}`;
  });
}

export function ShikiCodeView({
  code,
  lang,
  className,
  lineNumbers = true,
  animateLines = false
}: {
  code: string;
  lang: BundledLanguage;
  className?: string;
  /** Gutter with 1-based line indices (off for one-line install snippets). */
  lineNumbers?: boolean;
  /**
   * Animate the block as the code changes: added lines fade in, surviving
   * lines slide to their new position. For code that is edited live — the
   * playground's export. Static blocks should leave this off; they pay for a
   * per-line React tree they have no use for.
   */
  animateLines?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [html, setHtml] = useState<string | null>(null);
  /*
    Tokens and their keys travel together. Highlighting is async, so for a
    frame after `code` changes the tokens on screen are still the previous
    ones — keys derived from the new `code` in render would be handed to the
    old lines, and every line past the edit would look like a different line.
    Deriving them from the tokens themselves keeps the two in step.
  */
  const [highlight, setHighlight] = useState<{
    tokens: CodeToken[][];
    keys: string[];
  } | null>(null);
  const lines = useMemo(() => code.split("\n"), [code]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      /*
        Two shapes of the same highlight. The animated path needs the tokens
        as data so each line can be its own element; everything else takes the
        one-blob HTML, which is cheaper and needs no React tree per token.
      */
      if (animateLines) {
        const { codeToTokens } = await import("shiki/bundle/web");
        const { tokens } = await codeToTokens(code, { lang, theme: ORBKIT_CODE_THEME });
        if (cancelled) return;
        setHighlight({
          tokens,
          keys: lineKeys(tokens.map((line) => line.map((token) => token.content).join("")))
        });
        return;
      }
      const { codeToHtml } = await import("shiki/bundle/web");
      const next = await codeToHtml(code, { lang, theme: ORBKIT_CODE_THEME });
      if (!cancelled) setHtml(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [animateLines, code, lang]);

  const ready = animateLines ? highlight !== null : html !== null;

  return (
    <div
      className={[
        lineNumbers
          ? "grid min-h-0 min-w-0 grid-cols-[minmax(2.25rem,auto)_minmax(0,1fr)] gap-x-0"
          : "min-h-0 min-w-0",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      aria-busy={ready ? undefined : true}
    >
      {lineNumbers ? (
        <div
          className="theme-text-dim select-none py-0 pr-2.5 font-mono text-[12px] tabular-nums"
          aria-hidden
        >
          {lines.map((_, i) => (
            <div
              key={i}
              className="flex min-h-lh items-center justify-end text-right leading-relaxed"
            >
              {i + 1}
            </div>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 py-0">
        {animateLines && highlight ? (
          /*
            `mode="popLayout"` is what makes a removed line read correctly: it
            takes the outgoing line out of the flow at once, so the lines below
            start closing the gap while it is still fading, instead of waiting
            for it and then jumping.

            `initial={false}` keeps the first paint from staggering itself in —
            the animation is about what changes, not about arriving.
          */
          <div className="min-w-0 font-mono text-[12px] leading-relaxed">
            <AnimatePresence mode="popLayout" initial={false}>
              {highlight.tokens.map((tokens, i) => (
                <motion.div
                  key={highlight.keys[i] ?? i}
                  layout={reduceMotion ? false : "position"}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)" }}
                  animate={
                    reduceMotion ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)" }
                  }
                  exit={
                    reduceMotion
                      ? { opacity: 0, transition: LINE_EXIT_TRANSITION }
                      : { opacity: 0, filter: "blur(4px)", transition: LINE_EXIT_TRANSITION }
                  }
                  transition={LINE_TRANSITION}
                  className="block min-h-lh whitespace-pre"
                >
                  {tokens.map((token, j) => {
                    const style = {
                      color: token.color,
                      fontStyle: token.fontStyle && token.fontStyle & 1 ? "italic" : undefined,
                      fontWeight: token.fontStyle && token.fontStyle & 2 ? "bold" : undefined
                    };
                    /*
                      Index keys are what make this work: a value edit leaves
                      the line's token split alone, so the number keeps its
                      position, React reuses the element, and Scritto sees a
                      new value on the same box — which is the change it
                      animates. A fresh element would just appear.
                    */
                    return NUMERIC_TOKEN.test(token.content) ? (
                      <Scritto
                        key={j}
                        value={token.content}
                        transition={NUMBER_TRANSITION}
                        style={style}
                      />
                    ) : (
                      <span key={j} style={style}>
                        {token.content}
                      </span>
                    );
                  })}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : html ? (
          <div
            className="shiki-embed min-w-0 [&_code]:block [&_code]:whitespace-normal [&_pre]:m-0 [&_pre]:min-h-0 [&_pre]:bg-transparent! [&_pre]:p-0 [&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:leading-relaxed [&_pre]:whitespace-normal [&_span.line]:block [&_span.line]:min-h-lh [&_span.line]:whitespace-pre [&_span.line]:leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="theme-text-dim m-0 whitespace-pre bg-transparent p-0 font-mono text-[12px] leading-relaxed">
            {code}
          </pre>
        )}
      </div>
    </div>
  );
}
