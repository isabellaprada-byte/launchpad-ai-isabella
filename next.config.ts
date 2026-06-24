import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['exceljs', 'pdf-parse', 'canvas', '@napi-rs/canvas'],
};

export default nextConfig;
