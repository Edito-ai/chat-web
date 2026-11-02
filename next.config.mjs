/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The dev-only "N" badge sits on top of the sidebar's profile avatar.
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || '.next',
}
export default nextConfig
