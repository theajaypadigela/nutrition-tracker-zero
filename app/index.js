/**
 * @format
 */
import { AppRegistry, LogBox } from 'react-native';
import { registerBackgroundEvent } from './src/services/calls/backgroundEvent';
import { name as appName } from './app.json';

// Dev-only toast filters; both messages still reach the console.
// - The reminder logger reports permission gaps (exact alarms, battery optimisation) with
//   console.warn on every launch. They are diagnostics, surfaced properly by Reminder health.
// - NativeWind's runtime registers every React Native core component, including the deprecated
//   SafeAreaView, and RN warns when it is read. The app never renders it.
// - Daily's client logs console.error("Meeting ended due to ejection") whenever the assistant hangs
//   up (a normal end, handled in useVapiCall), and its WebRTC/background-timer modules trigger two
//   RN deprecation warnings. Their toasts land on the call screen's End / Done button.
LogBox.ignoreLogs([
  /^\[reminders\]/,
  'SafeAreaView has been deprecated',
  /^Meeting ended due to ejection/,
  /`new NativeEventEmitter\(\)` was called with a non-null argument/,
  'Deprecated API for given entry type',
]);

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
