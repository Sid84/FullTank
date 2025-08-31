// metro.config.js — Expo SDK 51 + Monorepo, force single React
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;                 // ...\FullTank\mobile
const workspaceRoot = path.resolve(projectRoot, '..'); // ...\FullTank

const config = getDefaultConfig(projectRoot);

// Watch the monorepo (so shared code rebuilds)
config.watchFolders = [workspaceRoot];

// CRITICAL: resolve modules ONLY from Mobile's node_modules.
// This prevents Metro from pulling a second React from the root.
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];

// Explicitly pin these to Mobile's copies.
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  'react-native-web': path.resolve(projectRoot, 'node_modules/react-native-web'),
};

module.exports = config;
