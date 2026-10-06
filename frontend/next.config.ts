import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Google profile pictures in the dashboard header
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
};

export default nextConfig;
