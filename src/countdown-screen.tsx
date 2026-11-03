import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Clock3, Pause, Play, RefreshCw, X } from './icons';
import { Countdown } from './model';
import { countdownRemaining, makeCountdown, pauseCountdown, resumeCountdown } from './countdown';
import { alarmReady, ringAlarm, unlockAlarm } from './alarm';
import { commit, useStore } from './store';
import { formatTime } from './domain';
import { Button, C, Card, Chip, IconButton, Input, Label, Row, Sheet, T, buzz, errorMessage, fonts, safely, useClock, useNav } from './ui';

async function updateCountdown(change: (timer?: Countdown) => Countdown | undefined) {
  await commit(state => state.active ? { ...state, active: { ...state.active, countdown: change(state.active.countdown) } } : state);
}
export function CountdownAlarm() {
  const timer = useStore().active?.countdown;
  const now = useClock(timer?.status === 'running');
  const handled = useRef<string | undefined>(undefined);
  const completing = useRef<string | undefined>(undefined);
  const nav = useNav();
  useEffect(() => {
    if (!timer || timer.status !== 'running') { completing.current = undefined; return; }
    if (countdownRemaining(timer, now) > 0 || completing.current === timer.id) return;
    completing.current = timer.id;
    if (handled.current !== timer.id) {
      handled.current = timer.id;
      const sounded = ringAlarm();
      buzz();
      nav.toast(sounded ? 'Timer finished' : 'Timer finished. Sound was not enabled.');
    }
    void updateCountdown(current => current?.id === timer.id && current.status === 'running' ? { ...current, status: 'finished', remainingMs: 0, endsAt: undefined } : current)
      .catch(error => nav.toast(errorMessage(error)));
  }, [timer, now, nav]);
  return null;
}
export function CountdownBanner() {
  const timer = useStore().active?.countdown;
  const now = useClock(timer?.status === 'running');
  const nav = useNav();
  const [, refresh] = useState(0);
  if (!timer) return null;
  return <Card testID="countdown-banner" style={{ marginHorizontal: 20, marginTop: 12, paddingVertical: 10, borderColor: `${C.cyan}66` }}>
    <Row>
      <Clock3 size={20} color={C.cyan} />
      <View style={{ flex: 1, gap: 3 }}><Label color={C.cyan}>{timer.status === 'finished' ? 'Time is up' : timer.status === 'paused' ? 'Countdown paused' : 'Countdown'}</Label><T style={{ fontFamily: fonts.display, fontSize: 24, fontVariant: ['tabular-nums'] }}>{formatTime(Math.ceil(countdownRemaining(timer, now) / 1000))}</T></View>
      <Button title="Timer" small variant="secondary" onPress={() => nav.open(<CountdownScreen />)} />
      <IconButton icon={X} label="Clear countdown" size={18} onPress={() => void safely(() => updateCountdown(() => undefined), nav.toast)} />
    </Row>
    {timer.status === 'running' && !alarmReady() && <Button title="Enable alarm sound" small variant="ghost" onPress={() => {
      const prepared = unlockAlarm();
      void safely(async () => { if (!await prepared) nav.toast('Sound is unavailable. Keep the timer visible.'); refresh(value => value + 1); }, nav.toast);
    }} />}
  </Card>;
}
export function CountdownScreen() {
  const active = useStore().active;
  const timer = active?.countdown;
  const nav = useNav();
  const [minutes, setMinutes] = useState(String(Math.floor((timer?.durationSeconds ?? 60) / 60)));
  const [seconds, setSeconds] = useState(String((timer?.durationSeconds ?? 60) % 60));
  const [, refresh] = useState(0);
  const now = useClock(timer?.status === 'running');
  const start = () => {
    const prepared = unlockAlarm();
    void safely(async () => {
      const mins = Number(minutes), secs = Number(seconds);
      if (!Number.isInteger(mins) || !Number.isInteger(secs) || mins < 0 || secs < 0 || secs > 59) throw new Error('Enter minutes and 0–59 seconds.');
      const duration = mins * 60 + secs;
      if (duration < 1 || duration > 86400) throw new Error('Choose a countdown between one second and 24 hours.');
      const audible = await prepared;
      const value = makeCountdown(duration);
      await updateCountdown(() => value);
      refresh(value => value + 1);
      if (!audible) nav.toast('Sound could not be enabled. Keep the timer visible.');
    }, nav.toast);
  };
  if (!active) return <Sheet title="Workout timer"><T muted>Start a workout to use the countdown.</T></Sheet>;
  return <Sheet title="Workout timer">
    <Card testID="countdown-display" style={{ alignItems: 'center', gap: 14, paddingVertical: 28 }}>
      <Clock3 size={30} color={C.cyan} /><Label color={C.cyan}>{timer?.status === 'finished' ? 'Time is up' : timer?.status === 'paused' ? 'Paused' : timer?.status === 'running' ? 'Counting down' : 'Ready when you are'}</Label>
      <T style={{ fontFamily: fonts.display, fontSize: 64, fontVariant: ['tabular-nums'] }}>{formatTime(timer ? Math.ceil(countdownRemaining(timer, now) / 1000) : (Number(minutes) || 0) * 60 + (Number(seconds) || 0))}</T>
    </Card>
    <Row><View style={{ flex: 1 }}><Input label="Minutes" keyboardType="number-pad" value={minutes} onChangeText={value => { if (/^\d{0,4}$/.test(value)) setMinutes(value); }} /></View><View style={{ flex: 1 }}><Input label="Seconds" keyboardType="number-pad" value={seconds} onChangeText={value => { if (/^\d{0,2}$/.test(value)) setSeconds(value); }} /></View></Row>
    <Row style={{ flexWrap: 'wrap', gap: 8 }}>{[30, 60, 90, 120, 300, 600].map(value => <Chip key={value} title={formatTime(value)} onPress={() => { setMinutes(String(Math.floor(value / 60))); setSeconds(String(value % 60)); }} />)}</Row>
    <Button title={timer ? 'Start new countdown' : 'Start countdown'} icon={Play} onPress={start} />
    {timer?.status === 'running' && <Button title="Pause countdown" icon={Pause} variant="secondary" onPress={() => void safely(() => updateCountdown(current => current ? pauseCountdown(current) : current), nav.toast)} />}
    {timer?.status === 'paused' && <Button title="Resume countdown" icon={Play} variant="secondary" onPress={() => {
      const prepared = unlockAlarm();
      void safely(async () => { await prepared; await updateCountdown(current => current ? resumeCountdown(current) : current); }, nav.toast);
    }} />}
    {timer && <Button title="Clear countdown" icon={RefreshCw} variant="ghost" onPress={() => void safely(() => updateCountdown(() => undefined), nav.toast)} />}
    <Button title="Enable / test alarm sound" small variant="ghost" onPress={() => {
      const prepared = unlockAlarm();
      void safely(async () => { if (!await prepared || !ringAlarm()) nav.toast('Sound is unavailable. Check your iPhone sound settings.'); refresh(value => value + 1); }, nav.toast);
    }} />
    <T muted style={{ fontSize: 12, lineHeight: 20 }}>Keep the app open and media volume up. Supported Safari versions use playback mode briefly to sound in Silent Mode; other music may pause. Sound while locked or closed is not guaranteed. After a reload, tap to enable sound again.</T>
  </Sheet>;
}
