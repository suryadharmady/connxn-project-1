import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Spacing, FontSize, BorderRadius } from '@/constants/theme';

interface PingBadgeProps {
  targetUrl?: string;
}

export function PingBadge({ targetUrl }: PingBadgeProps) {
  const [ping, setPing] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const measure = async () => {
      if (
        Platform.OS === 'web' &&
        typeof navigator !== 'undefined' &&
        (navigator as any).connection?.rtt
      ) {
        setPing((navigator as any).connection.rtt);
        return;
      }

      const endpoint = targetUrl
        ? new URL(targetUrl).origin
        : 'https://tavusapi.com';

      const start = Date.now();
      try {
        await fetch(endpoint, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
      } catch { /* timing is still valid */ }
      setPing(Date.now() - start);
    };

    measure();
    intervalRef.current = setInterval(measure, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [targetUrl]);

  const dotColor =
    ping === null ? 'rgba(255,255,255,0.4)'
    : ping < 80 ? '#34D399'
    : ping < 200 ? '#FBBF24'
    : '#F87171';

  return (
    <View style={styles.badge}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={styles.label}>
        {ping === null ? '...' : `${ping} ms`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.35)',
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
    fontVariant: ['tabular-nums'],
    color: 'rgba(255,255,255,0.8)',
  },
});
