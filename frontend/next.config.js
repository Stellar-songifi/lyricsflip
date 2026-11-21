const webpack = require('webpack');
const createNextIntlPlugin = require('next-intl/plugin');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
const testnetDeployment = require('../deployments/testnet.json');

// Build-time check: fail next build in production mode when contract IDs are empty.
// Skip when SKIP_CONTRACT_ID_CHECK=true to allow Docker image builds that receive
// contract IDs at run time (the contracts-init service writes them to a shared
// volume that is sourced by docker-entrypoint.sh before the Node process starts).
if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-development-server' &&
  process.env.SKIP_CONTRACT_ID_CHECK !== 'true'
) {
  const gameContractId =
    process.env.NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID || testnetDeployment.lyricsflip;
  const nftContractId =
    process.env.NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID || testnetDeployment.lyricsflipNft;

  if (!gameContractId || !nftContractId) {
    throw new Error(
      'Production build failed: NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID and NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID must be set in production mode.',
    );
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable standalone output so the Docker image only ships the minimal
  // server bundle (no node_modules copy, no full .next directory).
  // See: https://nextjs.org/docs/pages/api-reference/next-config-js/output
  output: 'standalone',
  // LF-204: the page moved from the doubled path to /notifications.
  async redirects() {
    return [
      {
        source: '/notifications/notifications',
        destination: '/notifications',
        permanent: true,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        buffer: require.resolve('buffer/'),
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
      };

      config.plugins = config.plugins ?? [];
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
        }),
      );
    }

    return config;
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

module.exports = withBundleAnalyzer(withNextIntl(nextConfig));
