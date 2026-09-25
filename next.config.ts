import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Processed HCAI data is read from disk by server code (src/lib/data). Make
  // sure Vercel bundles it into every server function that might need it.
  // Correlate moved under Build (V6.9); old links and bookmarks keep working, query and all.
  async redirects() {
    return [{ source: "/correlate", destination: "/build/correlate", permanent: true }]
  },
  outputFileTracingIncludes: {
    "/**": ["./data/processed/**/*.json"],
  },
}

export default nextConfig
