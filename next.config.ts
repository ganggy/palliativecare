import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: ["10.10.20.224", "localhost", "127.0.0.1"],
};

export default nextConfig;
