import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CVIProvider } from '@/components/TavusInterface';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';

function AppStack() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade_from_bottom',
          animationDuration: 250,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen
          name="hair-check"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="call"
          options={{ animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen
          name="call-ended"
          options={{ animation: 'fade' }}
        />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <CVIProvider>
        <AppStack />
      </CVIProvider>
    </ThemeProvider>
  );
}
