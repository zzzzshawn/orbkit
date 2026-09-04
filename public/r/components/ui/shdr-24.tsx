/*
 * Deliberately not a `"use client"` module — see the note in `shdr-11.tsx`.
 *
 * Note for editors: the shader lives in a template literal, so its comments
 * must not contain backticks.
 */
import { ShaderOrb, type OrbVariant, type ShaderOrbProps } from "@/components/ui/orbkit-core";

/* ----------------------------------------------------------------------------
   SHDR-24 — a Minecraft Earth: a voxel planet with continents, oceans and
   biomes wrapped around the whole ball.

   THE ORB IS THE OBJECT taken literally: instead of wrapping a block texture
   onto a smooth ball, the ball is BUILT FROM BLOCKS. A DDA voxel march
   (Amanatides & Woo) walks an axis-aligned grid in object space; a voxel is
   solid wherever its centre sits below the terrain radius for its direction.
   Up is RADIAL, as on a planet seen from space.

   THE GROUND IS A PERFECT SPHERE. Terrain relief is strictly ADDITIVE —
   max(noise - sea level, 0) — so oceans and coastal plains sit exactly on
   the unit sphere and only the mountains climb above it. The silhouette
   reads as a clean round globe with peaks and tree fuzz breaking the rim,
   not as a lumpy rock. From space down:

   - OCEANS: where the field sits below sea level the ground stays at the
     sphere and its surface blocks render as water — flush on the globe,
     lighter over coastal shallows, deep blue mid-ocean, shimmering on the
     flow clock. SAND beaches band every shore.
   - BIOMES: a continent-scale noise field paints deserts (sand runs deep,
     no trees), plains (grass, scattered trees) and forests (dense cover).
     Elevation cuts across all of them: rising ground bares brown
     hillsides, and the peaks stand as naked stone.
   - SEASONS: an integrated season clock carries the whole planet through
     five worlds on a cycle — lush, CHERRY GROVE, ICE, MESA, desert —
     crossfading two at a time (blossom thaws into snow, terracotta dries
     into sand), racing while the orb thinks. The ice world is drawn from
     the ice-spikes and frozen-peaks biomes: dense tapering packed-ice
     spires instead of trees, glacier-blue patches over the risen faces,
     elevation browns buried under snow, oceans stilled to a frozen
     sheet. The mesa amplifies its relief into big flat-topped banded
     towers with red-sand flats and cacti. The cherry grove covers vivid
     meadows with broad flat blossom-pink puffs on short dark trunks.
   - TREES: block trees on a cubemap-cell lattice — the direction is
     projected onto its dominant cube face and quantized, so every voxel
     on a radial line agrees which tree cell it is in. Trunks grow
     radially, which is what fuzzes the silhouette green over forests;
     canopy radius is re-hashed per voxel for ragged blocky foliage.
   - STRATA under the surface: grass (or desert sand) on the outward
     faces of surface blocks, MUD on their sides and for a band below —
     mottled with hashed stone patches — then STONE, seamed with ORE.
   - ORE VEINS: a coarse cell grid hashes multi-block clusters into the
     deep stone — diamond (the tunable ore colour), lapis (a deep-blue
     remap of it), or coal (unlit) — and each ore block is stone FLECKED
     with the hue on its texture grain, like the actual ore tile. Only
     the flecks glow.
   - CAVES: a band of a second 3D field is carved to air, but ONLY where
     the ground has risen — mountainsides get entrances, the smooth
     lowland sphere stays pristine — and the rock warms toward a MOLTEN
     CORE that blazes through the deep pits when the agent speaks.

   Construction notes:

   - The terrain noise is a tri-planar sum of the prelude's 2D value noise
     (seam-free, no atan). Averaging three samples squeezes the
     distribution toward 0.5, so the range is stretched back out — without
     that the field never reaches the extremes where oceans and peaks live.
   - The march is BOUNDED: rays intersect an analytic sphere around the
     tallest possible tree first, so empty pixels cost two dot products.
   - Faces are shaded flat off their axis-aligned normals — the Minecraft
     read — plus a radial wrap term for planetary roundness, a crevice AO,
     and a depth dimming that sinks cave interiors into darkness so the
     ore and core glow read as underground.
   - No fwidth, no round, constant loop bound with inner breaks —
     GLSL ES 1.0 throughout, as everywhere in this repo.
   - Surface-lit and hit-bounded, so alpha IS coverage — premultiplied
     output (trivially: hits are opaque, misses are clear). The blocky
     aliasing on the rim is the aesthetic, not a bug.
---------------------------------------------------------------------------- */

