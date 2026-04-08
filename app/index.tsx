import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { createConversation } from '@/services/tavusApi';
import { Spacing, FontSize, BorderRadius } from '@/constants/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { colors, isDark, toggleTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const handleStartCall = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setPermissionDenied(false);

    try {
      // On mobile, request permissions before navigating
      if (Platform.OS !== 'web') {
        const { Camera } = await import('expo-camera');
        const { Audio } = await import('expo-av');

        const camResult = await Camera.requestCameraPermissionsAsync();
        if (!camResult.granted) {
          setPermissionDenied(true);
          setError('Camera access is required for video calls.');
          setIsLoading(false);
          return;
        }

        const micResult = await Audio.requestPermissionsAsync();
        if (!micResult.granted) {
          setPermissionDenied(true);
          setError('Microphone access is required for video calls.');
          setIsLoading(false);
          return;
        }
      }

      // Call API and navigate directly to call screen (Daily's restyled pre-join handles the rest)
      console.log('[StartCall] Creating conversation...');
      const conversation = await createConversation();
      console.log('[StartCall] Got URL:', conversation.conversation_url);

      router.push({
        pathname: '/call',
        params: {
          conversationId: conversation.conversation_id,
          conversationUrl: conversation.conversation_url,
        },
      });
    } catch (err: any) {
      console.error('[StartCall]', err);
      setError(err.message || 'Failed to start');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Pressable
        style={[styles.themeToggle, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={toggleTheme}
      >
        <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={colors.textSecondary} />
      </Pressable>

      <View style={styles.content}>
        <Text style={[styles.brandTag, { color: colors.textMuted }]}>Connxn AI | Powered by Tavus</Text>

        <View style={styles.hero}>
          <View style={styles.avatarRing}>
            <BlurView
              intensity={40}
              tint={isDark ? 'dark' : 'light'}
              style={[styles.avatarInner, { borderColor: colors.accent }]}
            >
              <Ionicons name="person" size={36} color={colors.accent} />
            </BlurView>
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Connxn AI Persona</Text>
          <Text style={[styles.subtitle, { color: colors.accent }]}>AI-Powered Video Support</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Have a live video conversation with our AI customer support agent.
          </Text>
        </View>

        {error && (
          <View style={[styles.errorCard, { borderColor: colors.danger, backgroundColor: colors.dangerGlow }]}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            {permissionDenied && (
              <Pressable
                onPress={() => Linking.openSettings()}
                style={[styles.settingsBtn, { borderColor: colors.danger }]}
              >
                <Text style={[styles.settingsBtnText, { color: colors.danger }]}>Open Settings</Text>
              </Pressable>
            )}
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.startButton,
            { backgroundColor: colors.accent, shadowColor: colors.accent },
            pressed && { backgroundColor: colors.accentDark, transform: [{ scale: 0.96 }] },
            isLoading && { opacity: 0.7 },
          ]}
          onPress={handleStartCall}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <>
              <Ionicons name="videocam" size={22} color={colors.background} />
              <Text style={[styles.startButtonText, { color: colors.background }]}>Start Call</Text>
            </>
          )}
        </Pressable>

        <BlurView
          intensity={25}
          tint={isDark ? 'dark' : 'light'}
          style={[styles.infoCard, { borderColor: colors.glassBorder }]}
        >
          <View style={styles.infoRow}>
            <View style={[styles.dot, { backgroundColor: colors.statusActive }]} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>AI Persona is online and ready</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="videocam-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.infoText, { color: colors.textSecondary, marginLeft: 6 }]}>Camera & microphone required</Text>
          </View>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  themeToggle: {
    position: 'absolute', top: Spacing.xxl, right: Spacing.lg,
    width: 40, height: 40, borderRadius: BorderRadius.full, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  brandTag: {
    fontSize: FontSize.xs, fontWeight: '500', letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: Spacing.lg, textAlign: 'center',
  },
  content: { width: '100%', maxWidth: 420, alignItems: 'center' },
  hero: { alignItems: 'center', marginBottom: Spacing.xl },
  avatarRing: { marginBottom: Spacing.lg },
  avatarInner: {
    width: 88, height: 88, borderRadius: 44, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  title: { fontSize: FontSize.xxl, fontWeight: '800', marginBottom: Spacing.xs, textAlign: 'center' },
  subtitle: { fontSize: FontSize.lg, fontWeight: '600', marginBottom: Spacing.sm, textAlign: 'center' },
  description: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 24, paddingHorizontal: Spacing.md },
  errorCard: {
    flexDirection: 'column', alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md,
    marginBottom: Spacing.md, width: '100%',
  },
  errorText: { fontSize: FontSize.sm, textAlign: 'center' },
  settingsBtn: {
    borderWidth: 1, borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.xs + 2, paddingHorizontal: Spacing.md,
  },
  settingsBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  startButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.full, marginBottom: Spacing.xl,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16,
    elevation: 10, minWidth: 180, minHeight: 52,
  },
  startButtonText: { fontSize: FontSize.lg, fontWeight: '700' },
  infoCard: { borderRadius: BorderRadius.lg, padding: Spacing.lg, width: '100%', borderWidth: 1, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: Spacing.sm },
  infoText: { fontSize: FontSize.sm },
});
