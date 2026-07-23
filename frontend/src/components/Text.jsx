import React, { memo } from 'react';
import { Text as RNText } from 'react-native';
import { colors, typography } from '../theme/theme';

export const Text = memo(({ variant = 'bodyMd', weight = 'regular', color = colors.textPrimary, align = 'left', style, children, ...props }) => {
    return (
        <RNText style={[
            {
                fontSize: typography.sizes[variant],
                fontWeight: typography.weights[weight],
                color,
                textAlign: align,
            },
            style,
        ]} {...props}>
            {children}
        </RNText>
    );
});

Text.displayName = 'Text';