const CHUNK_FRAG = `
#define STEPS 160

// Per-fragment state, resolved once in main() before the march.
vec3 ckDrift;
float ckVs;
float ckMaxH;
float ckSeaN;
// Climate weights (lush, desert, ice, mesa) plus the cherry grove — a
// partition of unity driven by the integrated season clock — and the tree
// density they imply.
vec4 ckClim;
float ckCherry;
float ckTreeMul;

// Tree-cell lookup results (GLSL ES 1.0 has no out-struct ergonomics).
vec3 ckTreeDir;
float ckTreeH1;
float ckTreeH2;

mat2 ckRot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

// Seam-free noise on the direction sphere: tri-planar sum of the prelude's
// 2D value noise, range-stretched (see the header) and clamped so the
// terrain bound stays a true bound.
float ckN3(vec3 p) {
  float v = (noise(p.xy) + noise(p.yz + 19.1) + noise(p.zx + 47.3)) / 3.0;
  return clamp(0.5 + (v - 0.5) * 1.9, 0.0, 1.0);
}

// The raw terrain field for a surface direction, 0..1. Two octaves only —
// the voxel grid quantizes away anything finer.
float ckField(vec3 dir) {
  vec3 q = dir * uP_scale + ckDrift;
  return ckN3(q) * 0.65 + ckN3(q * 2.6 + 31.7) * 0.35;
}

// Local terrain radius. Relief is strictly ADDITIVE above the unit sphere:
// oceans and plains sit exactly on it, mountains climb from the shoreline.
// Under the mesa climate the relief terraces into three-block steps —
// flat-topped buttes and benches, the badlands profile.
float ckTerrain(vec3 dir) {
  // the mesa amplifies its relief into big banded towers
  float h = 1.0 + uP_rough * max(ckField(dir) - ckSeaN, 0.0) * 1.2
    * (1.0 + ckClim.w * 0.8);
  float stepH = 3.0 * ckVs;
  float hq = 1.0 + floor((h - 1.0) / stepH) * stepH;
  return mix(h, hq, ckClim.w * 0.85);
}

// The continent-scale biome field: below 0.3 desert, above 0.58 forest,
// plains between. Drifts with the terrain so biomes move with their land.
float ckBiome(vec3 dir) {
  return ckN3(dir * 1.3 + ckDrift + 57.9);
}

/*
  Which tree cell does this direction fall in? The direction is projected
  onto its dominant cube face and quantized there — every voxel along a
  radial line lands in the same cell, which is what keeps a tree's trunk
  and canopy agreeing across grid levels. The anchor direction is rebuilt
  from the jittered cell centre.
*/
void ckTreeCell(vec3 dir) {
  vec3 ad = abs(dir);
  vec2 fuv;
  float face;
  if (ad.x >= ad.y && ad.x >= ad.z) {
    fuv = dir.yz / ad.x;
    face = dir.x > 0.0 ? 0.0 : 1.0;
  } else if (ad.y >= ad.z) {
    fuv = dir.xz / ad.y;
    face = dir.y > 0.0 ? 2.0 : 3.0;
  } else {
    fuv = dir.xy / ad.z;
    face = dir.z > 0.0 ? 4.0 : 5.0;
  }
  float grid = max(uP_blocks / 6.0, 2.0);
  vec2 cell = floor((fuv * 0.5 + 0.5) * grid);
  ckTreeH1 = hash(cell * 1.17 + face * 19.3);
  ckTreeH2 = hash(cell * 0.71 + face * 7.7 + 9.3);
  vec2 jit = vec2(hash(cell + 7.1 + face), hash(cell + 13.7 + face)) - 0.5;
  vec2 auv = ((cell + 0.5 + jit * 0.3) / grid) * 2.0 - 1.0;
  vec3 cp;
  if (face < 1.5) cp = vec3(face < 0.5 ? 1.0 : -1.0, auv.x, auv.y);
  else if (face < 3.5) cp = vec3(auv.x, face < 2.5 ? 1.0 : -1.0, auv.y);
  else cp = vec3(auv.x, auv.y, face < 4.5 ? 1.0 : -1.0);
  ckTreeDir = normalize(cp);
}

/*
  The world function: what fills this voxel?
    0 air   1 ground   2 trunk   3 leaves
  Ground is the terrain sphere; caves are carved ONLY where the ground has
  risen above the base sphere, so the smooth lowlands stay pristine. Water
  is not a voxel here — ocean surface blocks are painted as water in the
  material pass. Trees grow radially from dry anchors below the tree line,
  dense where the biome says forest.
*/
float ckVoxel(vec3 cc) {
  float r = length(cc);
  vec3 dir = cc / max(r, 1.0e-4);
  if (r < ckMaxH) {
    float h = ckTerrain(dir);
    if (r < h) {
      // carve caves into risen ground only — mountainsides get entrances,
      // the perfect lowland sphere keeps its silhouette
      if (h > 1.0 + 1.5 * ckVs) {
        float cv = ckN3(cc * (uP_scale * 1.9) + 71.3);
        float cw = uP_cave * 0.16 * smoothstep(ckMaxH, ckMaxH - 0.45, r);
        if (abs(cv - 0.5) < cw) return 0.0;
      }
      return 1.0;
    }
  }
  // trees live in a thin shell above the tallest terrain
  if (r < ckMaxH + 8.0 * ckVs && uP_trees > 0.001) {
    ckTreeCell(dir);
    float thrMax = clamp(uP_trees, 0.0, 1.0) * 0.8;
    if (ckTreeH1 > 1.0 - thrMax) {
      // forest density comes from the biome at the ANCHOR, so a whole
      // tree agrees with itself about existing
      float bioA = ckBiome(ckTreeDir);
      float dens = bioA > 0.58 ? 1.0 : (bioA > 0.3 ? 0.25 : 0.0);
      dens *= ckTreeMul; // forests thin out under desert, ice and mesa skies
      if (ckTreeH1 > 1.0 - thrMax * dens) {
        float fA = ckField(ckTreeDir);
        float ha = 1.0 + uP_rough * max(fA - ckSeaN, 0.0) * 1.2;
        // dry land only, below the stone tree line
        if (fA > ckSeaN + 0.015 && ha < 1.0 + uP_rough * 0.42) {
          float lat = length(cc - dot(cc, ckTreeDir) * ckTreeDir);
          if (ckClim.z > 0.5) {
            // ICE SPIKES: the lattice grows tapering packed-ice spires in
            // place of trees. Squaring the height hash makes many stubs
            // and a few tall spires, the ice-plains skyline.
            float spikeH = (2.0 + 6.0 * ckTreeH2 * ckTreeH2) * ckVs;
            float w = mix(1.15, 0.3, clamp((r - ha) / spikeH, 0.0, 1.0)) * ckVs;
            if (lat < w && r > ha - ckVs && r < ha + spikeH) return 3.0;
          } else if (ckClim.w > 0.5) {
            // CACTI: short green columns dotting the badlands flats
            float cacH = (1.5 + 2.0 * ckTreeH2) * ckVs;
            if (lat < 0.6 * ckVs && r > ha - ckVs && r < ha + cacH) return 3.0;
          } else if (ckCherry > 0.5) {
            // CHERRY GROVE: broad flat blossom puffs on short dark trunks —
            // the radial component of the canopy test is stretched, which
            // squashes the puff wide and flat like the cherry grove trees
            float trunkTop = ha + (2.0 + 1.5 * ckTreeH2) * ckVs;
            if (lat < 0.75 * ckVs && r > ha - ckVs && r < trunkTop) return 2.0;
            vec3 dd = cc - ckTreeDir * (trunkTop + 0.6 * ckVs);
            dd += ckTreeDir * dot(dd, ckTreeDir) * 0.8;
            vec3 lv = floor(cc / ckVs);
            float rag = hash(lv.xy * 0.61 + lv.z * 2.23);
            if (length(dd) < (2.2 + 0.5 * rag) * ckVs) return 3.0;
          } else {
            float trunkTop = ha + (2.5 + 2.0 * ckTreeH2) * ckVs;
            if (lat < 0.75 * ckVs && r > ha - ckVs && r < trunkTop) return 2.0;
            vec3 dd = cc - ckTreeDir * (trunkTop + 0.7 * ckVs);
            // canopy radius re-hashed per voxel — ragged blocky foliage
            vec3 lv = floor(cc / ckVs);
            float rag = hash(lv.xy * 0.61 + lv.z * 2.23);
            if (length(dd) < (1.7 + 0.5 * rag) * ckVs) return 3.0;
          }
        }
      }
    }
  }
  return 0.0;
}

void main() {
  // Volume coupling: agent output stokes the glow, the gain and the molten
  // core; user input brightens the key light.
  float glowNow = uP_glow * (0.7 + 1.0 * uOutput);
  float gainNow = uP_gain * (0.9 + 0.3 * uOutput);
  float lightNow = uP_light * (1.0 + 0.3 * uInput);

  // the terrain field drifts on its own integrated clock — in the thinking
  // state it streams, and blocks pop in and out like chunks loading
  ckDrift = vec3(uP_drift * 0.31, uP_drift * 0.17, -uP_drift * 0.23);

  /*
    CLIMATE: the integrated season clock carries the planet through four
    worlds — lush, desert, ice, mesa — on a cycle. The triangular weights
    overlap so exactly two adjacent climates crossfade at any moment, and
    because the clock integrates, changing the season rate never snaps the
    phase: the world just weathers faster or slower.
  */
  // five worlds in crossfade order: lush, cherry, ice, mesa, desert —
  // blossom thaws into snow, terracotta dries into sand
  float t5 = fract(uP_season * 0.05) * 5.0;
  ckClim = vec4(
    clamp(1.0 - min(abs(t5), abs(t5 - 5.0)), 0.0, 1.0), // lush (wraps)
    clamp(1.0 - abs(t5 - 4.0), 0.0, 1.0),               // desert
    clamp(1.0 - abs(t5 - 2.0), 0.0, 1.0),               // ice
    clamp(1.0 - abs(t5 - 3.0), 0.0, 1.0)                // mesa
  );
  ckCherry = clamp(1.0 - abs(t5 - 1.0), 0.0, 1.0);      // cherry grove
  // ice and cherry run HIGH (dense spikes / dense groves); mesa keeps cacti
  ckTreeMul = dot(ckClim, vec4(1.0, 0.15, 0.9, 0.3)) + ckCherry * 0.9;

  ckVs = 2.0 / clamp(uP_blocks, 8.0, 96.0);   // voxel size, planet radius 1
  // sea level in FIELD space: 0.5 puts about half the sphere under water
  ckSeaN = 0.25 + clamp(uP_sea, 0.0, 1.0) * 0.5;
  // tallest possible terrain — sized for the mesa's amplified towers so
  // the viewport holds steady while the seasons turn
  ckMaxH = 1.0 + uP_rough * (1.0 - ckSeaN) * 1.2 * 1.8 + 0.001;
  float bound = ckMaxH + 8.5 * ckVs;          // ...plus the tree shell

  vec2 uv = orbUV() / uP_radius;

  // orthographic camera, viewport sized to the bound so the treetops fit
  vec3 ro = vec3(uv * bound, 2.9);
  vec3 rd = vec3(0.0, 0.0, -1.0);

  // rotate the RAY into object space (inverse tumble) — the grid stays
  // axis-aligned, the planet appears to spin. The light rotates along,
  // keeping the sun fixed relative to the viewer.
  mat2 tiltM = ckRot(uP_tilt); // positive tilt looks DOWN at the north pole
  mat2 spinM = ckRot(-uP_spin); // integrated clock
  ro.yz = tiltM * ro.yz;
  ro.xz = spinM * ro.xz;
  rd.yz = tiltM * rd.yz;
  rd.xz = spinM * rd.xz;
  vec3 Lo = normalize(vec3(-0.5, 0.7, 0.55));
  Lo.yz = tiltM * Lo.yz;
  Lo.xz = spinM * Lo.xz;

  // DDA needs nonzero direction components — nudge, keep the sign
  vec3 sgn = vec3(
    rd.x >= 0.0 ? 1.0 : -1.0,
    rd.y >= 0.0 ? 1.0 : -1.0,
    rd.z >= 0.0 ? 1.0 : -1.0
  );
  rd = normalize(sgn * max(abs(rd), vec3(1.0e-4)));

  // analytic bounding sphere: empty pixels exit here, and the march below
  // only ever walks the chord inside the bound
  float b = dot(rd, ro);
  float c = dot(ro, ro) - bound * bound;
  float disc = b * b - c;
  if (disc < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float sq = sqrt(disc);
  vec3 p0 = ro + rd * (-b - sq + ckVs * 0.001);
  float tSpan = 2.0 * sq;

  // Amanatides & Woo init: current voxel, per-axis distance to the next
  // grid plane, per-axis crossing stride
  vec3 vp = floor(p0 / ckVs);
  vec3 tDelta = ckVs / abs(rd);
  vec3 tMax = ((vp + step(vec3(0.0), rd)) * ckVs - p0) / rd;

  float mat = 0.0;
  vec3 mask = vec3(0.0, 0.0, 1.0); // first-voxel fallback: face the viewer
  float tCur = 0.0;

  for (int i = 0; i < STEPS; i++) {
    float m = ckVoxel((vp + 0.5) * ckVs);
    if (m > 0.5) {
      mat = m;
      break;
    }
    // step to the next voxel across the nearest grid plane
    if (tMax.x < tMax.y && tMax.x < tMax.z) {
      tCur = tMax.x;
      tMax.x += tDelta.x;
      vp.x += sgn.x;
      mask = vec3(1.0, 0.0, 0.0);
    } else if (tMax.y < tMax.z) {
      tCur = tMax.y;
      tMax.y += tDelta.y;
      vp.y += sgn.y;
      mask = vec3(0.0, 1.0, 0.0);
    } else {
      tCur = tMax.z;
      tMax.z += tDelta.z;
      vp.z += sgn.z;
      mask = vec3(0.0, 0.0, 1.0);
    }
    if (tCur > tSpan) break; // left the bound: miss
  }

  if (mat < 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // the hit voxel, its radial "up", and the face that was struck
  vec3 cc = (vp + 0.5) * ckVs;
  float r = length(cc);
  vec3 dir = cc / max(r, 1.0e-4);
  vec3 n = -mask * sgn;
  vec3 hp = p0 + rd * tCur;

  // per-voxel hashes: core phase and material variety
  vec2 vseed = vec2(dot(vp, vec3(1.0, 57.0, 113.0)), dot(vp, vec3(27.0, 7.0, 91.0)));
  float h1 = hash(vseed * 0.013);
  float h2 = hash(vseed * 0.029 + 5.7);

  // block-texture grain: a 4x4 hash grid on the struck face
  vec2 uvFace;
  if (mask.x > 0.5) uvFace = hp.yz;
  else if (mask.y > 0.5) uvFace = hp.xz;
  else uvFace = hp.xy;
  float grain = hash(floor(fract(uvFace / ckVs) * 4.0) * 0.37 + vseed * 0.11);
  float texMul = mix(1.0, 0.72 + 0.55 * grain, uP_texture);

  // flat face lambert + radial wrap for roundness + crevice AO
  float lam = clamp(dot(n, Lo), 0.0, 1.0);
  float wrap = clamp(dot(dir, Lo) * 0.5 + 0.5, 0.0, 1.0);
  float ao = 0.55 + 0.45 * clamp(dot(n, dir) * 0.5 + 0.5, 0.0, 1.0);
  float shade = (0.32 + 0.5 * wrap * wrap + 0.85 * lam * lightNow) * ao;

  vec3 col;
  if (mat < 1.5) {
    float f = ckField(dir);
    float h = 1.0 + uP_rough * max(f - ckSeaN, 0.0) * 1.2;
    float depth = h - r;
    float topF = step(depth, ckVs * 1.15);

    /*
      The climate palette. Every material the strata paint with is a
      blend over the four climate weights: snow caps the ice world, the
      mesa runs banded terracotta hashed per RADIAL LAYER (the same band
      wraps the whole planet, the badlands look), desert bleaches the
      land to sand, and lush keeps the tunable colours.
    */
    vec3 snow = vec3(0.92, 0.95, 1.0);
    /*
      Mesa strata: two-block-tall bands hashed per radial layer, weighted
      the way real badlands run — long terracotta stretches broken by
      thin red, white, yellow and dark-brown accent stripes. The same
      band circles the whole planet at its height.
    */
    float layer = hash(vec2(floor(r / (ckVs * 2.0)) * 0.371, 5.3));
    vec3 mesaBand = layer < 0.5 ? vec3(0.74, 0.42, 0.21)
      : (layer < 0.68 ? vec3(0.63, 0.26, 0.15)
      : (layer < 0.8 ? vec3(0.88, 0.79, 0.67)
      : (layer < 0.9 ? vec3(0.84, 0.65, 0.27) : vec3(0.4, 0.25, 0.18))));
    // mesa tops: red-sand flats low down, banded rock on the risen buttes
    vec3 mesaTop = mix(vec3(0.72, 0.38, 0.2), mesaBand, step(1.0 + uP_rough * 0.1, h));
    vec3 climGrass = uC_grass * ckClim.x + uC_sand * ckClim.y
      + snow * ckClim.z + mesaTop * ckClim.w
      + mix(uC_grass, vec3(0.62, 0.85, 0.3), 0.6) * ckCherry; // vivid meadow
    vec3 climDirt = uC_dirt * (ckClim.x + ckClim.y + ckCherry)
      + uC_dirt * vec3(0.75, 0.85, 1.05) * ckClim.z + mesaBand * ckClim.w;
    vec3 climSand = uC_sand * (ckClim.x + ckClim.y + ckCherry)
      + mix(uC_sand, snow, 0.9) * ckClim.z + vec3(0.72, 0.35, 0.2) * ckClim.w;
    vec3 climWater = uC_water * (ckClim.x + ckClim.y + ckCherry)
      + vec3(0.62, 0.82, 0.92) * ckClim.z
      + mix(uC_water, vec3(0.42, 0.3, 0.22), 0.4) * ckClim.w;

    if (topF > 0.5 && f < ckSeaN) {
      // OCEAN: the surface of the perfect sphere painted as water —
      // lighter over coastal shallows, deep blue mid-ocean, with a sun
      // glint and a shimmer on the flow clock. The ice world stills the
      // shimmer and pales the depths: a frozen sheet.
      float deep = clamp((ckSeaN - f) / 0.12, 0.0, 1.0) * (1.0 - 0.55 * ckClim.z);
      vec3 wc = climWater * mix(1.3, 0.55, deep);
      float shim = 0.85 + 0.25 * sin(uAnim * 2.5 + grain * 6.2831 + dir.x * 4.0);
      shim = mix(shim, 1.02, ckClim.z);
      col = wc * (0.45 + 0.55 * wrap) * shim + wc * lam * 0.35;
    } else {
      /*
        LAND. Strata by radial depth below the local surface — grass or
        desert sand on the outward faces of surface blocks, mud with
        hashed stone patches beneath, then ore-seamed stone. Elevation
        overrides the biome: rising ground bares brown hillsides, peaks
        stand as naked stone, and every shore gets a sand band.
      */
      float dirtF = step(depth, ckVs * 2.4);
      float up = clamp(dot(n, dir), 0.0, 1.0);

      vec3 albedo = mix(uC_stone, climDirt, dirtF);
      // stone patches in the exposed mud, below the grass line
      albedo = mix(albedo, uC_stone, dirtF * (1.0 - topF) * step(h2, 0.3));

      float bio = ckBiome(dir);
      float desertF = step(bio, 0.3);
      albedo = mix(albedo, climGrass, topF * step(0.45, up) * (1.0 - desertF));
      albedo = mix(albedo, climSand, desertF * dirtF); // desert sand runs deep
      // elevation bands: brown hillsides, then bare stone peaks — both
      // buried under snow when the ice climate holds (frozen peaks stay
      // white with only crevice shadow, not brown or gray)
      albedo = mix(albedo, climDirt,
        topF * step(1.0 + uP_rough * 0.28, h) * 0.85 * (1.0 - 0.9 * ckClim.z));
      albedo = mix(albedo, uC_stone,
        topF * step(1.0 + uP_rough * 0.45, h) * (1.0 - 0.85 * ckClim.z));
      // beach: a narrow field-space band above the shoreline turns to sand
      albedo = mix(albedo, climSand, topF * step(abs(f - ckSeaN - 0.017), 0.018));

      // the coarse cluster cells serve ore veins AND glacier patches
      vec3 oc = floor(cc / (2.5 * ckVs));
      vec2 oseed = vec2(dot(oc, vec3(1.0, 57.0, 113.0)), dot(oc, vec3(27.0, 7.0, 91.0)));
      float fleck = step(0.5, hash(floor(fract(uvFace / ckVs) * 4.0) * 0.53 + oseed * 0.19));

      // ICE climate: packed-ice blue patches cluster over the risen
      // ground — glacier faces streaking the snowy mountainsides
      float icePatch = ckClim.z * step(hash(oseed * 0.023 + 9.1), 0.5)
        * step(1.0 + uP_rough * 0.06, h);
      albedo = mix(albedo, vec3(0.55, 0.7, 0.92), icePatch * (0.45 + 0.4 * fleck));

      /*
        Ore veins: a coarse cell grid hashes veins into the deep stone, so
        ore comes in multi-block clusters like the cross-section dioramas.
        Each vein rolls a type — diamond (the tunable ore colour), lapis
        (a deep-blue remap of it), or coal (unlit) — and each ore block is
        stone FLECKED with the hue on its texture grain, the way the
        actual ore tile is drawn. Only the flecks glow.
      */
      float veinF = (1.0 - dirtF) * step(1.0 - uP_ore, hash(oseed * 0.017)) * step(h1, 0.8);
      float oreType = hash(oseed * 0.041 + 2.9);
      vec3 oreHue = oreType < 0.4
        ? uC_ore
        : (oreType < 0.75 ? uC_ore * vec3(0.25, 0.45, 1.2) : vec3(0.16));
      float oreLit = oreType < 0.75 ? 1.0 : 0.0;
      albedo = mix(albedo, oreHue, veinF * (0.2 + 0.65 * fleck));
      float twinkle = 0.55 + 0.45 * sin(uP_shuffle + hash(oseed * 0.013) * 37.0); // integrated clock

      // depth below the surface darkens: cave interiors and cleft walls
      // sink into shadow, which makes the glow read as underground
      float depthDim = mix(1.0, 0.62, clamp(depth / max(uP_rough * 0.9, 0.05), 0.0, 1.0));

      // the deeper the rock, the closer to the molten core
      float coreR = 1.0 - uP_rough * 0.6;
      float coreF = uP_core * smoothstep(coreR + 0.15, coreR - 0.05, r);

      vec3 emis = oreHue * veinF * fleck * oreLit * glowNow * twinkle
        + uC_lava * coreF * (0.9 + 0.4 * sin(uP_shuffle * 1.6 + h1 * 51.0))
          * (0.6 + 1.4 * uOutput);

      col = albedo * shade * depthDim + emis;
    }
  } else if (mat < 2.5) {
    // trunk: dark wood, derived from the mud so the palette stays small
    col = uC_dirt * 0.5 * shade;
  } else {
    // leaves: heavier grain reads as foliage clumps. Under the ice climate
    // this material IS the spikes, so it turns packed-ice blue and the
    // grain smooths toward faceted ice.
    vec3 climLeaf = uC_leaf * (ckClim.x + ckClim.y * 0.9)
      + vec3(0.62, 0.76, 0.95) * ckClim.z
      + mix(uC_leaf, vec3(0.45, 0.62, 0.25), 0.5) * ckClim.w // cactus green
      + vec3(0.93, 0.7, 0.82) * ckCherry; // blossom pink
    col = climLeaf * shade;
    float leafGrain = mix(0.5 + 0.9 * grain, 0.85 + 0.3 * grain, ckClim.z);
    texMul = mix(1.0, leafGrain, uP_texture);
  }

  col *= texMul * gainNow;
  col = pow(max(col, 0.0), vec3(uP_contrast));

  // Surface-lit orb bounded by the hit test: alpha IS coverage, and a hit
  // is fully opaque — premultiplied output, trivially (see shdr-28).
  gl_FragColor = vec4(col, 1.0);
}
`;

