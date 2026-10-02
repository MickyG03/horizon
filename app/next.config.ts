import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the dev overlay out of the sidebar footer, where the theme switch lives.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
