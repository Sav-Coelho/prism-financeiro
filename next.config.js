/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ['@prisma/client', 'prisma', 'pdf-parse'] },
  webpack: (config) => {
    // pdf-parse tries to require 'canvas' in test utils — alias to false to prevent error
    config.resolve.alias = { ...config.resolve.alias, canvas: false }
    return config
  },
}
module.exports = nextConfig
