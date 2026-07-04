import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthNavigator } from './AuthNavigator';
import { MainTabs } from './MainTabs';
import { NotificationsScreen } from '../screens/main/NotificationsScreen';
import { EmergencyServicesScreen } from '../screens/main/EmergencyServicesScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { useAuth } from '../context/AuthContext';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/theme';

const Stack = createNativeStackNavigator();

const MainNavigator = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={MainTabs} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="EmergencyServices" component={EmergencyServicesScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
);

export const RootNavigator = () => {
    const { user, isLoading } = useAuth();
    console.log("RootNavigator rendering, user =", user, "isLoading =", isLoading);
    
    // If there's an initial auth check loading state, we would handle it here.
    return (
        <NavigationContainer>
            {user ? <MainNavigator /> : <AuthNavigator />}
        </NavigationContainer>
    );
};

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    }
});
