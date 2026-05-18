import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['express', '@agorio/sdk'],
  // PostHog reverse proxy — avoids ad-blocker interference and keeps
  // analytics traffic on the agorio.dev origin. EU cloud.
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      },
    ];
  },
  // Required for PostHog ingestion endpoints that use trailing slashes.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
