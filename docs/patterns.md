# Momento - Code Patterns & Conventions

## Naming Conventions

### Files
- Components: PascalCase (`PostCard.tsx`, `LikeButton.tsx`)
- Hooks: camelCase with `use` prefix (`useFeed.ts`, `useCreatorProfile.ts`)
- Providers: PascalCase with `Provider` suffix (`LocationProvider.tsx`)
- Utils: camelCase (`formatters.ts`)
- Screens: kebab-case for routes (`create-post.tsx`, `edit-profile.tsx`)
- Dynamic routes: bracket syntax (`[id].tsx`)
- Index files: `index.ts` for re-exports

### Variables
- Design tokens: SCREAMING_SNAKE_CASE (`COLORS`, `TYPOGRAPHY`, `SPACING`)
- Enums: PascalCase keys (`UserRole.CREATOR`, `KycStatus.VERIFIED`)
- Hook returns: destructured objects (`const { user, isLoading } = useUserProfile()`)
- Callbacks: `handle` prefix (`handlePress`, `handleBack`, `handleSave`)
- Boolean state: `is`/`has` prefix (`isLoading`, `isFollowing`, `hasPermission`)

## Component Patterns

### Screen Template
```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/primitives';
import { COLORS, SPACING } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

export default function ScreenName() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Content */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
```

### Feature Component Template
```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/primitives';
import { COLORS, SPACING, RADII } from '@/styles/theme';
import { TYPOGRAPHY } from '@/styles/typography';

interface FeatureNameProps {
  // props
}

export function FeatureName({ ...props }: FeatureNameProps) {
  return (
    <View style={styles.container}>
      {/* Content */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
});
```

### Hook Template (Query)
```typescript
import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api';
import type { ResponseType } from '@momento/shared';

export function useHookName(id?: string) {
  const query = useQuery<ResponseType>({
    queryKey: ['hookName', id],
    queryFn: () => apiService.get<ResponseType>(`/endpoint/${id}`),
    enabled: !!id,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
```

### Hook Template (Mutation with Optimistic Update)
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '@/services/api';

export function useHookName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input) => apiService.post('/endpoint', input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['affected'] });
      const previous = queryClient.getQueryData(['affected']);
      // optimistic update
      queryClient.setQueryData(['affected'], (old) => ({ ...old, ...input }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['affected'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['affected'] });
    },
  });
}
```

### API Route Template
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    const data = await prisma.model.findUnique({ where: { id } });

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
```

## Tab Selector Pattern (used on multiple screens)
```typescript
<View style={styles.tabsContainer}>
  {(['TAB1', 'TAB2'] as TabType[]).map((tab) => (
    <Pressable
      key={tab}
      onPress={() => setActiveTab(tab)}
      style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
    >
      <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
        {tab}
      </Text>
    </Pressable>
  ))}
</View>
```

## Navigation Patterns
- Tab navigation: `router.push('/(tabs)/home')`
- Stack push: `router.push('/creator/${id}')`
- Modal: `router.push('/edit-profile')` (configured as modal in _layout)
- Back: `router.back()`
- Replace (no back): `router.replace('/(tabs)/home')`

## Style Composition Pattern
```typescript
// Spread typography, override specific properties
const styles = StyleSheet.create({
  title: {
    ...TYPOGRAPHY.h2,           // Base font size, weight, line height
    color: COLORS.textPrimary,  // Override default color if needed
    fontWeight: '800',          // Override weight
  },
});

// Conditional styles via array
<View style={[styles.base, isActive && styles.active]} />

// Dynamic color
<Text style={[styles.text, { color: value >= 0 ? COLORS.success : COLORS.error }]}>
```

## Error Handling Pattern
- API: try/catch with `{ success: false, error }` response
- Hooks: React Query handles errors via `error` property
- Mutations: `onError` callback for rollback
- Uploads: try/catch with Alert.alert for user-facing errors
- Auth: redirect to login on 401
