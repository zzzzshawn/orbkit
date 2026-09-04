import Link from "next/link";

import { OrbMark } from "@/components/orb-mark";

import { CREATOR_URL, REGISTRY_NAMESPACE } from "@/lib/site-config";

const REPO_URL = "https://github.com/zzzzshawn/orbkit";
const SPONSOR_URL = "https://github.com/sponsors/zzzzshawn";
const VERSION = "v0.1.0";

const footerActionClass =
  "text-fg-dim md:text-lg tracking-wide outline-offset-2 transition-[color,transform] duration-200 ease-out hover:text-link-hover focus-visible:text-link-hover motion-reduce:transition-colors";

export function SiteFooter() {
  return (
    <footer
      role="contentinfo"
      className="relative mx-auto w-full max-w-[1350px] rounded-3xl  flex items-center justify-center gap-"
    >
      <span
        className="pointer-events-none  flex  items-center justify-center "
        aria-hidden="true"
      >
        <OrbMark size={340} className="text-foreground max-md:scale-[0.8]" />
      </span>

      <div className="text-[404px] font-medium tracking-[-0.08em] leading-[0.72] text-transparent text-shadow-[1px_10px_22px_#161616,0_0_10px_#ffffff30,0_2px_0px_#c0c0c0,0_0px_0px_#707070] light:text-shadow-[1px_10px_25px_#161616,0_0_10px_#ffffffa0,0_0px_0.5px_#000] -ml-9">RBA</div>



    </footer>
  );
}
