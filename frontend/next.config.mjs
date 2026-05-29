/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
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
