import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The floating dev badge sits on top of the navigation and pollutes `npm run shots`.
  devIndicators: false,
}

export default nextConfig
