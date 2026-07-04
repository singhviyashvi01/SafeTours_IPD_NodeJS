import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
export default function App() {
    console.log("App component rendering");
    return (<AuthProvider>
      <RootNavigator />
      <StatusBar style="auto"/>
    </AuthProvider>);
}
