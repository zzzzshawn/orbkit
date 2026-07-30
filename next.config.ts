import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    // `lib/source.ts` reads orb sources off disk at request time so the docs
    // pages always show exactly what the registry ships.
    "/**": ["./orbs/**/*"]
  }
};

export default nextConfig;
