"use client";

import { useEffect, useRef, type CSSProperties } from "react";

/* ----------------------------------------------------------------------------
   Orba core — raw WebGL shader orb runtime. No dependencies.

   An orb is a full-screen triangle rendered into a transparent canvas by a
   fragment shader. Every orb declares a parameter schema (sliders + colors);
   the values are uploaded as uniforms each frame from a ref, so a controls
   panel can tune them live without ever remounting the canvas (a remount would
   drop the WebGL context).

   Animation model: every state synthesizes two volume signals — input (user
   speech energy) and output (agent speech energy) — smooths them, and the
   shaders react to those. The flow clock's speed itself follows the output
   volume, so orbs visibly quicken when the agent is talking.
---------------------------------------------------------------------------- */

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

export const ORB_STATES = ["idle", "listening", "thinking", "speaking"] as const;

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** Per-state [input, output] volume synthesis. */
function targetVolumes(state: OrbState, t: number): [number, number] {
  switch (state) {
    case "idle":
      return [0, 0.3];
    case "listening":
      return [clamp01(0.55 + Math.sin(t * 3.2) * 0.35), 0.45];
    case "speaking":
      return [
        clamp01(0.65 + Math.sin(t * 4.8) * 0.22),
        clamp01(0.75 + Math.sin(t * 3.6) * 0.22)
      ];
    case "thinking": {
      const base = 0.38 + 0.07 * Math.sin(t * 0.7);
      const wander = 0.05 * Math.sin(t * 2.1) * Math.sin(t * 0.37 + 1.2);
      return [clamp01(base + wander), clamp01(0.48 + 0.12 * Math.sin(t * 1.05 + 0.6))];
    }
  }
}

/* ------------------------------ param schema ------------------------------- */

export interface OrbParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /**
   * Rate params. The engine integrates them into a clock
   * (`clock += dt * value * volumeSpeed`) and uploads the clock instead of the
   * raw value, so changing the rate never jumps the phase — the motion speeds
   * up or slows down rather than snapping to a new position.
   */
  integrate?: boolean;
}

export interface OrbColorDef {
  key: string;
  label: string;
  /** hex, e.g. `#ff8b73` */
  default: string;
}

export interface OrbVariant {
  key: string;
  label: string;
  note: string;
  /** GLSL fragment shader body. Uniform declarations are generated for you. */
  frag: string;
  params: OrbParamDef[];
  colors: OrbColorDef[];
  /**
   * Per-state parameter targets. The engine glides each param toward the
   * active state's preset. Params passed explicitly via the `params` prop
   * always win over the preset.
   */
  statePresets?: Partial<Record<OrbState, Record<string, number>>>;
}

export type OrbParamValues = Partial<Record<string, number>>;
export type OrbColorValues = Partial<Record<string, string>>;

/** Every param and color at its schema default. */
export function defaultValuesFor(variant: OrbVariant): {
  params: Record<string, number>;
  colors: Record<string, string>;
} {
  return {
    params: Object.fromEntries(variant.params.map((p) => [p.key, p.default])),
    colors: Object.fromEntries(variant.colors.map((c) => [c.key, c.default]))
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* ------------------------------- GLSL shared ------------------------------- */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * Prelude prepended to every orb fragment shader: uniforms, value noise, fbm,
 * and the centered aspect-corrected UV helper.
 */
export const ORB_GLSL_HELPERS = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;   // slow ambient clock (half real-time)
uniform float uAnim;   // flow clock — its speed follows the output volume
uniform float uInput;  // input volume 0..1: user speech energy
uniform float uOutput; // output volume 0..1: agent speech energy

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(11.7, 7.3);
    a *= 0.5;
  }
  return v;
}
vec2 orbUV() { return (2.0 * gl_FragCoord.xy - uRes) / min(uRes.x, uRes.y); }

