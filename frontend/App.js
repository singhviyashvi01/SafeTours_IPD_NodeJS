import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { SafetyCheckProvider } from './src/context/SafetyCheckContext';
import { ConnectivityProvider } from './src/context/ConnectivityContext';
import { OfflineDataProvider } from './src/context/OfflineDataContext';
import { OutboxProvider } from './src/context/OutboxContext';
import { SosTriggerProvider } from './src/context/SosTriggerContext';
import { SosStatusBanner } from './src/components/SosStatusBanner';
import { NearbyProvider } from './src/context/NearbyContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
    return (
      <SafeAreaProvider>
        <ConnectivityProvider>
          <AuthProvider>
            <OutboxProvider>
              <SosTriggerProvider>
                <OfflineDataProvider>
                  <SafetyCheckProvider>
                    <NearbyProvider>
                      <RootNavigator />
                      <SosStatusBanner />
                      <StatusBar style="auto"/>
                    </NearbyProvider>
                  </SafetyCheckProvider>
                </OfflineDataProvider>
              </SosTriggerProvider>
            </OutboxProvider>
          </AuthProvider>
        </ConnectivityProvider>
      </SafeAreaProvider>
    );
}
