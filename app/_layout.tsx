import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '@/components/ui';
import { SessionProvider, useProfile, useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SafeAreaProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </SafeAreaProvider>
        </SessionProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Three states decide where you land: signed out, signed in without a
 * household, and fully set up. The middle one matters because every
 * household-scoped query returns nothing useful until it is resolved.
 */
function RootNavigator() {
  const { session, initialising } = useSession();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const segments = useSegments();
  const router = useRouter();

  // Typed routes give useSegments a union of tuple types, so index access is
  // narrowed away. The path is genuinely a list of strings here.
  const parts = segments as string[];
  const inAuthGroup = parts[0] === '(auth)';
  const onHouseholdScreen = inAuthGroup && parts[1] === 'household';

  useEffect(() => {
    if (initialising) return;

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
      return;
    }

    // Wait for the profile before deciding. Redirecting on a not-yet-loaded
    // profile would bounce every signed-in user through household setup.
    if (profileLoading) return;

    if (!profile?.active_household_id) {
      if (!onHouseholdScreen) router.replace('/(auth)/household');
      return;
    }

    if (inAuthGroup) router.replace('/(tabs)');
  }, [
    initialising,
    session,
    profile?.active_household_id,
    profileLoading,
    inAuthGroup,
    onHouseholdScreen,
    router,
  ]);

  if (initialising) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="recipe/[id]" options={{ title: '', headerBackTitle: 'Back' }} />
      <Stack.Screen name="scan/index" options={{ title: 'Scan a receipt' }} />
      <Stack.Screen name="scan/review" options={{ title: 'Check the items' }} />
    </Stack>
  );
}
