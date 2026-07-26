import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Toast } from '../../components/Toast';
import { colors, spacing } from '../../theme/theme';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';

const signupSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const SignupScreen = () => {
  const navigation = useNavigation();
  const { signup, isLoading } = useAuth();
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { control, handleSubmit, setError } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = async data => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await signup(data.username.trim(), data.email.trim(), data.password);
    } catch (err) {
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        Object.entries(err.fieldErrors).forEach(([field, msg]) => {
          if (field === 'username' || field === 'email' || field === 'password') {
            setError(field, { type: 'server', message: msg });
          }
        });
      }
      setErrorMessage(err.message || 'Signup failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = isSubmitting || isLoading;

  return (
    <Screen style={styles.screen}>
      <Toast message={errorMessage} type="error" onDismiss={() => setErrorMessage(null)} />
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text variant="headlineLg" style={styles.title}>Create Account</Text>
            <Text variant="bodyMd" color={colors.textSecondary}>Join SafeTours today for a safer travel experience</Text>
          </View>
          
          <View style={styles.form}>
            <Input
              control={control}
              name="username"
              label="Username"
              placeholder="johndoe"
              autoCapitalize="none"
              editable={!isBusy}
            />
            <Input
              control={control}
              name="email"
              label="Email Address"
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!isBusy}
            />
            <Input
              control={control}
              name="password"
              label="Password"
              placeholder="••••••••"
              secureTextEntry
              editable={!isBusy}
            />
          </View>

          <View style={styles.footer}>
            <Button
              title="Sign Up"
              onPress={handleSubmit(onSubmit)}
              isLoading={isBusy}
              disabled={isBusy}
            />
            <View style={styles.loginContainer}>
              <Text variant="bodyMd" color={colors.textSecondary}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={isBusy}>
                <Text variant="labelLg" color={colors.primary}>Log In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.containerMargin,
    justifyContent: 'space-between',
  },
  header: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  title: {
    marginBottom: spacing.xs,
  },
  form: {
    flex: 1,
  },
  footer: {
    paddingBottom: spacing.lg,
    marginTop: spacing.lg,
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
});
