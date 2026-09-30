import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Processed HCAI data is read from disk by server code (src/lib/data). Make
  // sure Vercel bundles it into every server function that might need it.
  // Old links and bookmarks keep working, query and all (Next carries the query string over; the browser keeps any
  // #fragment). Correlate moved under Build in V6.9; V7.2 renamed the tabs, so each old path points at its new one,
  // including sub-pages (/build/correlate → /reports/correlate). Ask and Watch, not built yet, share one "What's next" page.
  async redirects() {
    const renamed: [string, string][] = [
      ["/benchmark", "/compare"],
      ["/build", "/reports"],
      ["/propose", "/business-cases"],
      ["/deadlines", "/filing-calendar"],
      ["/translate", "/data-definitions"],
      ["/briefing", "/briefings"],
    ]
    return [
      { source: "/correlate", destination: "/reports/correlate", permanent: true },
      // The report builder is /reports/build (V7.2); send its older addresses there in one hop, ahead of the general rules.
      { source: "/build/report", destination: "/reports/build", permanent: true },
      { source: "/reports/report", destination: "/reports/build", permanent: true },
      ...renamed.flatMap(([from, to]) => [
        { source: from, destination: to, permanent: true },
        { source: `${from}/:path*`, destination: `${to}/:path*`, permanent: true },
      ]),
      { source: "/ask", destination: "/whats-next", permanent: false },
      { source: "/watch", destination: "/whats-next", permanent: false },
    ]
  },
  // Private uploads (V7.6.5d) post files of up to 4 MB to a server action; the default limit is 1 MB. 4.5 MB is
  // Vercel's own request limit, so this is as high as a deployment accepts anyway.
  experimental: {
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  outputFileTracingIncludes: {
    "/**": ["./data/processed/**/*.json"],
  },
}

export default nextConfig
