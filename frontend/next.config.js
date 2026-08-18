/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Preserve REACT_APP_BACKEND_URL naming for API client compatibility.
  env: {
    REACT_APP_BACKEND_URL: process.env.REACT_APP_BACKEND_URL,
  },
  // Silence source-map warnings in dev overlay for third-party libs.
  productionBrowserSourceMaps: false,
  // Skip build-time type/lint checks so we don't block dev on legacy files.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Enable webpack polling for our container FS.
  webpack: (config) => {
    config.watchOptions = { poll: 1000, aggregateTimeout: 300, ignored: /node_modules/ };
    return config;
  },
};
module.exports = nextConfig;
