import React, { useEffect, useRef, useState } from 'react';
import { Platform, Switch, View } from 'react-native';
import { Check, CloudDownload, CloudUpload, Database, HeartPulse, KeyRound, ShieldCheck, Sparkles } from './icons';
import { Backup, createBackup, parseBackup, prepareRestore } from './backup';
import { chooseTextFile, exportText, getSecret, setSecret } from './platform';
import { commit, getState, restoreState, useStore } from './store';
import { Button, C, Card, Chip, Input, Label, Row, Section, Sheet, T, confirm, fonts, safely, useNav } from './ui';
import { cancelRestNotification, enableRestNotifications } from './timer';
import { findTutorial } from './media';
import { protectStorage, storageProtected } from './pwa';

export async function exportBackup() {
  const backup = await createBackup(getState());
  await exportText(JSON.stringify(backup), `FORM-${new Date().toISOString().slice(0, 10)}.json`);
  await commit(s => ({ ...s, settings: { ...s.settings, lastExportAt: Date.now() } }));
}
export function RestorePreview({ backup, onRestored }: { backup: Backup; onRestored?: () => void }) {
  const nav = useNav();
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    try {
      const state = await prepareRestore(backup);
      await restoreState(state);
      await cancelRestNotification();
      nav.closeAll(); onRestored?.(); nav.toast('Backup restored');
    } finally { setBusy(false); }
  };
  return <Sheet title="Restore backup">
    <Card style={{ gap: 16 }}><Label color={C.cyan}>Backup preview</Label><T style={{ fontFamily: fonts.display, fontSize: 24 }}>{new Date(backup.createdAt).toLocaleDateString()}</T><T>{backup.state.sessions.length} sessions · {backup.state.workouts.length} workouts</T><T>{backup.state.programs.length} programs · {Object.keys(backup.images).length} images</T>{backup.state.active && <T muted>Includes an unfinished session.</T>}</Card>
    <T style={{ lineHeight: 23 }}>This replaces the data on this device. Export your current data first if you want to keep it. API keys are not part of a backup.</T>
    <Button title={busy ? 'Restoring…' : 'Replace with this backup'} disabled={busy} icon={CloudDownload} onPress={() => confirm('Replace local data?', 'Use this backup as the complete library and history on this device?', () => void safely(restore, nav.toast))} />
  </Sheet>;
}
export function SettingsScreen() {
  const state = useStore(), nav = useNav();
  const [key, setKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [protectedStorage, setProtectedStorage] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => {
    void getSecret('youtube-key').then(value => { setKey(value ?? ''); setKeySaved(!!value); }).catch(() => undefined);
    void storageProtected().then(setProtectedStorage).catch(() => undefined);
    return () => { cancelled.current = true; };
  }, []);
  const updateSetting = (settings: Partial<typeof state.settings>) => safely(() => commit(s => ({ ...s, settings: { ...s.settings, ...settings } })), nav.toast);
  const discover = async () => {
    const saved = await getSecret('youtube-key');
    if (!saved) throw new Error('Save a YouTube API key first.');
    cancelled.current = false;
    setBusy(true);
    const pending = getState().exercises.filter(e => !e.videoId);
    try {
      for (let index = 0; index < pending.length; index++) {
        if (cancelled.current) break;
        const exercise = pending[index]!;
        setProgress(`${index + 1} / ${pending.length} · ${exercise.name}`);
        const result = await findTutorial(exercise, saved);
        if (cancelled.current) break;
        await commit(s => ({ ...s, exercises: s.exercises.map(e => e.id === exercise.id ? { ...e, ...result } : e) }));
      }
      if (!cancelled.current) nav.toast('Tutorial search complete');
    } finally { setBusy(false); setProgress(''); }
  };
  return <Sheet title="Settings">
    <Card style={{ gap: 14 }}><Row><ShieldCheck size={23} color={C.lime} /><View style={{ flex: 1, gap: 5 }}><T style={{ fontFamily: fonts.bold }}>Local first. Yours always.</T><T muted style={{ fontSize: 12 }}>No account. No ads. No automatic health-data uploads.</T></View></Row></Card>
    <Section title="Training preferences" />
    <Card style={{ gap: 20 }}>
      <Row><View style={{ flex: 1, gap: 6 }}><T style={{ fontFamily: fonts.bold }}>Return mode</T><T muted style={{ fontSize: 12, lineHeight: 19 }}>Cap new sessions at two sets per exercise.</T></View><Switch accessibilityLabel="Return mode" value={state.settings.returnMode} onValueChange={returnMode => updateSetting({ returnMode })} trackColor={{ true: C.lime, false: C.line }} thumbColor={C.text} /></Row>
      <Label>Weekly training-day goal</Label><Row style={{ flexWrap: 'wrap', gap: 8 }}>{[1, 2, 3, 4, 5, 6, 7].map(weeklyGoal => <Chip key={weeklyGoal} title={String(weeklyGoal)} selected={state.settings.weeklyGoal === weeklyGoal} onPress={() => updateSetting({ weeklyGoal })} />)}</Row>
      {Platform.OS !== 'web' && <Row><View style={{ flex: 1, gap: 6 }}><T style={{ fontFamily: fonts.bold }}>Rest notifications</T><T muted style={{ fontSize: 12 }}>A reminder when the app is in the background.</T></View><Switch accessibilityLabel="Rest notifications" value={state.settings.notifications} trackColor={{ true: C.lime, false: C.line }} thumbColor={C.text} onValueChange={enabled => void safely(async () => {
        if (enabled && !await enableRestNotifications()) throw new Error('Enable notifications in iPhone Settings to use rest reminders.');
        await updateSetting({ notifications: enabled });
        if (!enabled) await cancelRestNotification();
      }, nav.toast)} /></Row>}
      {Platform.OS === 'web' && <T muted style={{ fontSize: 12, lineHeight: 20 }}>Rest timers stay accurate when you return. iPhone web apps cannot reliably ring a timer while closed.</T>}
    </Card>
    <Section title="Backups & new phones" />
    <Card style={{ gap: 15 }}>
      <Row><Database size={22} color={C.cyan} /><T style={{ fontFamily: fonts.bold }}>Everything in one file</T></Row>
      <T muted style={{ lineHeight: 21 }}>Routines, history, unfinished sessions and chosen images. Save the export to Google Drive through the iPhone share sheet. Restore it using Files on your new phone.</T>
      <Button title="Export backup" icon={CloudUpload} variant="secondary" disabled={busy} onPress={() => void safely(async () => { setBusy(true); try { await exportBackup(); } finally { setBusy(false); } }, nav.toast)} />
      <Button title="Restore backup" icon={CloudDownload} variant="secondary" disabled={busy} onPress={() => void safely(async () => {
        const raw = await chooseTextFile();
        if (raw) nav.open(<RestorePreview backup={parseBackup(raw)} />);
      }, nav.toast)} />
      <T muted style={{ fontSize: 11 }}>{state.settings.lastExportAt ? `Last export opened: ${new Date(state.settings.lastExportAt).toLocaleDateString()}` : 'No backup exported yet'}</T>
      {Platform.OS === 'web' && <>
        <Button title={protectedStorage ? 'Offline storage protected' : 'Protect offline storage'} variant="ghost" disabled={protectedStorage} onPress={() => void safely(async () => {
          const granted = await protectStorage();
          setProtectedStorage(granted);
          nav.toast(granted ? 'Persistent storage enabled. Keep backups for device changes.' : 'Safari did not grant persistent storage. Install to Home Screen and keep regular backups.');
        }, nav.toast)} />
        <T muted style={{ fontSize: 11, lineHeight: 18 }}>Keep the same app address. Clearing website data or removing browser storage can erase local history; a backup protects it.</T>
      </>}
    </Card>
    <Section title="Video discovery" />
    <Card style={{ gap: 15 }}>
      <Row><KeyRound size={21} color={C.orange} /><T style={{ fontFamily: fonts.bold }}>YouTube Data API</T>{keySaved && <Check size={17} color={C.lime} />}</Row>
      <T muted style={{ lineHeight: 21 }}>Add your own API key to find short tutorials automatically. Without a key, browse YouTube and paste a video link into any exercise.</T>
      <Input accessibilityLabel="YouTube API key" placeholder="Your YouTube Data API key" secureTextEntry autoCapitalize="none" autoCorrect={false} value={key} onChangeText={setKey} />
      <Button title={key.trim() ? Platform.OS === 'web' ? 'Use key for this browser session' : 'Save key on this device' : 'Remove saved key'} variant="secondary" disabled={busy} onPress={() => void safely(async () => { await setSecret('youtube-key', key.trim()); setKeySaved(!!key.trim()); nav.toast(key.trim() ? Platform.OS === 'web' ? 'Key saved for this browser session' : 'Key saved securely on this device' : 'Saved key removed'); }, nav.toast)} />
      <Button title={busy ? 'Searching tutorials…' : 'Find missing tutorials'} icon={Sparkles} disabled={!keySaved || busy} onPress={() => void safely(discover, nav.toast)} />
      {!!progress && <><T muted style={{ fontSize: 12 }}>{progress}</T><Button title="Stop search" small variant="ghost" onPress={() => { cancelled.current = true; }} /></>}
    </Card>
    <Section title="Fitbit Versa 4" />
    <Card style={{ gap: 14 }}><Row><HeartPulse color={C.danger} size={23} /><T style={{ fontFamily: fonts.bold }}>Workout metrics</T></Row><T muted style={{ lineHeight: 21 }}>Add workout heart rate and steps from Fitbit in a saved session&apos;s details. Automatic sync requires a separately configured Google Health connection. Live Versa 4 heart-rate streaming is not available here.</T></Card>
  </Sheet>;
}
