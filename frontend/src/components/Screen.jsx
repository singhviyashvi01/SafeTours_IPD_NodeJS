import React, { memo } from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { colors } from '../theme/theme';

export const Screen = memo(({ children, style, isSafe = true, backgroundColor = colors.background, ...props }) => {
    const Container = isSafe ? SafeAreaView : View;
    return (
        <Container style={[styles.container, { backgroundColor }, style]} {...props}>
            {children}
        </Container>
    );
});

Screen.displayName = 'Screen';

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
