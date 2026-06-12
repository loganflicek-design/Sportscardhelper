/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**.ebayimg.com" }] },
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
};

export default nextConfig;
