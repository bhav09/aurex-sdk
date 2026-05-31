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
      { source: "/docs/reference/config-reference", destination: "/docs/reference/config", permanent: true },
      { source: "/docs/reference/budget-guard-config", destination: "/docs/reference/budget-guard", permanent: true },
      { source: "/docs/reference/provider-matrix", destination: "/docs/reference/providers", permanent: true },
      { source: "/docs/reference/context-wrappers", destination: "/docs/reference/wrap", permanent: true },
      { source: "/docs/reference/health-monitoring", destination: "/docs/reference/health", permanent: true },
      { source: "/docs/deployment/readonly-fs", destination: "/docs/deployment/filesystem", permanent: true },
      { source: "/docs/deployment/network-resilience", destination: "/docs/deployment/cloud-sync", permanent: true },
    ];
  },
  serverExternalPackages: [
    "@mlc-ai/web-llm"
  ],
  turbopack: {},
  webpack: (config) => {
    return config;
  },
}

export default nextConfig
