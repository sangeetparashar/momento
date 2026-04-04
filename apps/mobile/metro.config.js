const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the monorepo packages directory so changes in shared are picked up
config.watchFolders = [monorepoRoot];

// Ensure Metro resolves modules from both the app and monorepo node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Prevent duplicate React instances by resolving from the app's node_modules
config.resolver.disableHierarchicalLookup = true;

// Enable package exports so jose/privy resolve to browser builds (not Node builds)
config.resolver.unstable_enablePackageExports = true;

// Condition priority: react-native > browser > import > require
// 'browser' MUST come before 'import' so jose resolves to dist/browser (Web Crypto)
// instead of dist/node/esm (Node crypto)
config.resolver.unstable_conditionNames = [
  'react-native',
  'browser',
  'import',
  'require',
];
// Also set condition order for the default platform
config.resolver.unstable_conditionsByPlatform = {
  android: ['react-native', 'browser', 'import', 'require'],
  ios: ['react-native', 'browser', 'import', 'require'],
};

// Force jose to resolve to its browser build (Web Crypto API)
// Metro's condition resolution sometimes still picks the Node ESM build,
// so we intercept and redirect explicitly.
const joseBrowserDir = path.resolve(monorepoRoot, 'node_modules/jose/dist/browser');
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Redirect jose's main entry to browser build
  if (moduleName === 'jose') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(joseBrowserDir, 'index.js'),
    };
  }
  // Redirect any deep imports from jose/dist/node/* to jose/dist/browser/*
  if (moduleName.startsWith('jose/dist/node/')) {
    const relativePath = moduleName.replace(/^jose\/dist\/node\/(esm|cjs)\//, '');
    const browserPath = path.resolve(joseBrowserDir, relativePath);
    return {
      type: 'sourceFile',
      filePath: browserPath,
    };
  }
  // Resolve @privy-io/expo sub-path exports (e.g. @privy-io/expo/ui)
  // Metro's package exports resolution breaks when a custom resolveRequest is set,
  // so we resolve these sub-paths explicitly. Use CJS build (not ESM) because
  // Metro resolves chunk imports relative to the requiring file's context.
  const privyExpoMatch = moduleName.match(/^@privy-io\/expo\/(.+)$/);
  if (privyExpoMatch) {
    const subpath = privyExpoMatch[1];
    const privyExpoDist = path.resolve(
      monorepoRoot,
      'node_modules/@privy-io/expo/dist',
    );
    return {
      type: 'sourceFile',
      filePath: path.resolve(privyExpoDist, `${subpath}.js`),
    };
  }
  // Ensure @solana-mobile packages resolve to their react-native builds
  // (not the browser builds which require a secure HTTPS context).
  if (moduleName === '@solana-mobile/mobile-wallet-adapter-protocol') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(
        monorepoRoot,
        'node_modules/@solana-mobile/mobile-wallet-adapter-protocol/lib/cjs/index.native.js',
      ),
    };
  }
  if (moduleName === '@solana-mobile/mobile-wallet-adapter-protocol-web3js') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(
        monorepoRoot,
        'node_modules/@solana-mobile/mobile-wallet-adapter-protocol-web3js/lib/cjs/index.native.js',
      ),
    };
  }
  // Default resolution
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
