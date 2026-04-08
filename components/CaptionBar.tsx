import { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { FontSize, BorderRadius, Spacing } from '@/constants/theme';

interface CaptionBarProps {
  text: string;
  isVisible: boolean;
}

export function CaptionBar({ text, isVisible }: CaptionBarProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: isVisible && text.length > 0 ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [isVisible, text, opacity]);

  if (!text) return null;

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <Text style={styles.text} numberOfLines={2}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    maxWidth: '80%',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    marginBottom: Spacing.sm,
  },
  text: {
    color: '#fff',
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
