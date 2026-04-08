import { useState, useEffect, useRef } from 'react';
import { Text, StyleSheet } from 'react-native';
import { FontSize } from '@/constants/theme';

interface CallTimerProps {
  isRunning: boolean;
}

export function CallTimer({ isRunning }: CallTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const seconds = (elapsed % 60).toString().padStart(2, '0');

  return <Text style={styles.timer}>{minutes}:{seconds}</Text>;
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const styles = StyleSheet.create({
  timer: {
    fontSize: FontSize.md,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: '#fff',
  },
});
