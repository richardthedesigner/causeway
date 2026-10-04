/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the router runs on the device (offline-capable), so no server is needed.
  output: "export",
  // ARTIFACT=1 builds with relative asset paths so the export can be served from any folder (the private preview page).
  ...(process.env.ARTIFACT ? { assetPrefix: "." } : {}),
  images: { unoptimized: true },
  transpilePackages: ["@causeway/graph", "@causeway/profile", "@causeway/router", "@causeway/live"],
  webpack(config) {
    // Workspace packages are TypeScript written with NodeNext-style ".js" import specifiers.
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};
export default nextConfig;
