import type { ComponentType } from "react";

import type { OrbVariant, ShaderOrbProps } from "@/orbs/core/orba-core";
import { Shdr11, shdr11Orb } from "@/orbs/orbs/shdr-11";
import { Shdr31, shdr31Orb } from "@/orbs/orbs/shdr-31";
import { Shdr21, shdr21Orb } from "@/orbs/orbs/shdr-21";
import { Shdr02, shdr02Orb } from "@/orbs/orbs/shdr-02";
import { Shdr01, shdr01Orb } from "@/orbs/orbs/shdr-01";
import { Shdr28, shdr28Orb } from "@/orbs/orbs/shdr-28";
import { Shdr22, shdr22Orb } from "@/orbs/orbs/shdr-22";
import { Shdr20, shdr20Orb } from "@/orbs/orbs/shdr-20";
import { Shdr15, shdr15Orb } from "@/orbs/orbs/shdr-15";
import { Shdr14, shdr14Orb } from "@/orbs/orbs/shdr-14";
import { Shdr23, shdr23Orb } from "@/orbs/orbs/shdr-23";
import { Shdr29, shdr29Orb } from "@/orbs/orbs/shdr-29";
import { Shdr13, shdr13Orb } from "@/orbs/orbs/shdr-13";
import { Shdr24, shdr24Orb } from "@/orbs/orbs/shdr-24";
import { Shdr12, shdr12Orb } from "@/orbs/orbs/shdr-12";
import { Shdr17, shdr17Orb } from "@/orbs/orbs/shdr-17";
import { Shdr16, shdr16Orb } from "@/orbs/orbs/shdr-16";
import { Shdr08, shdr08Orb } from "@/orbs/orbs/shdr-08";
import { Shdr26, shdr26Orb } from "@/orbs/orbs/shdr-26";
import { Shdr09, shdr09Orb } from "@/orbs/orbs/shdr-09";
import { Shdr07, shdr07Orb } from "@/orbs/orbs/shdr-07";
import { Shdr06, shdr06Orb } from "@/orbs/orbs/shdr-06";
import { Shdr30, shdr30Orb } from "@/orbs/orbs/shdr-30";
import { Shdr04, shdr04Orb } from "@/orbs/orbs/shdr-04";
import { Shdr18, shdr18Orb } from "@/orbs/orbs/shdr-18";
import { Shdr03, shdr03Orb } from "@/orbs/orbs/shdr-03";
import { Shdr05, shdr05Orb } from "@/orbs/orbs/shdr-05";
import { Shdr19, shdr19Orb } from "@/orbs/orbs/shdr-19";
import { Shdr10, shdr10Orb } from "@/orbs/orbs/shdr-10";
import { Shdr25, shdr25Orb } from "@/orbs/orbs/shdr-25";
import { Shdr32, shdr32Orb } from "@/orbs/orbs/shdr-32";
import { Shdr33, shdr33Orb } from "@/orbs/orbs/shdr-33";
import { Shdr27, shdr27Orb } from "@/orbs/orbs/shdr-27";

export type OrbComponent = ComponentType<Omit<ShaderOrbProps, "variant">>;

/** slug → rendered component, for the gallery and playground. */
export const orbComponentMap: Record<string, OrbComponent> = {
  "shdr-11": Shdr11,
  "shdr-31": Shdr31,
  "shdr-21": Shdr21,
  "shdr-02": Shdr02,
  "shdr-01": Shdr01,
  "shdr-28": Shdr28,
  "shdr-22": Shdr22,
  "shdr-20": Shdr20,
  "shdr-15": Shdr15,
  "shdr-14": Shdr14,
  "shdr-23": Shdr23,
  "shdr-29": Shdr29,
  "shdr-13": Shdr13,
  "shdr-24": Shdr24,
  "shdr-12": Shdr12,
  "shdr-17": Shdr17,
  "shdr-16": Shdr16,
  "shdr-08": Shdr08,
  "shdr-26": Shdr26,
  "shdr-09": Shdr09,
  "shdr-07": Shdr07,
  "shdr-06": Shdr06,
  "shdr-30": Shdr30,
  "shdr-04": Shdr04,
  "shdr-18": Shdr18,
  "shdr-03": Shdr03,
  "shdr-05": Shdr05,
  "shdr-19": Shdr19,
  "shdr-10": Shdr10,
  "shdr-25": Shdr25,
  "shdr-32": Shdr32,
  "shdr-33": Shdr33,
  "shdr-27": Shdr27
};

/**
 * slug → variant definition. The playground builds its controls from the param
 * schema and the docs render it as a table, so adding an orb never means
 * hand-writing sliders or documentation rows.
 */
export const orbVariantMap: Record<string, OrbVariant> = {
  "shdr-11": shdr11Orb,
  "shdr-31": shdr31Orb,
  "shdr-21": shdr21Orb,
  "shdr-02": shdr02Orb,
  "shdr-01": shdr01Orb,
  "shdr-28": shdr28Orb,
  "shdr-22": shdr22Orb,
  "shdr-20": shdr20Orb,
  "shdr-15": shdr15Orb,
  "shdr-14": shdr14Orb,
  "shdr-23": shdr23Orb,
  "shdr-29": shdr29Orb,
  "shdr-13": shdr13Orb,
  "shdr-24": shdr24Orb,
  "shdr-12": shdr12Orb,
  "shdr-17": shdr17Orb,
  "shdr-16": shdr16Orb,
  "shdr-08": shdr08Orb,
  "shdr-26": shdr26Orb,
  "shdr-09": shdr09Orb,
  "shdr-07": shdr07Orb,
  "shdr-06": shdr06Orb,
  "shdr-30": shdr30Orb,
  "shdr-04": shdr04Orb,
  "shdr-18": shdr18Orb,
  "shdr-03": shdr03Orb,
  "shdr-05": shdr05Orb,
  "shdr-19": shdr19Orb,
  "shdr-10": shdr10Orb,
  "shdr-25": shdr25Orb,
  "shdr-32": shdr32Orb,
  "shdr-33": shdr33Orb,
  "shdr-27": shdr27Orb
};
