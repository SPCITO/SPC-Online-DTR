import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serve the app under a sub-path when deployed behind a path-based
  // reverse proxy (e.g. https://spc.gschools.net/dtr). Set at build time
  // via NEXT_PUBLIC_BASE_PATH — empty string keeps root-path deploys.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  images: {
    remotePatterns: [],
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
