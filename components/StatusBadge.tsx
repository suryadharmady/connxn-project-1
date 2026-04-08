import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '@/constants/theme';

type Status = 'connecting' | 'active' | 'ended';

interface StatusBadgeProps {
  status: Status;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { colors } = useTheme();

  const config: Record<Status, { color: string; label: string }> = {
    connecting: { color: colors.statusConnecting, label: 'Connecting' },
    active: { color: colors.statusActive, label: 'Connected' },
    ended: { color: colors.statusEnded, label: 'Ended' },
  };

  const { color, label } = config[status];

  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Spacing.xs + 2,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
