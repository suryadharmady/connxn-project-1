// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Force Metro to resolve the CJS ("main") entry for jotai instead of the ESM
// ("module") entry. The ESM build uses `import.meta.env` which Metro cannot
// process in the default pipeline and throws:
//   SyntaxError: Cannot use 'import.meta' outside a module
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// Include .mjs in source extensions so Metro can resolve ESM-only packages
// that ship as .mjs files (prevents "import.meta outside a module" errors)
config.resolver.sourceExts = [
  ...new Set([...(config.resolver.sourceExts || []), 'mjs']),
];

module.exports = config;
