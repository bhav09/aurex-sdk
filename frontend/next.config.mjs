import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: "/docs/installation/env-vars", destination: "/docs/reference", permanent: true },
      { source: "/docs/harness/:path*", destination: "/docs/installation", permanent: true },
      { source: "/docs/deployment/:path*", destination: "/docs/reference", permanent: true },
      { source: "/docs/reliability/:path*", destination: "/docs/stage-3-outcomes", permanent: true },
      { source: "/docs/reference/autohook", destination: "/docs/installation", permanent: true },
      { source: "/docs/reference/integration", destination: "/docs/installation", permanent: true },
      { source: "/docs/reference/guards", destination: "/docs/stage-2-breaker", permanent: true },
      { source: "/docs/reference/budget-guard", destination: "/docs/stage-2-breaker", permanent: true },
      { source: "/docs/reference/outcomes", destination: "/docs/stage-3-outcomes", permanent: true },
      { source: "/docs/reference/ci", destination: "/docs/stage-3-outcomes", permanent: true },
      { source: "/docs/reference/:slug", destination: "/docs/reference", permanent: true },
    ];
  },
  serverExternalPackages: ["@mlc-ai/web-llm"],
  turbopack: {
    root: path.resolve(import.meta.dirname, ".."),
  },
  webpack: (config) => {
    return config;
  },
};

export default nextConfig;
