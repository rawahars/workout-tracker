import React, { createContext, memo, useContext, useEffect, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { ArrowDown, ArrowUp, Check, ChevronLeft, Dumbbell, LucideIcon, Plus, X } from './icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ZodError } from 'zod';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Exercise, Session } from './model';
import { imageData } from './platform';
import { completedSets, formatTime, shortDate, volume, fmt } from './domain';

export const C = { bg: '#101411', card: '#1A201C', raised: '#232B25', line: '#303A32', text: '#F3F6EF', muted: '#A6B0A6', lime: '#C7F36B', purple: '#B4A0FF', cyan: '#73D9E7', orange: '#F6BE83', danger: '#FF9C99' };
export const fonts = { body: 'DMSans_400Regular', medium: 'DMSans_500Medium', bold: 'DMSans_700Bold', display: 'SpaceGrotesk_700Bold' };
type Navigation = { open: (node: React.ReactNode) => void; close: () => void; closeAll: () => void; toast: (message: string) => void; offlineReady: boolean };
export const NavigationContext = createContext<Navigation>({ open: () => {}, close: () => {}, closeAll: () => {}, toast: () => {}, offlineReady: false });
export const useNav = () => useContext(NavigationContext);
export function buzz() { if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined); }
export function errorMessage(error: unknown) {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    return issue ? `${issue.path.filter(part => typeof part === 'string').join(' / ') || 'Input'}: ${issue.message}` : 'Check the entered values.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
export async function safely(action: () => unknown | Promise<unknown>, toast: (message: string) => void) {
  try { await action(); } catch (error) { toast(errorMessage(error)); }
}
export function confirm(title: string, message: string, action: () => void, destructive = false) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n\n${message}`)) action(); return; }
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: destructive ? 'Delete' : 'Confirm', style: destructive ? 'destructive' : 'default', onPress: action }]);
}
export function openUrl(url: string, toast: (message: string) => void) {
  void Linking.openURL(url).catch(() => toast('Could not open this link.'));
}
export function T({ children, style, muted = false, numberOfLines, selectable }: { children: React.ReactNode; style?: object; muted?: boolean; numberOfLines?: number; selectable?: boolean }) {
  return <Text maxFontSizeMultiplier={1.5} numberOfLines={numberOfLines} selectable={selectable} style={[s.text, muted && { color: C.muted }, style]}>{children}</Text>;
}
export function Label({ children, color = C.muted }: { children: React.ReactNode; color?: string }) {
  return <T style={{ fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color }}>{children}</T>;
}
export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) { return <View style={[s.row, style]}>{children}</View>; }
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) { return <View style={[s.card, style]}>{children}</View>; }
export function Button({ title, onPress, icon: Icon, variant = 'primary', disabled = false, small = false, testID }: {
  title: string; onPress: () => void; icon?: LucideIcon; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; small?: boolean; testID?: string;
}) {
  const color = variant === 'primary' ? C.bg : variant === 'danger' ? C.danger : C.text;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={() => { buzz(); onPress(); }} style={({ pressed }) => [s.button, small && { minHeight: 40, paddingHorizontal: 13 }, { backgroundColor: variant === 'primary' ? C.lime : variant === 'secondary' ? C.raised : 'transparent', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }, variant === 'danger' && { borderWidth: 1, borderColor: `${C.danger}55` }]}>
    {Icon && <Icon size={small ? 16 : 19} color={color} strokeWidth={2} />}
    <T style={{ fontFamily: fonts.bold, fontSize: small ? 12 : 14, color }}>{title}</T>
  </Pressable>;
}
export function IconButton({ icon: Icon, label, onPress, color = C.text, size = 20 }: { icon: LucideIcon; label: string; onPress: () => void; color?: string; size?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.iconButton, pressed && { opacity: 0.5 }]}><Icon size={size} color={color} /></Pressable>;
}
export function Chip({ title, selected, onPress, color = C.lime }: { title: string; selected?: boolean; onPress?: () => void; color?: string }) {
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={title} accessibilityState={{ selected }} disabled={!onPress} onPress={onPress} style={[s.chip, { backgroundColor: selected ? color : C.card, borderColor: selected ? color : C.line }]}>
    <T style={{ color: selected ? C.bg : C.muted, fontFamily: fonts.medium, fontSize: 12 }}>{title}</T>
  </Pressable>;
}
export function Section({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <Row style={{ justifyContent: 'space-between', marginTop: 10, marginBottom: 14 }}>
    <T style={{ fontFamily: fonts.display, fontSize: 20 }}>{title}</T>
    {action && <Pressable accessibilityRole="button" onPress={onPress} style={{ paddingVertical: 8 }}><T style={{ color: C.lime, fontSize: 12, fontFamily: fonts.bold }}>{action}</T></Pressable>}
  </Row>;
}
export function Input({ label, style, ...props }: TextInputProps & { label?: string }) {
  return <View style={{ gap: 7 }}>
    {label && <Label>{label}</Label>}
    <TextInput accessibilityLabel={props.accessibilityLabel ?? label} placeholderTextColor="#738074" selectionColor={C.lime} {...props} style={[s.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, style]} />
  </View>;
}
export function Sheet({ title, children, footer, scroll = true }: { title: string; children: React.ReactNode; footer?: React.ReactNode; scroll?: boolean }) {
  const { close } = useNav();
  return <View style={{ flex: 1, backgroundColor: C.bg }}>
    <Row style={s.sheetHeader}><IconButton icon={ChevronLeft} label="Back" onPress={close} /><T numberOfLines={1} style={{ flex: 1, fontFamily: fonts.display, fontSize: 20 }}>{title}</T><IconButton icon={X} label="Close" onPress={close} /></Row>
    {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 22, gap: 18, paddingBottom: 40 }}>{children}</ScrollView> : children}
    {footer && <View style={{ padding: 18, borderTopWidth: 1, borderTopColor: C.line }}>{footer}</View>}
  </View>;
}
export function Empty({ title, description, icon: Icon = Dumbbell }: { title: string; description: string; icon?: LucideIcon }) {
  return <Card style={{ paddingVertical: 32, alignItems: 'center', gap: 12 }}>
    <View style={{ padding: 14, borderRadius: 20, backgroundColor: C.raised }}><Icon size={28} color={C.lime} /></View>
    <T style={{ fontFamily: fonts.display, fontSize: 20, textAlign: 'center' }}>{title}</T><T muted style={{ textAlign: 'center', lineHeight: 21, maxWidth: 280 }}>{description}</T>
  </Card>;
}
export const Artwork = memo(function Artwork({ exercise, size = 56 }: { exercise: Exercise; size?: number }) {
  const [loaded, setLoaded] = useState<{ key: string; uri?: string }>();
  useEffect(() => {
    let active = true;
    if (exercise.image) {
      const key = exercise.image;
      void imageData(key).then(uri => { if (active) setLoaded({ key, uri }); }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [exercise.image]);
  const uri = loaded?.key === exercise.image ? loaded?.uri : undefined;
  const color = ['Quads', 'Hamstrings', 'Glutes', 'Calves'].includes(exercise.muscle) ? C.purple : exercise.muscle === 'Core' ? C.cyan : C.lime;
  if (uri) return <Image accessibilityLabel={exercise.name} source={{ uri }} style={{ width: size, height: size, borderRadius: size * 0.25 }} />;
  return <View style={{ width: size, height: size, borderRadius: size * 0.25, overflow: 'hidden', backgroundColor: `${color}12` }}>
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="37" fill="none" stroke={color} strokeOpacity={0.12} />
      <Path d="M15 50H85M50 15V85" stroke={color} strokeOpacity={0.08} />
      <Circle cx="50" cy="26" r="7" fill={color} opacity={0.9} />
      <Path d="M50 38V59M50 40L30 48M50 40L70 48M50 59L36 79M50 59L64 79" fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" />
      <Rect x="21" y="40" width="6" height="17" rx="2" fill={color} opacity={0.55} /><Rect x="73" y="40" width="6" height="17" rx="2" fill={color} opacity={0.55} />
    </Svg>
  </View>;
});
export function Stat({ value, label, color = C.text }: { value: string; label: string; color?: string }) {
  return <View style={{ flex: 1, gap: 5 }}><T style={{ fontFamily: fonts.display, fontSize: 27, color }}>{value}</T><T muted style={{ fontSize: 11 }}>{label}</T></View>;
}
export function SessionCard({ session, onPress }: { session: Session; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${session.name}, ${session.day}`} onPress={onPress} style={({ pressed }) => [s.card, { gap: 13, opacity: pressed ? 0.7 : 1 }]}>
    <Row><View style={{ width: 4, height: 36, borderRadius: 4, backgroundColor: session.color }} /><View style={{ flex: 1, gap: 4 }}>
      <T style={{ fontFamily: fonts.bold, fontSize: 16 }}>{session.name}</T><T muted style={{ fontSize: 11 }}>{shortDate(session.day)} · {session.programName ?? 'Freestyle / standalone'}</T>
    </View><Check size={18} color={session.color} /></Row>
    <Row style={{ gap: 18 }}><T muted style={{ fontSize: 12 }}>{Math.round((session.duration ?? 0) / 60)} min</T><T muted style={{ fontSize: 12 }}>{completedSets(session)} sets</T>{volume(session) > 0 && <T muted style={{ fontSize: 12 }}>{fmt(volume(session))} kg volume</T>}</Row>
  </Pressable>;
}
export function Reorder({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return <Row style={{ gap: 0 }}><IconButton icon={ArrowUp} label="Move up" onPress={onUp} size={16} /><IconButton icon={ArrowDown} label="Move down" onPress={onDown} size={16} /><IconButton icon={X} label="Remove" onPress={onRemove} size={16} /></Row>;
}
export function AddButton({ title, onPress }: { title: string; onPress: () => void }) {
  return <Button title={title} icon={Plus} variant="secondary" onPress={onPress} />;
}
export function Hero({ children, color = C.lime }: { children: React.ReactNode; color?: string }) {
  return <LinearGradient colors={[`${color}24`, '#202C21', C.card]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={{ padding: 24, borderRadius: 26, borderWidth: 1, borderColor: `${color}44`, gap: 18, overflow: 'hidden' }}>{children}</LinearGradient>;
}
export function useClock(enabled = true) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}
export function Clock({ start }: { start: number }) {
  const now = useClock();
  return <T style={{ fontFamily: fonts.display, color: C.lime, fontVariant: ['tabular-nums'] }}>{formatTime((now - start) / 1000)}</T>;
}
export const s = StyleSheet.create({
  text: { fontFamily: fonts.body, fontSize: 14, color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { padding: 18, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line },
  button: { minHeight: 52, paddingHorizontal: 18, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 15, minHeight: 36, justifyContent: 'center', borderRadius: 20, borderWidth: 1 },
  input: { minHeight: 50, minWidth: 0, color: C.text, fontFamily: fonts.medium, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 13, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  sheetHeader: { minHeight: 66, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: C.line },
});
