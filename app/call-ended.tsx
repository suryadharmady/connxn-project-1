import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { formatDuration } from '@/components/CallTimer';
import { useTheme } from '@/contexts/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '@/constants/theme';

export default function CallEndedScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { duration } = useLocalSearchParams<{ duration: string }>();

  const durationSecs = parseInt(duration || '0', 10);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Brand */}
        <Text style={[styles.brandTag, { color: colors.textMuted }]}>
          Connxn AI | Powered by Tavus
        </Text>

        {/* Success icon */}
        <View style={[styles.checkCircle, { borderColor: colors.accent }]}>
          <BlurView
            intensity={30}
            tint={isDark ? 'dark' : 'light'}
            style={[styles.checkInner, { backgroundColor: colors.accentGlow }]}
          >
            <Ionicons name="checkmark" size={40} color={colors.accent} />
          </BlurView>
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>Call Ended</Text>

        {/* Duration card */}
        <BlurView
          intensity={25}
          tint={isDark ? 'dark' : 'light'}
          style={[styles.durationCard, { borderColor: colors.glassBorder }]}
        >
          <Text style={[styles.durationLabel, { color: colors.textSecondary }]}>
            Call Duration
          </Text>
          <Text style={[styles.durationValue, { color: colors.textPrimary }]}>
            {formatDuration(durationSecs)}
          </Text>
        </BlurView>

        {/* Back to home */}
        <Pressable
          style={({ pressed }) => [
            styles.newCallBtn,
            { backgroundColor: colors.accent, shadowColor: colors.accent },
            pressed && { backgroundColor: colors.accentDark, transform: [{ scale: 0.96 }] },
          ]}
          onPress={() => router.replace('/')}
        >
          <Ionicons name="home" size={20} color={colors.background} />
          <Text style={[styles.newCallBtnText, { color: colors.background }]}>Back to Home</Text>
        </Pressable>

        {/* Start new call */}
        <Pressable
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: colors.accent },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => router.replace('/')}
        >
          <Ionicons name="videocam" size={18} color={colors.accent} />
          <Text style={[styles.secondaryBtnText, { color: colors.accent }]}>Start New Call</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  brandTag: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.xl,
  },
  checkCircle: {
    borderWidth: 2,
    borderRadius: 48,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  checkInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    marginBottom: Spacing.xl,
  },
  durationCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
    overflow: 'hidden',
  },
  durationLabel: {
    fontSize: FontSize.sm,
    marginBottom: Spacing.xs,
  },
  durationValue: {
    fontSize: FontSize.hero,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  newCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.lg,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  newCallBtnText: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
  secondaryBtnText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
