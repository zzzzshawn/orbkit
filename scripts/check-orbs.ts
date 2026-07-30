/*
 * Static checks over every orb file.
 *
 * These are the mistakes that actually happened while building the library, and
 * every one of them fails somewhere far from its cause:
 *
 *   BACKTICK   a backtick inside the shader's comments terminates the template
 *              literal early. TypeScript then reports something like TS1005 or
 *              TS1443 on a line with no obvious problem.
 *   MISSING    a uP_/uC_ uniform used by the shader with no schema entry. The
 *              engine only creates uniforms from the schema, so the shader
 *              fails to compile at runtime with "undeclared identifier".
 *   UNUSED     a schema entry no shader reads. Renders a dead slider in the
 *              playground and a meaningless row in the docs table.
 *   STALE      a state preset naming a param that no longer exists. Silently
 *              does nothing, which is the worst failure mode of the four.
 *
 * Run with `pnpm check:orbs` (also part of `pnpm build`).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ORBS_DIR = path.join(process.cwd(), "orbs", "orbs");
const STATES = ["idle", "listening", "thinking", "speaking"];

interface Problem {
  file: string;
  kind: string;
  detail: string;
}

const problems: Problem[] = [];
let checked = 0;

for (const file of readdirSync(ORBS_DIR).sort()) {
  if (!file.endsWith(".tsx")) continue;
  const source = readFileSync(path.join(ORBS_DIR, file), "utf-8");

  const fragMatch = source.match(/const (\w+_FRAG) =/);
  if (!fragMatch) continue;
  checked++;

  const start = source.indexOf("`", source.indexOf(fragMatch[0])) + 1;
  const end = source.indexOf("`", start);
  const frag = source.slice(start, end);

  // The template ends at the FIRST backtick, so a stray one inside the comments
  // truncates `frag` rather than appearing in it. Detect it by checking whether
  // the shader actually reached its closing brace.
  if (!frag.trimEnd().endsWith("}")) {
    problems.push({
      file,
      kind: "BACKTICK",
      detail:
        "shader template appears truncated — a backtick in a GLSL comment ends the template literal early"
    });
    continue;
  }

  const usedParams = [...new Set([...frag.matchAll(/uP_(\w+)/g)].map((m) => m[1]))];
  const usedColors = [...new Set([...frag.matchAll(/uC_(\w+)/g)].map((m) => m[1]))];

  const schema = source.slice(source.indexOf("params:"));
  const paramKeys = [
    ...new Set(
      [...schema.matchAll(/\{ key: "(\w+)"[^}]*default: [0-9-]/g)].map((m) => m[1])
    )
  ];
  const colorKeys = [
    ...new Set(
      [...schema.matchAll(/\{ key: "(\w+)", label: "[^"]*", default: "#/g)].map((m) => m[1])
    )
  ];

  for (const u of usedParams) {
    if (!paramKeys.includes(u)) {
      problems.push({ file, kind: "MISSING", detail: `uP_${u} has no params entry` });
    }
  }
  for (const u of usedColors) {
    if (!colorKeys.includes(u)) {
      problems.push({ file, kind: "MISSING", detail: `uC_${u} has no colors entry` });
    }
  }
  for (const k of paramKeys) {
    if (!usedParams.includes(k)) {
      problems.push({ file, kind: "UNUSED", detail: `param "${k}" is never read by the shader` });
    }
  }
  for (const c of colorKeys) {
    if (!usedColors.includes(c)) {
      problems.push({ file, kind: "UNUSED", detail: `color "${c}" is never read by the shader` });
    }
  }

  for (const preset of source.matchAll(
    new RegExp(`(${STATES.join("|")}):\\s*\\{([^}]*)\\}`, "g")
  )) {
    for (const key of [...preset[2].matchAll(/(\w+):/g)].map((m) => m[1])) {
      if (!paramKeys.includes(key)) {
        problems.push({
          file,
          kind: "STALE",
          detail: `preset ${preset[1]} sets "${key}", which is not in params`
        });
      }
    }
  }
}

if (problems.length === 0) {
  console.log(`[orba] check-orbs: ${checked} orb(s) OK`);
  process.exit(0);
}

console.error(`[orba] check-orbs: ${problems.length} problem(s) across ${checked} orb(s)\n`);
for (const p of problems) {
  console.error(`  ${p.kind.padEnd(8)} ${p.file.padEnd(22)} ${p.detail}`);
}
process.exit(1);
