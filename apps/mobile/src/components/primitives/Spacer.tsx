import React from 'react';
import { View } from 'react-native';
import { SPACING, SpacingName } from '@/styles/theme';

interface SpacerProps {
  /** Vertical spacing size. */
  y?: SpacingName | number;
  /** Horizontal spacing size. */
  x?: SpacingName | number;
}

function resolveSize(value: SpacingName | number | undefined): number {
  if (value === undefined) return 0;
  if (typeof value === 'number') return value;
  return SPACING[value];
}

export function Spacer({ x, y }: SpacerProps) {
  const width = resolveSize(x);
  const height = resolveSize(y);

  return <View style={{ width, height }} />;
}
