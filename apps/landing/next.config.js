const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // In the monorepo, pnpm hoists the API's React 18 / Next 14 to the root
      // node_modules. Force the client bundle to use this package's own deps.
      const localNodeModules = path.resolve(__dirname, 'node_modules');
      config.resolve.alias = {
        ...config.resolve.alias,
        react: path.resolve(localNodeModules, 'react'),
        'react-dom': path.resolve(localNodeModules, 'react-dom'),
        'react/jsx-runtime': path.resolve(localNodeModules, 'react/jsx-runtime'),
        'react/jsx-dev-runtime': path.resolve(localNodeModules, 'react/jsx-dev-runtime'),
      };
    }
    return config;
  },
};
module.exports = nextConfig;