export const shdr24Orb: OrbVariant = {
  key: "shdr-24",
  label: "SHDR-24",
  note: "a Minecraft Earth — a perfect voxel sphere whose seasons cycle it through lush, cherry-grove, ice, mesa and desert worlds",
  frag: CHUNK_FRAG,
  params: [
    { key: "spin", label: "Spin", min: 0, max: 5, step: 0.03, default: 0.22, integrate: true },
    { key: "tilt", label: "Tilt", min: 0, max: 4, step: 0.02, default: 0.45 },
    { key: "drift", label: "Terrain drift", min: 0, max: 10, step: 0.05, default: 0.12, integrate: true },
    { key: "season", label: "Season rate", min: 0, max: 10, step: 0.05, default: 0.3, integrate: true },
    { key: "shuffle", label: "Ember rate", min: 0, max: 20, step: 0.1, default: 0.8, integrate: true },
    { key: "radius", label: "Radius", min: 0.15, max: 3, step: 0.015, default: 1.15 },
    { key: "blocks", label: "Blocks", min: 16, max: 96, step: 1, default: 64 },
    { key: "rough", label: "Mountains", min: 0, max: 0.8, step: 0.01, default: 0.45 },
    { key: "scale", label: "Terrain scale", min: 0.5, max: 8, step: 0.05, default: 2.4 },
    { key: "sea", label: "Sea level", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "trees", label: "Trees", min: 0, max: 1, step: 0.01, default: 0.75 },
    { key: "cave", label: "Caves", min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: "ore", label: "Ore density", min: 0, max: 0.6, step: 0.01, default: 0.12 },
    { key: "glow", label: "Ore glow", min: 0, max: 5, step: 0.03, default: 0.9 },
    { key: "core", label: "Molten core", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "texture", label: "Texture grain", min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: "light", label: "Key light", min: 0, max: 3, step: 0.015, default: 1 },
    { key: "gain", label: "Gain", min: 0.05, max: 5, step: 0.05, default: 1 },
    { key: "contrast", label: "Contrast", min: 0.15, max: 10, step: 0.05, default: 1 }
  ],
  colors: [
    { key: "grass", label: "Grass", default: "#6abe30" },
    { key: "dirt", label: "Mud", default: "#6f4a2f" },
    { key: "stone", label: "Stone", default: "#8a8a90" },
    { key: "sand", label: "Sand", default: "#dbcf9c" },
    { key: "water", label: "Water", default: "#2f66d0" },
    { key: "leaf", label: "Leaves", default: "#3e8f27" },
    { key: "ore", label: "Ore", default: "#4de3ff" },
    { key: "lava", label: "Lava", default: "#ff7b26" }
  ],
  /*
    Each state animates DIFFERENTLY on the integrated clocks — same palette
    and biomes throughout (no stateColors on purpose):

      idle DRIFTS      lazy spin, terrain barely morphing, embers twinkling
      thinking LOADS   the spin all but stops while the terrain field
                       streams — continents morph and blocks pop in and out
                       like chunks loading — and the ore twinkle races
      speaking ERUPTS  the planet turns fast to answer, the molten core
                       blazes through the caves, ore glow flares
  */
  statePresets: {
    idle: {
      spin: 0.22,
      drift: 0.12,
      season: 0.3,
      shuffle: 0.8,
      glow: 0.9,
      core: 0.5,
      gain: 1,
      light: 1
    },
    // thinking races the seasons as well as the terrain: the planet cycles
    // through its worlds while it considers
    thinking: {
      spin: 0.04,
      drift: 1.7,
      season: 1.8,
      shuffle: 4.5,
      glow: 1.3,
      core: 0.35,
      gain: 0.95,
      light: 0.9
    },
    speaking: {
      spin: 0.85,
      drift: 0.35,
      season: 0.6,
      shuffle: 1.6,
      glow: 1.6,
      core: 1,
      gain: 1.1,
      light: 1.15
    }
  }
};

export type Shdr24Props = Omit<ShaderOrbProps, "variant">;

export function Shdr24({ size = 280, ...rest }: Shdr24Props) {
  return <ShaderOrb variant={shdr24Orb} size={size} {...rest} />;
}

export default Shdr24;
