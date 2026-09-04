import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

import { SITE_HOMEPAGE, SITE_NAME, shadcnAddCommand } from "@/lib/site-config";

export const alt = `${SITE_NAME}: WebGL shader orbs for React`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* Geist ships TTFs, which the renderer can read straight from node_modules at build time. */
const fontsDir = path.join(process.cwd(), "node_modules/geist/dist/fonts");
const font = (file: string) => readFile(path.join(fontsDir, file));

const FG = "#fafafa";
const MUTED = "#a1a1aa";
const DIM = "#71717a";
const PRESET = "#191919";

/**
 * The card: wordmark and pitch on the left, an orb sitting inside the dashed
 * globe of the site mark on the right. The orb is layered radial gradients,
 * since the real one is a live shader and this has to be a still.
 */
function Orb() {
  const D = 340;
  /* Painted back to front: body, colour accents, a glassy sheen, shading, rim, highlight. */
  const layers: Array<{ backgroundImage: string; opacity?: number }> = [
    {
      backgroundImage:
        "radial-gradient(circle at 36% 30%, #ffffff 0%, #e6ebff 9%, #a3b4ff 28%, #5f4fdb 50%, #1d1846 72%, #04040a 100%)"
    },
    {
      backgroundImage:
        "radial-gradient(circle at 74% 70%, rgba(255,110,205,0.8) 0%, rgba(255,150,90,0.4) 28%, rgba(255,150,90,0) 56%)"
    },
    {
      backgroundImage:
        "radial-gradient(circle at 18% 76%, rgba(80,235,255,0.65) 0%, rgba(80,235,255,0) 44%)"
    },
    {
      backgroundImage:
        "linear-gradient(118deg, rgba(255,255,255,0) 28%, rgba(255,255,255,0.22) 40%, rgba(130,255,240,0.28) 47%, rgba(255,120,225,0.26) 55%, rgba(255,230,140,0.18) 61%, rgba(255,255,255,0) 72%)",
      opacity: 0.9
    },
    {
      backgroundImage:
        "radial-gradient(circle at 82% 88%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 30%, rgba(0,0,0,0) 58%)"
    },
    {
      backgroundImage:
        "radial-gradient(circle at 50% 50%, rgba(255,255,255,0) 66%, rgba(255,255,255,0.36) 80%, rgba(255,255,255,0) 84%)"
    },
    {
      backgroundImage:
        "radial-gradient(circle at 33% 26%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 6%, rgba(255,255,255,0) 18%)"
    }
  ];

  return (
    <div style={{ position: "relative", display: "flex", width: 480, height: 480 }}>
      {/* Halo behind the sphere. */}
      <div
        style={{
          position: "absolute",
          left: 10,
          top: 10,
          width: 460,
          height: 460,
          borderRadius: 460,
          backgroundImage:
            "radial-gradient(circle at 50% 50%, rgba(130,140,255,0.5) 0%, rgba(200,120,255,0.18) 40%, rgba(130,140,255,0) 70%)"
        }}
      />
      {/* The dashed globe from the site mark, drawn behind the sphere. */}
      <svg
        width="480"
        height="480"
        viewBox="0 0 480 480"
        fill="none"
        stroke={FG}
        strokeWidth="1.6"
        strokeDasharray="3 5"
        style={{ position: "absolute", left: 0, top: 0, opacity: 0.55 }}
      >
        <circle cx="240" cy="240" r="228" />
        <ellipse cx="240" cy="240" rx="228" ry="78" />
        <ellipse cx="240" cy="240" rx="228" ry="160" />
        <ellipse cx="240" cy="240" rx="78" ry="228" />
      </svg>
      <div style={{ position: "absolute", left: 70, top: 70, display: "flex", width: D, height: D }}>
        {layers.map((layer, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: D,
              height: D,
              borderRadius: D,
              backgroundImage: layer.backgroundImage,
              opacity: layer.opacity ?? 1
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default async function OpenGraphImage() {
  const [medium, semibold, mono] = await Promise.all([
    font("geist-sans/Geist-Medium.ttf"),
    font("geist-sans/Geist-SemiBold.ttf"),
    font("geist-mono/GeistMono-Medium.ttf")
  ]);
  const host = new URL(SITE_HOMEPAGE).host;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 96px 0 88px",
          backgroundColor: "#000000",
          backgroundImage:
            "radial-gradient(circle at 22% 0%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 30%, rgba(255,255,255,0) 60%)",
          color: FG,
          fontFamily: "Geist"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 620 }}>
          <div
            style={{
              fontSize: 128,
              fontWeight: 600,
              letterSpacing: "-0.06em",
              lineHeight: 1,
              marginLeft: -6
            }}
          >
            {SITE_NAME}
          </div>
          <div style={{ marginTop: 22, fontSize: 38, fontWeight: 500, color: MUTED, letterSpacing: "-0.02em" }}>
            WebGL shader orbs for React.
          </div>
          <div style={{ marginTop: 14, fontSize: 24, fontWeight: 500, color: DIM, lineHeight: 1.35 }}>
            33 expressive, state-driven orbs for voice and AI agents, installed as local code you own.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 40,
              padding: "16px 24px",
              borderRadius: 16,
              backgroundColor: PRESET,
              fontFamily: "Geist Mono",
              fontSize: 23,
              color: FG,
              letterSpacing: "-0.01em"
            }}
          >
            {shadcnAddCommand("shdr-01")}
          </div>
          <div style={{ marginTop: 26, fontFamily: "Geist Mono", fontSize: 20, color: DIM }}>{host}</div>
        </div>
        <Orb />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: medium, weight: 500, style: "normal" },
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
        { name: "Geist Mono", data: mono, weight: 500, style: "normal" }
      ]
    }
  );
}