// GLSL ES 1.0 has no tanh() — it arrived in ES 3.0. Shader-golf listings lean
// on it as a tone-mapper, so it ships here. Clamped against exp() overflow;
// accurate for the non-negative accumulators those shaders produce.
vec3 tanh3(vec3 x) {
  x = clamp(x, -10.0, 10.0);
  vec3 e = exp(2.0 * x);
  return (e - 1.0) / (e + 1.0);
}
`;

function paramUniformDecls(variant: OrbVariant): string {
  return [
    ...variant.params.map((p) => `uniform float uP_${p.key};`),
    ...variant.colors.map((c) => `uniform vec3 uC_${c.key};`)
  ].join("\n");
}

/* ------------------------------- engine ------------------------------------ */

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("[orba] shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export interface ShaderOrbProps {
  /** The orb definition: shader + param schema + state presets. */
  variant: OrbVariant;
  /** Drives the synthesized volume signals. Defaults to `"idle"`. */
  state?: OrbState;
  /** Rendered size in CSS pixels. Ignored when `className` sizes the canvas. */
  size?: number;
  /** Explicit param overrides. Any key present here wins over the state preset. */
  params?: OrbParamValues;
  /** Explicit color overrides, as hex strings. */
  colors?: OrbColorValues;
  /** Freeze the animation on the current frame. */
  paused?: boolean;
  /**
   * Stop rendering while the orb is scrolled out of view. Defaults to `true` —
   * a page full of orbs would otherwise run a WebGL loop per card.
   */
  pauseOffscreen?: boolean;
  /** Device-pixel-ratio ceiling. Defaults to `2`. */
  maxDpr?: number;
  className?: string;
  style?: CSSProperties;
  /** Accessible label. When omitted the canvas is hidden from assistive tech. */
  ariaLabel?: string;
}

export function ShaderOrb({
  variant,
  state = "idle",
  size,
  params,
  colors,
  paused = false,
  pauseOffscreen = true,
  maxDpr = 2,
  className,
  style,
  ariaLabel
}: ShaderOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Live refs: the render loop reads these every frame, so changing a param
  // never re-runs the GL setup effect (which would drop the context). Synced in
  // an effect rather than during render — a ref write during render is unsafe
  // under concurrent rendering, and the loop picks the new value up on the very
  // next frame anyway.
  const stateRef = useRef<OrbState>(state);
  const paramsRef = useRef<OrbParamValues | undefined>(params);
  const colorsRef = useRef<OrbColorValues | undefined>(colors);
  const pausedRef = useRef(paused);

  useEffect(() => {
    stateRef.current = state;
    paramsRef.current = params;
    colorsRef.current = colors;
    pausedRef.current = paused;
  }, [state, params, colors, paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true
    });
    if (!gl || gl.isContextLost()) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(
      gl,
      gl.FRAGMENT_SHADER,
      ORB_GLSL_HELPERS + paramUniformDecls(variant) + variant.frag
    );
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[orba] program link error:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uAnim = gl.getUniformLocation(prog, "uAnim");
    const uInput = gl.getUniformLocation(prog, "uInput");
    const uOutput = gl.getUniformLocation(prog, "uOutput");

    const paramLocs = variant.params.map((p) => ({
      def: p,
      loc: gl.getUniformLocation(prog, `uP_${p.key}`)
    }));
    const colorLocs = variant.colors.map((c) => ({
      def: c,
      loc: gl.getUniformLocation(prog, `uC_${c.key}`)
    }));

    /* --- sizing: track the element box, not a one-shot measurement --------- */
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    resize();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(canvas);

    /* --- visibility: don't burn a render loop on an offscreen orb ---------- */
    let visible = !pauseOffscreen;
    const intersectionObserver =
      pauseOffscreen && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              visible = Boolean(entries[0]?.isIntersecting);
              if (visible) {
                last = performance.now() / 1000;
              }
            },
            { rootMargin: "150px 0px", threshold: 0 }
          )
        : null;
    if (intersectionObserver) {
      intersectionObserver.observe(canvas);
    } else {
      visible = true;
    }

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* --- driver state ------------------------------------------------------ */
    let tSec = 0;
    // random phase so two orbs on the same page never look synchronized
    let anim = Math.random() * 100;
    let speed = 0.1;
    const cur = { in: 0, out: 0.3 };
    const presets = variant.statePresets;
    const paramCur: Record<string, number> = {};
    const paramClocks: Record<string, number> = {};
    const [initialIn, initialOut] = targetVolumes(stateRef.current, 0);
    cur.in = initialIn;
    cur.out = initialOut;
    let last = performance.now() / 1000;
    let raf = 0;

    const uploadAndDraw = (dt: number) => {
      const [tin, tout] = targetVolumes(stateRef.current, tSec);
      const kVol = 1 - Math.exp(-dt * 12);
      cur.in += (tin - cur.in) * kVol;
      cur.out += (tout - cur.out) * kVol;

      // flow speed follows the output volume, then is smoothed
      const targetSpeed = 0.1 + (1 - Math.pow(cur.out - 1, 2)) * 0.9;
      speed += (targetSpeed - speed) * (1 - Math.exp(-dt * 7));
      anim += dt * speed;

      gl.uniform1f(uTime, tSec * 0.5);
      gl.uniform1f(uAnim, anim);
      gl.uniform1f(uInput, cur.in);
      gl.uniform1f(uOutput, cur.out);

      // Resolution order per param: explicit prop → active state preset →
      // schema default. Values glide rather than snap.
      const kParam = 1 - Math.exp(-dt * 1.8);
      const liveParams = paramsRef.current;
      const statePreset = presets?.[stateRef.current];

      for (const { def, loc } of paramLocs) {
        const explicit = liveParams?.[def.key];
        const target =
          typeof explicit === "number" ? explicit : (statePreset?.[def.key] ?? def.default);
        const curVal = paramCur[def.key] ?? target;
        const next = curVal + (target - curVal) * kParam;
        paramCur[def.key] = next;

        if (def.integrate) {
          const clock =
            (paramClocks[def.key] ?? (paramClocks[def.key] = Math.random() * 100)) +
            dt * speed * next;
          paramClocks[def.key] = clock;
          gl.uniform1f(loc, clock);
        } else {
          gl.uniform1f(loc, next);
        }
      }

      const liveColors = colorsRef.current;
      for (const { def, loc } of colorLocs) {
        const [cr, cg, cb] = hexToRgb(liveColors?.[def.key] ?? def.default);
        gl.uniform3f(loc, cr, cg, cb);
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    if (reduceMotion) {
      // One representative frame, then stop. `dt` is large enough that the
      // param glide lands on its target immediately.
      tSec = 1;
      uploadAndDraw(1);
      return () => {
        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.deleteBuffer(buf);
      };
    }

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now() / 1000;
      const dt = Math.min(now - last, 0.05);
      last = now;
      if (!visible || pausedRef.current) return;
      tSec += dt;
      uploadAndDraw(dt);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      // Free GL objects but leave the context alive: React re-runs this effect
      // on the same canvas in dev StrictMode, and a lost context can't compile.
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, [variant, pauseOffscreen, maxDpr]);

  const sizeStyle: CSSProperties =
    size === undefined ? {} : { width: size, height: size };

  return (
    <canvas
      // A lost WebGL context can't be reused, so each variant gets a fresh canvas.
      key={variant.key}
      ref={canvasRef}
      className={className}
      style={{ display: "block", ...sizeStyle, ...style }}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    />
  );
}
