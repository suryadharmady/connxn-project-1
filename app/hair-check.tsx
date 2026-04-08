/**
 * Hair-check screen — not used in the main flow.
 * index.tsx navigates directly to /call.
 * This screen exists as a fallback if someone navigates here directly.
 * No auto-navigation, no jumping.
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '@/constants/theme';

export default function HairCheckScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Ionicons name="videocam-outline" size={48} color={colors.textMuted} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>
        Use the Start Call button on the home screen to begin.
      </Text>
      <Pressable
        onPress={() => router.replace('/')}
        style={[styles.btn, { backgroundColor: colors.accent }]}
      >
        <Text style={[styles.btnText, { color: colors.background }]}>Go to Home</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.md },
  text: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
  btn: {
    paddingVertical: Spacing.sm + 4, paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full, marginTop: Spacing.sm,
  },
  btnText: { fontSize: FontSize.md, fontWeight: '600' },
});
