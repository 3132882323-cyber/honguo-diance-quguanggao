import React, { type ComponentProps } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Drama } from '../domain/types';
import type { Colors } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, colors, size = 22, color }: {
  name: IconName; colors: Colors; size?: number; color?: string;
}) {
  return <Ionicons name={name} size={size} color={color ?? colors.text}
    accessible={false} importantForAccessibility="no-hide-descendants" />;
}

export function Button({ label, icon, onPress, colors, variant = 'secondary', disabled, small }: {
  label: string; icon?: IconName; onPress: () => void; colors: Colors;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; disabled?: boolean; small?: boolean;
}) {
  const background = variant === 'primary' ? colors.action : variant === 'quiet' ? 'transparent' : colors.raised;
  const foreground = variant === 'primary' ? colors.onAction : variant === 'danger' ? colors.danger : colors.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: background, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }, small && styles.smallButton]}>
    {icon && <Icon name={icon} colors={colors} color={foreground} size={19} />}
    <Text style={[styles.buttonText, { color: foreground }]}>{label}</Text>
  </Pressable>;
}

export function IconButton({ label, name, onPress, colors, disabled = false }: {
  label: string; name: IconName; onPress: () => void; colors: Colors; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
    accessibilityState={{ disabled }} onPress={onPress}
    style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.raised, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}>
    <Icon name={name} colors={colors} />
  </Pressable>;
}

export function Chip({ label, selected, onPress, colors }: {
  label: string; selected?: boolean; onPress: () => void; colors: Colors;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ selected: !!selected }} onPress={onPress}
    style={({ pressed }) => [styles.chip, { borderColor: selected ? colors.accent : colors.border,
      backgroundColor: selected ? colors.tint : colors.surface, opacity: pressed ? 0.65 : 1 }]}>
    <Text style={{ color: selected ? colors.accent : colors.muted, fontSize: 14, fontWeight: selected ? '700' : '500' }}>{label}</Text>
  </Pressable>;
}

export function EmptyState({ icon = 'film-outline', title, body, colors, children }: {
  icon?: IconName; title: string; body: string; colors: Colors; children?: React.ReactNode;
}) {
  return <View style={styles.empty}>
    <View style={[styles.emptyIcon, { backgroundColor: colors.raised }]}><Icon name={icon} colors={colors} size={32} color={colors.accent} /></View>
    <Text accessibilityRole="header" style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
    <Text style={[styles.emptyBody, { color: colors.muted }]}>{body}</Text>
    {children && <View style={styles.emptyActions}>{children}</View>}
  </View>;
}

export function Busy({ colors, label = '正在加载' }: { colors: Colors; label?: string }) {
  return <View style={styles.busy} accessibilityRole="progressbar" accessibilityLabel={label}>
    <ActivityIndicator color={colors.accent} /><Text style={{ color: colors.muted }}>{label}</Text>
  </View>;
}

export function Cover({ drama, colors, large = false }: { drama: Drama; colors: Colors; large?: boolean }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [drama.coverUrl]);
  return <View style={[styles.cover, large && styles.largeCover, { backgroundColor: colors.raised }]}>
    {drama.coverUrl && !failed
      ? <Image source={{ uri: drama.coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} accessibilityLabel={`${drama.title}封面`} />
      : <View style={styles.coverFallback}><Icon name="play-circle-outline" colors={colors} size={large ? 56 : 36} color={colors.accent} /><Text numberOfLines={3} style={[styles.coverText, { color: colors.text }]}>{drama.title}</Text></View>}
  </View>;
}

export function DramaCard({ drama, colors, onPress, width, saved }: {
  drama: Drama; colors: Colors; onPress: () => void; width: number; saved?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`查看${drama.title}${saved ? '，已收藏' : ''}`}
    onPress={onPress} style={({ pressed }) => [{ width, opacity: pressed ? 0.7 : 1, paddingBottom: 18 }]}>
    <Cover drama={drama} colors={colors} />
    <View style={styles.cardTitleRow}>
      <Text numberOfLines={2} style={[styles.cardTitle, { color: colors.text }]}>{drama.title}</Text>
      {saved && <Icon name="bookmark" colors={colors} color={colors.accent} size={14} />}
    </View>
    <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{drama.subtitle ?? (drama.episodeCount ? `${drama.episodeCount} 集` : drama.tags.slice(0, 2).join(' · '))}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 1 },
  smallButton: { paddingHorizontal: 12, borderRadius: 12 },
  buttonText: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  iconButton: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40, gap: 14 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 23, textAlign: 'center', maxWidth: 460 },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 8 },
  busy: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, padding: 36 },
  cover: { aspectRatio: 0.7, borderRadius: 16, overflow: 'hidden' },
  largeCover: { aspectRatio: 0.73, width: 130, borderRadius: 18 },
  coverFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 12 },
  coverText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, paddingTop: 9, paddingBottom: 4 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontWeight: '600', flex: 1 },
});
