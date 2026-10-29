import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navigate(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}

const TABS = ['Home', 'Map', 'SOS', 'Assistant', 'Settings'];

/** Navigate by name from outside the navigators: tab screens live inside the 'Tabs' stack screen. */
export function navigateTo(name, params) {
  if (!navigationRef.isReady()) return;
  if (TABS.includes(name)) navigationRef.navigate('Tabs', { screen: name, params });
  else navigationRef.navigate(name, params);
}

export function getCurrentRouteName() {
  if (navigationRef.isReady()) {
    return navigationRef.getCurrentRoute()?.name || 'Home';
  }
  return 'Home';
}
