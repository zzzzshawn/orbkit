import type { ComponentType } from "react";

import type { OrbVariant, ShaderOrbProps } from "@/orbs/core/orba-core";
import { OrbHydrogen, hydrogenOrb } from "@/orbs/orbs/orb-hydrogen";
import { OrbCorona, coronaOrb } from "@/orbs/orbs/orb-corona";
import { OrbNimbus, nimbusOrb } from "@/orbs/orbs/orb-nimbus";
import { OrbRocaille, rocailleOrb } from "@/orbs/orbs/orb-rocaille";
import { OrbQuasar, quasarOrb } from "@/orbs/orbs/orb-quasar";

export type OrbComponent = ComponentType<Omit<ShaderOrbProps, "variant">>;

/** slug → rendered component, for the gallery and playground. */
export const orbComponentMap: Record<string, OrbComponent> = {
  "orb-hydrogen": OrbHydrogen,
  "orb-corona": OrbCorona,
  "orb-nimbus": OrbNimbus,
  "orb-rocaille": OrbRocaille,
  "orb-quasar": OrbQuasar
};

/**
 * slug → variant definition. The playground builds its controls from the param
 * schema and the docs render it as a table, so adding an orb never means
 * hand-writing sliders or documentation rows.
 */
export const orbVariantMap: Record<string, OrbVariant> = {
  "orb-hydrogen": hydrogenOrb,
  "orb-corona": coronaOrb,
  "orb-nimbus": nimbusOrb,
  "orb-rocaille": rocailleOrb,
  "orb-quasar": quasarOrb
};
