/* eslint-env jest */
/* Mocks so the reminder modules (which import Notifee + AsyncStorage at module load)
   can be imported under jest. The enum values mirror @notifee/react-native. */

require('react-native-gesture-handler/jestSetup');

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@notifee/react-native', () => {
  const fn = () => jest.fn();
  return {
    __esModule: true,
    default: {
      createTriggerNotification: fn(),
      cancelTriggerNotification: fn(),
      cancelDisplayedNotification: fn(),
      cancelDisplayedNotifications: fn(),
      cancelNotification: fn(),
      displayNotification: fn(),
      createChannel: fn(),
      deleteChannel: fn(),
      getChannel: fn(),
      getTriggerNotificationIds: jest.fn(() => Promise.resolve([])),
      getNotificationSettings: jest.fn(() =>
        Promise.resolve({ authorizationStatus: 1, android: { alarm: 1 }, ios: {} }),
      ),
      requestPermission: jest.fn(() => Promise.resolve({ authorizationStatus: 1 })),
      isBatteryOptimizationEnabled: jest.fn(() => Promise.resolve(false)),
      getPowerManagerInfo: jest.fn(() => Promise.resolve({ activity: null })),
      setNotificationCategories: fn(),
      onBackgroundEvent: fn(),
      onForegroundEvent: jest.fn(() => () => {}),
      getInitialNotification: jest.fn(() => Promise.resolve(null)),
      openNotificationSettings: fn(),
      openAlarmPermissionSettings: fn(),
      openBatteryOptimizationSettings: fn(),
      openPowerManagerSettings: fn(),
    },
    RepeatFrequency: { NONE: -1, HOURLY: 0, DAILY: 1, WEEKLY: 2 },
    AndroidImportance: { NONE: 0, MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4 },
    AndroidVisibility: { SECRET: -1, PRIVATE: 0, PUBLIC: 1 },
    AndroidCategory: { CALL: 'call' },
    AlarmType: {
      SET: 0,
      SET_AND_ALLOW_WHILE_IDLE: 1,
      SET_EXACT: 2,
      SET_EXACT_AND_ALLOW_WHILE_IDLE: 3,
      SET_ALARM_CLOCK: 4,
    },
    TriggerType: { INTERVAL: 0, TIMESTAMP: 1 },
    AuthorizationStatus: {
      NOT_DETERMINED: -1,
      DENIED: 0,
      AUTHORIZED: 1,
      PROVISIONAL: 2,
    },
    AndroidNotificationSetting: { NOT_SUPPORTED: -1, DISABLED: 0, ENABLED: 1 },
    EventType: {
      UNKNOWN: -1,
      DISMISSED: 0,
      PRESS: 1,
      ACTION_PRESS: 2,
      DELIVERED: 3,
      APP_BLOCKED: 4,
      CHANNEL_BLOCKED: 5,
      CHANNEL_GROUP_BLOCKED: 6,
      TRIGGER_NOTIFICATION_CREATED: 7,
    },
  };
});
