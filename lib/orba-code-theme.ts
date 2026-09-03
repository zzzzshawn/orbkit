import type { ThemeRegistrationRaw } from "shiki/bundle/web";

/*
  Orba's own highlight theme.

  Every colour here is a `var(--color-code-*)` rather than a hex. Shiki writes
  those straight into the inline styles it generates, so the palette lives in
  ONE place — the :root blocks in app/globals.css — and drives both the code
  blocks and the props tables in lib/orb-props-reference.tsx. Edit the
  variable, everything moves.

  Two things fall out of that. Light and dark need no separate theme: the
  cascade swaps the values, so the same highlighted HTML is correct in both,
  and nothing has to be re-highlighted when the theme toggles. And the colours
  can never drift between a table cell and the snippet above it, because
  there is nothing to keep in sync.

  It is a deliberately small palette — four roles, no warm tones:

    keyword  keywords and language constants (const, return, true, null)
    type     the names of things — functions and types
    literal  values you would copy — strings and numbers
    ident    everything you named yourself, kept quiet
*/

const KEYWORD = "var(--color-code-keyword)";
const TYPE = "var(--color-code-type)";
const LITERAL = "var(--color-code-literal)";
const IDENT = "var(--color-code-ident)";
const COMMENT = "var(--color-code-comment)";

export const ORBA_CODE_THEME: ThemeRegistrationRaw = {
  name: "orba",
  type: "dark",
  colors: {
    // Never seen — ShikiCodeView forces the <pre> transparent so code sits on
    // the site's own --color-code-bg. Declared because Shiki expects it.
    "editor.background": "var(--color-code-bg)",
    "editor.foreground": IDENT
  },
  settings: [
    {
      scope: ["comment", "punctuation.definition.comment", "string.comment"],
      settings: { foreground: COMMENT, fontStyle: "italic" }
    },
    {
      // const / return / export / import / typeof, plus true, false, null,
      // undefined — the language's own words, not yours.
      scope: [
        "keyword",
        "keyword.control",
        "keyword.operator.new",
        "keyword.operator.expression",
        "storage",
        "storage.type",
        "storage.modifier",
        "constant.language",
        "variable.language",
        "meta.import keyword",
        "meta.export keyword"
      ],
      settings: { foreground: KEYWORD }
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "variable.function",
        "meta.function-call entity.name.function",
        "meta.function-call.generic",
        "entity.name.method"
      ],
      settings: { foreground: TYPE }
    },
    {
      scope: [
        "support.type",
        "support.class",
        "entity.name.type",
        "entity.name.class",
        "entity.other.inherited-class",
        "support.type.primitive",
        "entity.name.tag",
        "meta.type.annotation entity.name.type"
      ],
      settings: { foreground: TYPE }
    },
    {
      scope: [
        "string",
        "string.quoted",
        "string.template",
        "punctuation.definition.string",
        "constant.character",
        "constant.other.symbol"
      ],
      settings: { foreground: LITERAL }
    },
    {
      scope: ["constant.numeric", "keyword.other.unit"],
      settings: { foreground: LITERAL }
    },
    {
      scope: [
        "variable",
        "variable.other",
        "variable.parameter",
        "meta.object-literal.key",
        "support.variable",
        "punctuation",
        "meta.brace",
        "keyword.operator"
      ],
      settings: { foreground: IDENT }
    }
  ]
};
