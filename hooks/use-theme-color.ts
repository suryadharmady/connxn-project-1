import { useTheme } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/constants/theme';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof ThemeColors,
) {
  const { isDark, colors } = useTheme();
  const colorFromProps = isDark ? props.dark : props.light;

  return colorFromProps ?? colors[colorName];
}
