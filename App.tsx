import React, { Component, ErrorInfo, ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { CalendarDays, ChartNoAxesCombined, House, LayoutGrid, LucideIcon, Play, Search, Settings2, X } from './src/icons';
import { Tab } from './src/model';
import { uid } from './src/domain';
import { boot, bootFailure, recoverPrevious, useStore } from './src/store';
import { chooseTextFile, exportText, getSecret, readSnapshot } from './src/platform';
import { parseBackup } from './src/backup';
import { TodayScreen, CalendarScreen, ProgressScreen } from './src/overview-screens';
import { RoutinesScreen } from './src/routine-screens';
import { ExploreScreen } from './src/exercise-screens';
import { SessionScreen } from './src/session-screens';
import { RestorePreview, SettingsScreen } from './src/settings-screen';
import { initializePwa } from './src/pwa';
import { refreshExerciseMedia } from './src/media-refresh';
import { healthResultMessage } from './src/health-client';
import { BackNavigation, installBackNavigation } from './src/back-navigation';
import { CountdownAlarm } from './src/countdown-screen';
import { Button, C, IconButton, Label, NavigationContext, Row, T, fonts, safely, useNav } from './src/ui';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.error) return <View style={{ flex: 1, backgroundColor: C.bg, padding: 28, justifyContent: 'center', gap: 20 }}><T style={{ fontFamily: fonts.display, fontSize: 27 }}>Let&apos;s reopen that.</T><T muted>Your saved workouts have not been erased.</T><Button title="Try again" onPress={() => this.setState({ error: false })} /></View>;
    return this.props.children;
  }
}
function Recovery({ retry }: { retry: () => void }) {
  const nav = useNav();
  return <View style={{ flex: 1, padding: 26, justifyContent: 'center', gap: 20 }}>
    <Label color={C.orange}>Storage recovery</Label><T style={{ fontFamily: fonts.display, fontSize: 29 }}>Your data is still here.</T><T muted style={{ lineHeight: 23 }}>{bootFailure()}</T>
    <Button title="Open previous snapshot" onPress={() => void safely(async () => { await recoverPrevious(); retry(); }, nav.toast)} />
    <Button title="Restore a backup" variant="secondary" onPress={() => void safely(async () => { const raw = await chooseTextFile(); if (raw) nav.open(<RestorePreview backup={parseBackup(raw)} onRestored={retry} />); }, nav.toast)} />
    <Button title="Export raw saved data" variant="secondary" onPress={() => void safely(async () => exportText(await readSnapshot() ?? '{}', 'FORM-recovery.json'), nav.toast)} />
  </View>;
}
const tabs: { title: Tab; icon: LucideIcon }[] = [
  { title: 'Today', icon: House }, { title: 'Routines', icon: LayoutGrid }, { title: 'Calendar', icon: CalendarDays },
  { title: 'Explore', icon: Search }, { title: 'Progress', icon: ChartNoAxesCombined },
];
function Main() {
  const state = useStore(), nav = useNav();
  const [tab, setTab] = useState<Tab>('Today');
  return <>
    <Row style={styles.header}>
      <Row style={{ gap: 9 }}><View style={{ width: 25, height: 25, backgroundColor: C.lime, borderRadius: 7, justifyContent: 'center', alignItems: 'center' }}><View style={{ width: 12, height: 4, backgroundColor: C.bg, transform: [{ rotate: '-35deg' }] }} /></View><T style={{ fontFamily: fonts.display, fontSize: 24, letterSpacing: 4 }}>FORM</T></Row>
      <Row style={{ gap: 3 }}><View style={{ width: 5, height: 5, backgroundColor: C.lime, borderRadius: 3, marginRight: 5 }} /><T muted style={{ fontSize: 9, letterSpacing: 1 }}>{nav.offlineReady ? 'OFFLINE READY' : 'LOCAL'}</T><IconButton icon={Settings2} label="Open settings" onPress={() => nav.open(<SettingsScreen />)} /></Row>
    </Row>
    <View style={{ flex: 1 }}>{tab === 'Today' ? <TodayScreen /> : tab === 'Routines' ? <RoutinesScreen /> : tab === 'Calendar' ? <CalendarScreen /> : tab === 'Explore' ? <ExploreScreen /> : <ProgressScreen />}</View>
    {state.active && tab !== 'Today' && <Pressable accessibilityRole="button" accessibilityLabel="Resume active workout" onPress={() => nav.open(<SessionScreen />)} style={{ backgroundColor: C.raised, paddingVertical: 11, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Play size={15} color={C.lime} /><T style={{ flex: 1, fontFamily: fonts.bold, fontSize: 12 }}>{state.active.name}</T><T style={{ color: C.lime, fontSize: 12 }}>Resume</T></Pressable>}
    <Row style={styles.tabs}>{tabs.map(({ title, icon: Icon }) => <Pressable key={title} accessibilityRole="tab" accessibilityLabel={`${title} tab`} accessibilityState={{ selected: tab === title }} onPress={() => setTab(title)} style={styles.tab}>
      <View style={{ paddingHorizontal: 13, paddingVertical: 5, borderRadius: 13, backgroundColor: tab === title ? `${C.lime}18` : 'transparent' }}><Icon size={21} strokeWidth={tab === title ? 2.4 : 1.7} color={tab === title ? C.lime : C.muted} /></View><T style={{ fontSize: 10, fontFamily: fonts.medium, color: tab === title ? C.lime : C.muted }}>{title}</T>
    </Pressable>)}</Row>
  </>;
}
function Application() {
  const [, setRevision] = useState(0);
  const [sheets, setSheets] = useState<{ id: string; node: ReactNode }[]>([]);
  const sheetsRef = useRef(sheets);
  const backNavigation = useRef<BackNavigation | undefined>(undefined);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    const controller = installBackNavigation(() => sheetsRef.current.map(sheet => sheet.id), depth => {
      const next = sheetsRef.current.slice(0, depth);
      sheetsRef.current = next;
    }, () => setSheets(sheetsRef.current));
    backNavigation.current = controller;
    return () => { controller.dispose(); backNavigation.current = undefined; };
  }, []);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 5500); return () => clearTimeout(timer); }, [message]);
  useEffect(() => {
    void boot().then(() => {
      setReady(true);
      const healthMessage = healthResultMessage();
      if (healthMessage) setMessage(healthMessage);
      if (!bootFailure()) void getSecret('youtube-key').then(key => { if (key) void refreshExerciseMedia(key); }).catch(() => undefined);
    });
    void initializePwa().then(setOfflineReady).catch(() => setMessage('Offline setup could not finish. Open the app online once before using it offline.'));
  }, []);
  const updateSheets = (change: (current: typeof sheets) => typeof sheets) => {
    const next = change(sheetsRef.current);
    sheetsRef.current = next;
    if (backNavigation.current) backNavigation.current.sync();
    else setSheets(next);
  };
  const nav = {
    open: (node: ReactNode) => updateSheets(current => [...current, { id: uid(), node }]),
    close: () => updateSheets(current => current.slice(0, -1)),
    closeAll: () => updateSheets(() => []), toast: (text: string) => setMessage(text), offlineReady,
  };
  const toast = message ? <Pressable accessibilityRole="alert" onPress={() => setMessage('')} style={styles.toast}><T style={{ fontSize: 12, lineHeight: 19, flex: 1 }}>{message}</T><X color={C.muted} size={16} /></Pressable> : null;
  return <NavigationContext.Provider value={nav}>
    <SafeAreaView style={styles.app} edges={['top', 'bottom']}>
      {!ready ? <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={C.lime} /></View> : bootFailure() ? <Recovery retry={() => setRevision(x => x + 1)} /> : <Main />}
      {ready && !bootFailure() && <CountdownAlarm />}
      {!sheets.length && toast}
    </SafeAreaView>
    {/* Web exit animations leave the focus trap active while underlying controls accept clicks. */}
    <Modal visible={sheets.length > 0} animationType={Platform.OS === 'web' ? 'none' : 'slide'} presentationStyle="fullScreen" onRequestClose={nav.close}>
      <SafeAreaView style={styles.app} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {sheets.map((sheet, index) => <View key={sheet.id} style={{ flex: 1, display: index === sheets.length - 1 ? 'flex' : 'none' }}>{sheet.node}</View>)}
        </KeyboardAvoidingView>
        {toast}
      </SafeAreaView>
    </Modal>
  </NavigationContext.Provider>;
}
export default function App() {
  const [loaded, fontError] = useFonts({
    DMSans_400Regular: require('@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf'),
    DMSans_500Medium: require('@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf'),
    DMSans_700Bold: require('@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf'),
    SpaceGrotesk_700Bold: require('@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf'),
  });
  return <SafeAreaProvider><StatusBar style="light" /><ErrorBoundary>{loaded || fontError ? <Application /> : <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}><ActivityIndicator color={C.lime} /></View>}</ErrorBoundary></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  app: { flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center', backgroundColor: C.bg },
  header: { paddingLeft: 22, paddingRight: 12, height: 68, justifyContent: 'space-between' },
  tabs: { justifyContent: 'space-around', gap: 0, borderTopColor: C.line, borderTopWidth: 1, backgroundColor: C.bg, paddingTop: 10, paddingBottom: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 52 },
  toast: { position: 'absolute', bottom: 90, left: 18, right: 18, padding: 16, flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: C.raised, borderColor: C.lime, borderWidth: 1, borderRadius: 15, zIndex: 100 },
});
