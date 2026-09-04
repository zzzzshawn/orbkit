import Link from "next/link";

import { HomeMatrixIcon } from "@/components/matrix-icons";

export function HomeLink() {
  return (
    <Link
      href="/"
      aria-label="Home"
      className="inline-flex w-max items-center justify-center rounded-xl bg-preset p-2 text-fg-dim transition-colors duration-150 ease-out hover:text-link-hover focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
    >
      <HomeMatrixIcon className="size-4 sm:size-5" />
    </Link>
  );
}
