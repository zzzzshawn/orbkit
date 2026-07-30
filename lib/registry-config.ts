export interface OrbRegistryEntry {
  slug: string;
  title: string;
  description: string;
  componentName: string;
  fileName: string;
  /** npm packages the installed component needs. Orbs are dependency-free. */
  dependencies: string[];
}

export const orbRegistry: OrbRegistryEntry[] = [
  {
    slug: "orb-hydrogen",
    title: "Hydrogen",
    description:
      "A quantum-orbital orb: |psi|^2 of a hydrogen-like wave function projected onto a rotating dome, shaded with rainbow chromatic bands over dark metal. Precession and a drifting flow field keep the pattern from ever visibly looping.",
    componentName: "OrbHydrogen",
    fileName: "orb-hydrogen.tsx",
    dependencies: []
  },
  {
    slug: "orb-corona",
    title: "Corona",
    description:
      "A raymarched SDF shell with volumetric godrays: the space between a sine-warped sphere and a plain one, lit only by light accumulated along each ray as it passes through the hollow.",
    componentName: "OrbCorona",
    fileName: "orb-corona.tsx",
    dependencies: []
  },
  {
    slug: "orb-nimbus",
    title: "Nimbus",
    description:
      "Light diffusing through a cloud: a true volumetric march with Beer-Lambert transmittance, a second march toward the light for self-shadowing, and a Henyey-Greenstein phase function that blooms the lit limb.",
    componentName: "OrbNimbus",
    fileName: "orb-nimbus.tsx",
    dependencies: []
  },
  {
    slug: "orb-rocaille",
    title: "Rocaille",
    description:
      "Ornate scrollwork wrapped onto a sphere: ten colour layers, each folded by a nine-step feedback warp, sampled through a stereographic projection of the orb's dome so the filigree compresses toward the rim.",
    componentName: "OrbRocaille",
    fileName: "orb-rocaille.tsx",
    dependencies: []
  },
  {
    slug: "orb-quasar",
    title: "Quasar",
    description:
      "A Rodrigues-swept core seen through frosted, dispersive glass: an analytic ray/sphere intersection gives an exact normal, jittered for frost and refracted at three indices, so the caustics inside split into rainbow fringes.",
    componentName: "OrbQuasar",
    fileName: "orb-quasar.tsx",
    dependencies: []
  }
];

export function getOrbBySlug(slug: string): OrbRegistryEntry | undefined {
  return orbRegistry.find((entry) => entry.slug === slug);
}
