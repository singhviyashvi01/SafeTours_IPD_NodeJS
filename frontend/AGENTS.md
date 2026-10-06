# Expo SDK 54

This app uses **Expo SDK 54** (`expo ~54.0.x`, React Native 0.81). Use the docs for THAT version, not the latest:

https://docs.expo.dev/versions/v54.0.0/

- Install native modules with `npx expo install <package>` so versions match SDK 54.
- `expo-notifications` remote push and `expo-task-manager` / background location do not work in Expo Go: use an EAS development build.
- Notification handler fields in SDK 54: `shouldShowBanner`, `shouldShowList` (not `shouldShowAlert`).
