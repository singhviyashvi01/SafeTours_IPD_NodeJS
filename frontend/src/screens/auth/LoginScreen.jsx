import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { colors, spacing } from '../../theme/theme';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
const loginSchema = z.object({
    email: z.string().min(1, 'Email is required'),
    password: z.string().min(1, 'Password is required'),
});
export const LoginScreen = () => {
    const navigation = useNavigation();
    const { login, isLoading } = useAuth();
    const { control, handleSubmit, formState: { errors } } = useForm({
        resolver: zodResolver(loginSchema),
    });
    const onSubmit = async (data) => {
        try {
            await login(data.email, data.password);
        }
        catch (e) {
            console.error(e);
            // Show toast or alert
        }
    };
    return (<Screen style={styles.container}>
      <View style={styles.header}>
        <Text variant="headlineLg" style={styles.title}>Welcome Back</Text>
        <Text variant="bodyMd" color={colors.textSecondary}>Sign in to continue</Text>
      </View>
      
      <View style={styles.form}>
        <Input control={control} name="email" label="Email Address" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none"/>
        <Input control={control} name="password" label="Password" placeholder="••••••••" secureTextEntry/>
      </View>

      <View style={styles.footer}>
        <Button title="Log In" onPress={handleSubmit(onSubmit)} isLoading={isLoading}/>
        <View style={styles.signupContainer}>
          <Text variant="bodyMd" color={colors.textSecondary}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
            <Text variant="labelLg" color={colors.primary}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Screen>);
};
const styles = StyleSheet.create({
    container: {
        padding: spacing.containerMargin,
    },
    header: {
        marginTop: spacing.xl,
        marginBottom: spacing.xxl,
    },
    title: {
        marginBottom: spacing.xs,
    },
    form: {
        flex: 1,
    },
    footer: {
        paddingBottom: spacing.lg,
    },
    signupContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: spacing.lg,
    }
});
