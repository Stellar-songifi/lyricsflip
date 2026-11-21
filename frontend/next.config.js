const createNextIntlPlugin = require('next-intl/plugin');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
const testnetDeployment = require('../deployments/testnet.json');

// Build-time check: fail next build in production mode when contract IDs are empty
if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-development-server'
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
  // LF-325: @stellar/stellar-sdk v17 ships its own browser-compatible
  // bundle and no longer needs Node polyfills. Keeping them added ~40 kB
  // to the initial JS. The fallback entries below tell webpack to ignore
  // any residual `require('buffer')` / `require('crypto')` / `require('stream')`
  // calls so the build still succeeds if any transitive dependency references
  // them without bundling the full polyfill.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        buffer: false,
        crypto: false,
        stream: false,
      };
    }

    return config;
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

module.exports = withBundleAnalyzer(withNextIntl(nextConfig));
