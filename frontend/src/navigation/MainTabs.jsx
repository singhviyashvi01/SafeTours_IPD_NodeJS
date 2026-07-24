import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/main/HomeScreen';
import { SafetyMapScreen } from '../screens/main/SafetyMapScreen';
import { SOSScreen } from '../screens/main/SOSScreen';
import { AISafetyAssistantScreen } from '../screens/main/AISafetyAssistantScreen';
import { SettingsScreen } from '../screens/main/SettingsScreen';
import { colors } from '../theme/theme';

const Tab = createBottomTabNavigator();

export const MainTabs = () => {
    return (
        <Tab.Navigator screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: {
                // Keep the existing tab routes and navigation state, but remove
                // their visual bar now that Home provides the sidebar UI.
                display: 'none',
            },
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors['on-surface-variant'],
            tabBarIcon: ({ color, size, focused }) => {
                let iconName = 'home';
                if (route.name === 'Home') iconName = 'home';
                else if (route.name === 'Map') iconName = 'map';
                else if (route.name === 'SOS') iconName = 'warning';
                else if (route.name === 'Assistant') iconName = 'headset';
                else if (route.name === 'Settings') iconName = 'settings';

                return <Ionicons name={iconName} size={24} color={color} />;
            },
            tabBarLabelStyle: {
                fontSize: 12,
                marginTop: 4,
            },
        })}>
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Map" component={SafetyMapScreen} />
            <Tab.Screen 
                name="SOS" 
                component={SOSScreen} 
                options={{
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="warning" size={24} color={colors.error} />
                    ),
                    tabBarActiveTintColor: colors.error,
                }}
            />
            <Tab.Screen name="Assistant" component={AISafetyAssistantScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
    );
};
