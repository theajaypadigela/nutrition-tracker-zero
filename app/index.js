/**
 * @format
 */
import { AppRegistry } from 'react-native';
import { registerBackgroundEvent } from './src/services/calls/backgroundEvent';
import { name as appName } from './app.json';

// Register the Notifee headless handler FIRST, before any import that could fail, so a ring
// trigger always reaches the native call surface even if the UI bundle breaks.
registerBackgroundEvent();

let App;
try {
  require('react-native-gesture-handler');
  require('./global.css');
  App = require('./src/App').default;
} catch (error) {
  console.error('[bootstrap] Failed to load app entry', error);
  const React = require('react');
  const { Text, View } = require('react-native');
  App = () =>
    React.createElement(
      View,
      { style: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 } },
      React.createElement(Text, null, 'App failed to start: ' + String(error && error.message)),
    );
}

AppRegistry.registerComponent(appName, () => App);
