import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image.
  output: "standalone",
  // Keep the dev overlay out of the sidebar footer, where the theme switch lives.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
