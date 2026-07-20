import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { colors, spacing } from '../../theme/theme';
import { useNavigation } from '@react-navigation/native';
import { authService } from '../../services/auth';
const forgotPasswordSchema = z.object({
    email: z.string().email('Invalid email address'),
});
export const ForgotPasswordScreen = () => {
    const navigation = useNavigation();
    const [isLoading, setIsLoading] = React.useState(false);
    const [isSent, setIsSent] = React.useState(false);
    const { control, handleSubmit } = useForm({
        resolver: zodResolver(forgotPasswordSchema),
    });
    const onSubmit = async (data) => {
        setIsLoading(true);
        try {
            await authService.forgotPassword(data.email);
            setIsSent(true);
        }
        catch (e) {
            console.error(e);
        }
        finally {
            setIsLoading(false);
        }
    };
    if (isSent) {
        return (<Screen style={styles.container}>
        <View style={styles.header}>
          <Text variant="headlineLg" style={styles.title}>Email Sent</Text>
          <Text variant="bodyMd" color={colors.textSecondary}>
            Check your email for instructions to reset your password.
          </Text>
        </View>
        <View style={styles.footer}>
          <Button title="Back to Login" onPress={() => navigation.navigate('Login')}/>
        </View>
      </Screen>);
    }
    return (<Screen style={styles.container}>
      <View style={styles.header}>
        <Text variant="headlineLg" style={styles.title}>Reset Password</Text>
        <Text variant="bodyMd" color={colors.textSecondary}>
          Enter your email address to reset your password.
        </Text>
      </View>
      
      <View style={styles.form}>
        <Input control={control} name="email" label="Email Address" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none"/>
      </View>

      <View style={styles.footer}>
        <Button title="Send Reset Link" onPress={handleSubmit(onSubmit)} isLoading={isLoading} style={styles.button}/>
        <Button title="Back to Login" variant="secondary" onPress={() => navigation.navigate('Login')}/>
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
    button: {
        marginBottom: spacing.md,
    },
});
