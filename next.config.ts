import type { NextConfig } from "next";
import { readFileSync } from "fs";
import path from "path";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve('.'),
  serverExternalPackages: ['pg', 'ffmpeg-static'],
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  turbopack: {
    root: path.resolve('.'),
  },
};

export default nextConfig;
