import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Processed HCAI data is read from disk by server code (src/lib/data). Make
  // sure Vercel bundles it into every server function that might need it.
  outputFileTracingIncludes: {
    "/**": ["./data/processed/**/*.json"],
  },
}

export default nextConfig
