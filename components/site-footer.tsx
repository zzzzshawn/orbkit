import { OrbMark } from "@/components/orb-mark";

export function SiteFooter() {
  return (
    <footer
      role="contentinfo"
      className="relative mx-auto w-full max-w-[1350px] rounded-3xl  flex items-center justify-center gap-"
    >
      {/*
        The mark's size prop sets its box and canvas inline, so below lg it is
        scaled to fill a smaller box instead: 85px keeps the same ratio to the
        100px wordmark that 274px has to the 324px one.
      */}
      <span
        className="pointer-events-none flex size-[85px] shrink-0 items-center justify-center lg:size-[274px]"
        aria-hidden="true"
      >
        <OrbMark size={274} className="text-foreground max-lg:scale-[0.31]" />
      </span>

      <div className="text-[100px] lg:text-[324px] font-medium tracking-[-0.08em] leading-[0.72] text-transparent text-shadow-[1px_10px_22px_#161616,0_0_10px_#ffffff30,0_2px_0px_#c0c0c0,0_0px_0px_#707070] light:text-shadow-[1px_10px_25px_#161616,0_0_10px_#ffffffa0,0_0px_0.5px_#000] -ml-2.5 lg:-ml-8.5">RBKIT</div>



    </footer>
  );
}
