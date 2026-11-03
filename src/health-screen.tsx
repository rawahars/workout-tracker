import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CloudDownload, Copy, HeartPulse, RefreshCw, ShieldCheck } from './icons';
import { DaySchema, Metrics, localDay } from './model';
import { ACTIVITY_SCOPE, HEART_SCOPE, HealthOverview, HealthStatus, HealthWorkoutMetrics } from './health-contract';
import { connectHealth, disconnectHealth, HealthClientError, healthOverview, healthStatus, healthWorkout } from './health-client';
import { fmt } from './domain';
import { Button, C, Card, Empty, Input, Label, Row, Section, Sheet, Stat, T, confirm, errorMessage, fonts, useNav } from './ui';

function MetricRow({ metrics }: { metrics: { steps?: number; averageHeartRate?: number; maxHeartRate?: number } }) {
  return <Row style={{ flexWrap: 'wrap', gap: 18 }}>
    <Stat value={metrics.steps === undefined ? '—' : fmt(metrics.steps)} label="Wearable steps" color={C.cyan} />
    <Stat value={metrics.averageHeartRate === undefined ? '—' : fmt(metrics.averageHeartRate)} label="Average bpm" />
    <Stat value={metrics.maxHeartRate === undefined ? '—' : fmt(metrics.maxHeartRate)} label="Peak bpm" />
  </Row>;
}
function time(value: string) {
  return new Date(value).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
}
export function HealthScreen({ day: initialDay, onImport }: { day?: string; onImport?: (metrics: Metrics) => Promise<void> }) {
  const nav = useNav();
  const [status, setStatus] = useState<HealthStatus>();
  const [day, setDay] = useState(initialDay ?? localDay());
  const [overview, setOverview] = useState<HealthOverview>();
  const [selected, setSelected] = useState<HealthWorkoutMetrics>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void healthStatus().then(result => { if (mounted.current) setStatus(result); })
      .catch(failure => { if (mounted.current) setError(errorMessage(failure)); })
      .finally(() => { if (mounted.current) setBusy(false); });
    return () => { mounted.current = false; };
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); }
    catch (failure) {
      if (!mounted.current) return;
      setError(errorMessage(failure));
      if (failure instanceof HealthClientError && failure.code === 'reconnect_required') {
        setStatus(current => current ? { ...current, connected: false, scopes: [] } : current);
        setOverview(undefined); setSelected(undefined);
      }
    } finally { if (mounted.current) setBusy(false); }
  };
  const load = () => run(async () => {
    DaySchema.parse(day);
    const result = await healthOverview(day);
    if (!mounted.current) return;
    setOverview(result); setSelected(undefined);
    setStatus(await healthStatus());
  });
  const hasMetrics = selected && [selected.metrics.steps, selected.metrics.averageHeartRate, selected.metrics.maxHeartRate].some(value => value !== undefined);
  return <Sheet title="Google Health">
    <Card style={{ gap: 13 }}>
      <Row><HeartPulse color={C.cyan} size={26} /><View style={{ flex: 1, gap: 5 }}><T style={{ fontFamily: fonts.display, fontSize: 23 }}>Your wearable data</T><T muted>Fitbit / Google Health</T></View></Row>
      <T muted style={{ lineHeight: 21 }}>Read-only access to workouts, heart rate and steps after your watch syncs. No live heart-rate streaming.</T>
      <Row><ShieldCheck size={17} color={C.lime} /><T muted style={{ flex: 1, fontSize: 12 }}>Google tokens are not stored in app data or backups.</T></Row>
    </Card>
    {!!error && <Card style={{ borderColor: `${C.danger}66` }}><T style={{ color: C.danger, lineHeight: 22 }}>{error}</T></Card>}
    {!status && <Button title={busy ? 'Checking connection…' : 'Retry connection check'} disabled={busy} variant="secondary" onPress={() => void run(async () => { setStatus(await healthStatus()); })} />}
    {status && !status.configured && <Card style={{ gap: 16 }}>
      <Label color={C.orange}>One-time server setup</Label>
      <T style={{ lineHeight: 22 }}>Enable Google Health API and create an OAuth Web application client in Google Cloud. Add these values as secrets in the Cloudflare Worker:</T>
      {status.missingConfiguration.map(name => <T key={name} style={{ fontFamily: fonts.bold, fontSize: 12 }}>{name}</T>)}
      <Input label="Authorized OAuth redirect URI" value={status.redirectUri} editable={false} multiline />
      <Button title="Copy redirect URI" icon={Copy} variant="secondary" onPress={() => void run(async () => { await Clipboard.setStringAsync(status.redirectUri); nav.toast('Redirect URI copied'); })} />
      <T muted style={{ fontSize: 12, lineHeight: 20 }}>Do not enter the client secret into this app or commit it to GitHub. Setup instructions are in the repository README.</T>
    </Card>}
    {status?.configured && <>
      <Card style={{ gap: 15 }}>
        <Label color={status.connected ? C.lime : C.orange}>{status.connected ? 'Connected' : 'Not connected'}</Label>
        {!status.connected && <T muted style={{ lineHeight: 21 }}>First link Fitbit to your Google account in the Fitbit / Google Health mobile app. Then authorize FORM using the same account.</T>}
        {status.connected && (!status.scopes.includes(ACTIVITY_SCOPE) || !status.scopes.includes(HEART_SCOPE)) && <T muted style={{ lineHeight: 21 }}>Some permissions are missing. Available data still works; reconnect to grant access to the other metrics.</T>}
        <Button title={status.connected ? 'Reconnect / review permissions' : 'Connect Google Health'} disabled={busy} onPress={() => { try { connectHealth(); } catch (failure) { setError(errorMessage(failure)); } }} />
        {status.connected && <Button title="Disconnect Google Health" variant="danger" disabled={busy} onPress={() => confirm('Disconnect Google Health?', 'Google access will be revoked when possible. Previously imported workout metrics remain on this device.', () => void run(async () => {
          const result = await disconnectHealth();
          setStatus(await healthStatus()); setOverview(undefined); setSelected(undefined);
          if (!result.revoked) setError('Disconnected locally. Google could not confirm revocation; remove FORM access from your Google Account if needed.');
          else nav.toast('Google Health disconnected');
        }))} />}
      </Card>
      {status.connected && <>
        <Section title={onImport ? 'Choose the matching workout' : 'Wearable overview'} />
        <Input label="Date (YYYY-MM-DD)" value={day} onChangeText={value => { setDay(value); setOverview(undefined); setSelected(undefined); }} editable={!busy} />
        <Button title={busy ? 'Loading wearable data…' : 'Load wearable data'} icon={RefreshCw} disabled={busy} onPress={() => void load()} />
        {overview && <>
          <Card style={{ gap: 15 }}><Label>Selected day · your local time</Label><MetricRow metrics={overview.summary} />{overview.summary.warnings.map((warning, index) => <T key={index} muted style={{ fontSize: 12, lineHeight: 19 }}>{warning}</T>)}</Card>
          <T muted style={{ fontSize: 12, lineHeight: 20 }}>A dash means no usable data was returned—not zero. Sync your watch in the mobile app before retrying.</T>
          {overview.workouts.length ? overview.workouts.map(workout => <Card key={workout.id} style={{ gap: 12, borderColor: selected?.workout.id === workout.id ? C.cyan : C.line }}>
            <T style={{ fontFamily: fonts.bold, fontSize: 17 }}>{workout.name}</T>
            <T muted>{time(workout.startTime)} – {time(workout.endTime)}{workout.device ? ` · ${workout.device}` : ''}</T>
            {workout.activeSeconds !== undefined && <T muted style={{ fontSize: 12 }}>{Math.round(workout.activeSeconds / 60)} active minutes</T>}
            <Button title="View workout metrics" small variant="secondary" disabled={busy} onPress={() => void run(async () => {
              const result = await healthWorkout(workout.id);
              if (!mounted.current) return;
              setSelected(result); setStatus(await healthStatus());
            })} />
          </Card>) : <Empty title="No recorded workouts returned" description="Record an exercise on Fitbit, sync your watch, and select its date. Activity permission is needed to list workouts." />}
          {overview.truncated && <T muted>Only the first 125 workouts were returned for this day.</T>}
        </>}
        {selected && <Card style={{ gap: 16, borderColor: C.cyan }}>
          <Label color={C.cyan}>Selected workout</Label><T style={{ fontFamily: fonts.bold }}>{selected.workout.name}</T>
          <T muted>{new Date(selected.workout.startTime).toLocaleString()} – {time(selected.workout.endTime)}</T>
          <MetricRow metrics={selected.metrics} />
          {selected.warnings.map((warning, index) => <T key={index} muted style={{ fontSize: 12, lineHeight: 19 }}>{warning}</T>)}
          {onImport && <Button title="Attach these metrics to session" icon={CloudDownload} disabled={busy || !hasMetrics} onPress={() => confirm('Attach Google Health metrics?', 'This replaces watch metrics for this session. Workout sets, notes and duration stay unchanged.', () => void run(async () => { await onImport(selected.metrics); nav.close(); nav.toast('Google Health metrics attached'); }))} />}
        </Card>}
      </>}
    </>}
  </Sheet>;
}
