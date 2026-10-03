import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { SafetyCheckProvider } from './src/context/SafetyCheckContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
    return (
      <SafeAreaProvider>
        <AuthProvider>
          <SafetyCheckProvider>
            <RootNavigator />
            <StatusBar style="auto"/>
          </SafetyCheckProvider>
        </AuthProvider>
      </SafeAreaProvider>
    );
}
