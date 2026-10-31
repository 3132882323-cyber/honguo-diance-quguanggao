import { useColorScheme } from 'react-native';
import type { AppPreferences } from '../domain/types';

const dark = {
  background: '#09090B', surface: '#151519', raised: '#202027',
  text: '#F8F8FC', muted: '#AAAAB8', border: '#34343F',
  accent: '#FF708A', action: '#C9153D', onAction: '#FFFFFF',
  success: '#7CDCB4', danger: '#FF929C', tint: '#33212A',
};
const light: typeof dark = {
  background: '#F5F5F8', surface: '#FFFFFF', raised: '#EAEAEE',
  text: '#15151C', muted: '#5F5F70', border: '#CBCBD6',
  accent: '#BA1238', action: '#C9153D', onAction: '#FFFFFF',
  success: '#12694C', danger: '#B41A32', tint: '#FBE4EA',
};

export type Colors = typeof dark;

export function useColors(theme: AppPreferences['theme']) {
  const system = useColorScheme();
  const isDark = theme === 'dark' || (theme === 'system' && system !== 'light');
  return { colors: isDark ? dark : light, isDark };
}

export function formatTime(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}
