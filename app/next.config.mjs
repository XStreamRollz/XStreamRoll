/** @type {import('next').NextConfig} */
import withBundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzerConfig = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig = {
  output: "standalone",

  images: {
    unoptimized: true,
  },
}

export default withBundleAnalyzerConfig(nextConfig)
