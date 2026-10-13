const path = require('node:path');
const { getDefaultConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// The Worker's source runs inside the app (src/embedded/runtime.ts), so Metro has to watch and bundle it. It has no dependencies of
// its own; what Babel adds to it (helpers) is resolved from this app's node_modules.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../worker/src')];
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
};

module.exports = withNativeWind(config, { input: './global.css' });
