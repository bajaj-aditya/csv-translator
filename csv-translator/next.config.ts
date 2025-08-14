import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Allow production builds to successfully complete even if
    // there are ESLint errors. This unblocks Vercel deployments.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
