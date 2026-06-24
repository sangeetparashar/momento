import React from 'react';
import {
  View,
  TextInput,
  TextInputProps,
  StyleSheet,
} from 'react-native';
import { Text } from './Text';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY, FONT_FAMILY_DISPLAY } from '@/styles/typography';

export interface FormFieldProps extends Omit<TextInputProps, 'style'> {
  /** Uppercase label above the input. */
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  /** Inline error message (turns the border red). */
  error?: string;
  /** Trailing affix shown inside the input (e.g. "USDC", "%"). */
  affix?: string;
  /** When set, renders a `value.length / counterMax` counter. */
  counterMax?: number;
}

/**
 * Labeled text input matching the Momento design system: uppercase label,
 * surface field with a 1px border (green on focus, red on error), optional
 * trailing affix and character counter.
 */
export function FormField({
  label,
  value,
  onChangeText,
  error,
  affix,
  counterMax,
  ...rest
}: FormFieldProps) {
  const [focused, setFocused] = React.useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text variant="label" style={styles.label}>
          {label}
        </Text>
        {counterMax !== undefined && (
          <Text variant="caption" style={styles.counter}>
            {value.length}/{counterMax}
          </Text>
        )}
      </View>

      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          !!error && styles.fieldError,
        ]}
      >
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={COLORS.textTertiary}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
        {affix ? (
          <Text variant="mono" style={styles.affix}>
            {affix}
          </Text>
        ) : null}
      </View>

      {error ? (
        <Text variant="caption" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  label: {
    color: COLORS.textSecondary,
  },
  counter: {
    color: COLORS.textTertiary,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    minHeight: 52,
  },
  fieldFocused: {
    borderColor: COLORS.primary,
  },
  fieldError: {
    borderColor: COLORS.error,
  },
  input: {
    flex: 1,
    ...TYPOGRAPHY.body,
    fontFamily: FONT_FAMILY_DISPLAY,
    color: COLORS.textPrimary,
    paddingVertical: SPACING.md,
  },
  affix: {
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  error: {
    color: COLORS.error,
    marginTop: SPACING.xs,
  },
});
