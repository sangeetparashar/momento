import React from 'react';
import {
  Text as RNText,
  TextProps as RNTextProps,
  StyleSheet,
} from 'react-native';
import { TYPOGRAPHY, TypographyVariant } from '@/styles/typography';
import { COLORS, ColorName } from '@/styles/theme';

interface TextProps extends RNTextProps {
  /** Typography variant. Defaults to 'body'. */
  variant?: TypographyVariant;
  /** Text color token. Overrides the variant's default color. */
  color?: ColorName;
  /** Text alignment. */
  align?: 'left' | 'center' | 'right';
  /** Children nodes. */
  children: React.ReactNode;
}

export function Text({
  variant = 'body',
  color,
  align,
  style,
  children,
  ...rest
}: TextProps) {
  const variantStyle = TYPOGRAPHY[variant];

  return (
    <RNText
      style={[
        variantStyle,
        color !== undefined && { color: COLORS[color] },
        align !== undefined && { textAlign: align },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}
