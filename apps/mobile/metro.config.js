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

module.exports = config;
