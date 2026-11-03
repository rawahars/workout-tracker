import React, { memo, useEffect, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { ArrowLeftRight, Check, CheckCheck, Clock3, Copy, MoreHorizontal, Plus, SkipForward, Trash2, Trophy, X } from './icons';
import * as Clipboard from 'expo-clipboard';
import { DaySchema, Exercise, MetricsSchema, Session, SessionExercise, Workout, localDay } from './model';
import { analysisSummary, completedSets, emptySet, finishSession, fmt, formatTime, sessionExercise, startSession, totalSets, uid, validateLoggedSet, volume } from './domain';
import { commit, getState, useStore } from './store';
import { ExerciseDetail, ExercisePicker } from './exercise-screens';
import { AddButton, Artwork, Button, C, Card, Clock, Empty, IconButton, Input, Label, Row, Sheet, Stat, T, buzz, confirm, fonts, safely, useClock, useNav } from './ui';
import { cancelRestNotification, scheduleRestNotification } from './timer';

type Nav = ReturnType<typeof useNav>;
export async function launchWorkout(workout: Workout | undefined, nav: Nav, day = localDay(), programId?: string) {
  if (!getState().active) await commit(s => s.active ? s : startSession(s, workout, day, Date.now(), programId));
  nav.closeAll();
  nav.open(<SessionScreen />);
}
function updateSession(sessionId: string | undefined, change: (session: Session) => Session) {
  return commit(s => sessionId ? { ...s, sessions: s.sessions.map(session => {
    if (session.id !== sessionId) return session;
    const updated = change(session);
    if (!completedSets(updated)) throw new Error('Keep at least one completed set, or delete the session in its details.');
    return updated;
  }) } : {
    ...s, active: s.active ? change(s.active) : null,
  });
}
const SetNumber = memo(function SetNumber({ value, label, onChange, integer = false }: { value: number; label: string; onChange: (value: number) => void; integer?: boolean }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return <TextInput accessibilityLabel={label} selectTextOnFocus keyboardType={integer ? 'number-pad' : 'decimal-pad'} value={focused ? text : String(value)} onFocus={() => { setText(String(value)); setFocused(true); }} onBlur={() => setFocused(false)} onChangeText={input => {
    const normalized = input.replace(',', '.');
    if (!(integer ? /^\d{0,4}$/ : /^\d{0,5}(\.\d{0,2})?$/).test(normalized)) return;
    setText(normalized);
    onChange(Number(normalized) || 0);
  }} style={{ backgroundColor: C.bg, color: C.text, fontFamily: fonts.bold, textAlign: 'center', fontSize: 16, minHeight: 46, flex: 1, minWidth: 0, width: 0, borderRadius: 10, paddingHorizontal: 4 }} />;
});
function RestTimer({ endsAt }: { endsAt: number }) {
  const now = useClock();
  const nav = useNav();
  const remaining = Math.ceil((endsAt - now) / 1000);
  useEffect(() => { if (remaining === 0) buzz(); }, [remaining]);
  if (remaining <= 0) return null;
  return <Row style={{ backgroundColor: C.lime, paddingVertical: 10, paddingHorizontal: 16, gap: 12 }}>
    <Clock3 size={20} color={C.bg} /><View style={{ flex: 1 }}><T style={{ color: C.bg, fontFamily: fonts.bold, fontSize: 11 }}>REST TIMER</T><T style={{ color: C.bg, fontFamily: fonts.display, fontSize: 24, fontVariant: ['tabular-nums'] }}>{formatTime(remaining)}</T></View>
    <Button title="+30s" small variant="ghost" onPress={() => void safely(async () => {
      const end = (getState().active?.restEndsAt ?? Date.now()) + 30000;
      await updateSession(undefined, s => ({ ...s, restEndsAt: end }));
      if (getState().settings.notifications) await scheduleRestNotification(end);
    }, nav.toast)} />
    <IconButton icon={SkipForward} label="Skip rest" color={C.bg} onPress={() => void safely(async () => { await updateSession(undefined, s => ({ ...s, restEndsAt: undefined })); await cancelRestNotification(); }, nav.toast)} />
  </Row>;
}
function LoggedExercise({ exercise, sessionId }: { exercise: SessionExercise; sessionId?: string }) {
  const state = useStore(), nav = useNav();
  const original = state.exercises.find(e => e.id === exercise.exerciseId)!;
  const timed = exercise.mode === 'seconds' || exercise.mode === 'cardio';
  const change = (fn: (value: SessionExercise) => SessionExercise) => updateSession(sessionId, s => ({ ...s, exercises: s.exercises.map(e => e.id === exercise.id ? fn(e) : e) }));
  const changeSet = (setId: string, key: 'weight' | 'reps' | 'seconds' | 'distance', value: number) => void safely(async () => {
    const max = key === 'weight' ? 2000 : key === 'seconds' ? 86400 : 1000;
    if (value > max) throw new Error('That value is too large.');
    await change(e => ({ ...e, sets: e.sets.map(set => set.id === setId ? { ...set, [key]: value, done: (key === 'reps' || key === 'seconds') && value === 0 ? false : set.done } : set) }));
  }, nav.toast);
  const toggle = (setId: string) => void safely(async () => {
    let restEndsAt: number | undefined;
    await updateSession(sessionId, session => {
      const currentExercise = session.exercises.find(e => e.id === exercise.id);
      const set = currentExercise?.sets.find(s => s.id === setId);
      if (!set || !currentExercise) return session;
      if (!set.done) validateLoggedSet(currentExercise, set);
      restEndsAt = !set.done && currentExercise.rest > 0 ? Date.now() + currentExercise.rest * 1000 : undefined;
      return { ...session, ...(sessionId ? {} : { restEndsAt }), exercises: session.exercises.map(e => e.id === exercise.id ? { ...e, sets: e.sets.map(row => row.id === setId ? { ...row, done: !row.done } : row) } : e) };
    });
    buzz();
    if (!sessionId && getState().settings.notifications) await scheduleRestNotification(restEndsAt);
  }, nav.toast);
  const remove = () => confirm('Remove this exercise?', 'Its sets will be removed from this session only.', () => void safely(() => changeSessionExercises(list => list.filter(e => e.id !== exercise.id)), nav.toast), true);
  const changeSessionExercises = (fn: (exercises: SessionExercise[]) => SessionExercise[]) => updateSession(sessionId, s => ({ ...s, exercises: fn(s.exercises) }));
  const replace = (replacement: Exercise) => {
    const apply = () => void safely(async () => {
      const next = sessionExercise(getState(), replacement);
      await change(() => ({ ...next, id: exercise.id }));
    }, nav.toast);
    if (exercise.sets.some(s => s.done)) confirm('Replace this exercise?', 'Existing sets for this exercise will be replaced. The template is unchanged.', apply);
    else apply();
  };
  return <Card style={{ padding: 14, gap: 13 }}>
    <Row style={{ gap: 10 }}><Pressable accessibilityRole="button" accessibilityLabel={`View ${exercise.name}`} onPress={() => nav.open(<ExerciseDetail id={original.id} />)}><Artwork exercise={original} size={45} /></Pressable>
      <View style={{ flex: 1, gap: 5 }}><T style={{ fontFamily: fonts.bold, fontSize: 15 }}>{exercise.name}</T><T muted style={{ fontSize: 11 }}>{exercise.target} · {exercise.rest}s rest</T></View><IconButton icon={ArrowLeftRight} label={`Replace ${exercise.name}`} size={18} onPress={() => nav.open(<ExercisePicker alternativeTo={original} onPick={replace} />)} />
    </Row>
    <Row style={{ gap: 8 }}><View style={{ width: 25 }}><Label>#</Label></View>{exercise.mode === 'weight' && <View style={{ flex: 1 }}><Label>kg</Label></View>}<View style={{ flex: 1 }}><Label>{exercise.mode === 'cardio' ? 'min' : timed ? 'sec' : 'reps'}</Label></View>{exercise.mode === 'cardio' && <View style={{ flex: 1 }}><Label>km</Label></View>}<View style={{ width: 43 }}><Label>Done</Label></View><View style={{ width: 24 }} /></Row>
    {exercise.sets.map((set, index) => <Row key={set.id} style={{ gap: 8 }}>
      <T muted style={{ width: 25, textAlign: 'center', fontFamily: fonts.bold, fontSize: 12 }}>{index + 1}</T>
      {exercise.mode === 'weight' && <SetNumber value={set.weight} label={`${exercise.name} set ${index + 1} kg`} onChange={value => changeSet(set.id, 'weight', value)} />}
      <SetNumber value={timed ? exercise.mode === 'cardio' ? set.seconds / 60 : set.seconds : set.reps} label={`${exercise.name} set ${index + 1} ${timed ? exercise.mode === 'cardio' ? 'minutes' : 'seconds' : 'reps'}`} integer={!timed} onChange={value => changeSet(set.id, timed ? 'seconds' : 'reps', exercise.mode === 'cardio' ? value * 60 : value)} />
      {exercise.mode === 'cardio' && <SetNumber value={set.distance} label={`${exercise.name} set ${index + 1} km`} onChange={value => changeSet(set.id, 'distance', value)} />}
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`Complete ${exercise.name} set ${index + 1}`} accessibilityState={{ checked: set.done }} aria-checked={set.done} onPress={() => toggle(set.id)} style={{ width: 43, height: 46, borderRadius: 10, backgroundColor: set.done ? C.lime : C.raised, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: set.done ? C.lime : C.line }}><Check size={19} color={set.done ? C.bg : C.muted} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${exercise.name} set ${index + 1}`} onPress={() => void safely(() => {
        if (set.done) confirm('Remove completed set?', 'This set will be removed from the session.', () => void safely(() => change(e => ({ ...e, sets: e.sets.filter(s => s.id !== set.id) })), nav.toast), true);
        else return change(e => ({ ...e, sets: e.sets.filter(s => s.id !== set.id) }));
      }, nav.toast)} style={{ width: 24, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><X size={14} color={C.muted} /></Pressable>
    </Row>)}
    <Row style={{ justifyContent: 'space-between' }}><Button title="Add set" icon={Plus} small variant="ghost" disabled={exercise.sets.length >= 30} onPress={() => void safely(() => change(e => ({ ...e, sets: [...e.sets, { ...(e.sets.at(-1) ?? emptySet()), id: uid(), done: false }] })), nav.toast)} /><IconButton icon={Trash2} label={`Remove ${exercise.name}`} color={C.muted} size={16} onPress={remove} /></Row>
  </Card>;
}
export function SessionScreen({ id }: { id?: string }) {
  const state = useStore(), nav = useNav();
  const session = id ? state.sessions.find(s => s.id === id) : state.active;
  const [name, setName] = useState(session?.name ?? '');
  if (!session) return <Sheet title="Workout"><Empty title="Workout saved" description="Your session is in the calendar and progress tabs." /></Sheet>;
  const add = (exercise: Exercise) => void safely(() => {
    if (session.exercises.length >= 100) throw new Error('A session can contain up to 100 exercises.');
    return updateSession(id, s => ({ ...s, exercises: [...s.exercises, sessionExercise(getState(), exercise)] }));
  }, nav.toast);
  const finish = () => confirm('Finish workout?', `${completedSets(session)} completed sets will be saved. Unchecked sets stay in the log but are excluded from totals.`, () => void safely(async () => {
    const sessionId = getState().active?.id;
    await commit(s => finishSession(s));
    await cancelRestNotification();
    nav.closeAll();
    nav.open(<SessionSummary id={sessionId!} />);
  }, nav.toast));
  return <Sheet title={id ? 'Training log' : 'In your session'} scroll={false} footer={!id ? <Row><View style={{ flex: 1 }}><Label>Completed</Label><T style={{ fontFamily: fonts.display, fontSize: 22 }}>{completedSets(session)} <T muted>/ {totalSets(session)} sets</T></T></View><Button title="Finish workout" icon={CheckCheck} disabled={!completedSets(session)} onPress={finish} /></Row> : undefined}>
    {!id && session.restEndsAt && <RestTimer endsAt={session.restEndsAt} />}
    <FlatList
      data={session.exercises} keyExtractor={e => e.id} keyboardShouldPersistTaps="handled"
      initialNumToRender={5} windowSize={5} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 35 }}
      ListHeaderComponent={<View style={{ gap: 15, marginBottom: 3 }}>
        <Row style={{ justifyContent: 'space-between' }}><Label color={session.color}>{session.day} · {session.programName ?? 'Freestyle / standalone'}</Label>{!id && <Clock start={session.startedAt} />}</Row>
        <Input accessibilityLabel="Session name" value={name} onChangeText={setName} maxLength={100} onBlur={() => { if (name.trim()) void safely(() => updateSession(id, s => ({ ...s, name: name.trim() })), nav.toast); }} style={{ fontFamily: fonts.display, fontSize: 25, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0 }} />
        <Row><Stat label="Completed sets" value={String(completedSets(session))} /><Stat label="Load-volume kg" value={fmt(volume(session))} color={session.color} /></Row>
        {!id && <T muted style={{ fontSize: 11 }}>Saved on every change · kg per dumbbell · reps per side</T>}
        {id && <Button title="Session details & metrics" small variant="secondary" icon={MoreHorizontal} onPress={() => nav.open(<SessionDetails id={id} />)} />}
      </View>}
      ListEmptyComponent={<Empty title="Make it your own" description="Add any exercise. Freestyle workouts count in your calendar and progress just like planned sessions." />}
      renderItem={({ item }) => <LoggedExercise exercise={item} sessionId={id} />}
      ListFooterComponent={<View style={{ gap: 16, marginTop: 16 }}>
        <AddButton title="Add exercise" onPress={() => nav.open(<ExercisePicker onPick={add} />)} />
        <Input label="Session notes" multiline placeholder="How did it feel?" value={session.notes} maxLength={4000} onChangeText={notes => void safely(() => updateSession(id, s => ({ ...s, notes })), nav.toast)} />
        {id ? <Button title="View session summary" variant="secondary" onPress={() => nav.open(<SessionSummary id={id} />)} /> : <Button title="Discard session" variant="danger" onPress={() => confirm('Discard this session?', 'This will delete the current session, including completed sets.', () => void safely(async () => { await commit(s => ({ ...s, active: null })); await cancelRestNotification(); nav.closeAll(); }, nav.toast), true)} />}
      </View>}
    />
  </Sheet>;
}
export function SessionDetails({ id }: { id: string }) {
  const session = useStore().sessions.find(s => s.id === id)!;
  const nav = useNav();
  const [day, setDay] = useState(session.day);
  const [duration, setDuration] = useState(String(Math.round((session.duration ?? 0) / 60)));
  const [avg, setAvg] = useState(String(session.metrics?.averageHeartRate ?? ''));
  const [max, setMax] = useState(String(session.metrics?.maxHeartRate ?? ''));
  const [steps, setSteps] = useState(String(session.metrics?.steps ?? ''));
  const save = async () => {
    DaySchema.parse(day);
    const minutes = Number(duration);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) throw new Error('Enter a duration between 0 and 1440 minutes.');
    const hasMetrics = !!(avg.trim() || max.trim() || steps.trim());
    const metrics = hasMetrics ? MetricsSchema.parse({
      source: 'manual', averageHeartRate: avg.trim() ? Number(avg) : undefined,
      maxHeartRate: max.trim() ? Number(max) : undefined, steps: steps.trim() ? Number(steps) : undefined,
    }) : undefined;
    await updateSession(id, s => ({ ...s, day, duration: Math.round(minutes * 60), metrics }));
    nav.close(); nav.toast('Session updated');
  };
  return <Sheet title="Session details" footer={<Button title="Save details" onPress={() => void safely(save, nav.toast)} />}>
    <Input label="Date (YYYY-MM-DD)" value={day} onChangeText={setDay} />
    <Input label="Duration in minutes" keyboardType="decimal-pad" value={duration} onChangeText={setDuration} />
    <Label color={C.cyan}>Optional watch metrics</Label>
    <T muted style={{ lineHeight: 21 }}>Copy values for this workout from Fitbit. These are user-entered values, not a live watch connection.</T>
    <Input label="Average heart rate (bpm)" keyboardType="number-pad" value={avg} onChangeText={setAvg} />
    <Input label="Maximum heart rate (bpm)" keyboardType="number-pad" value={max} onChangeText={setMax} />
    <Input label="Workout steps" keyboardType="number-pad" value={steps} onChangeText={setSteps} />
    <Button title="Delete session" variant="danger" icon={Trash2} onPress={() => confirm('Delete this session?', 'It will be removed from your calendar and statistics.', () => void safely(async () => { await commit(s => ({ ...s, sessions: s.sessions.filter(x => x.id !== id) })); nav.closeAll(); nav.toast('Session deleted'); }, nav.toast), true)} />
  </Sheet>;
}
export function SessionSummary({ id }: { id: string }) {
  const state = useStore(), nav = useNav();
  const session = state.sessions.find(s => s.id === id);
  if (!session) return <Sheet title="Summary"><T muted>This session is no longer available.</T></Sheet>;
  const saveTemplate = async () => {
    const workout: Workout = {
      id: uid(), name: session.name, subtitle: 'Created from a completed session', color: session.color,
      minutes: Math.max(5, Math.min(240, Math.round((session.duration ?? 0) / 60))),
      exercises: session.exercises.filter(e => e.sets.some(s => s.done)).map(e => {
        const sets = e.sets.filter(s => s.done);
        const values = sets.map(s => e.mode === 'seconds' || e.mode === 'cardio' ? Math.round(s.seconds) : s.reps);
        return { id: uid(), exerciseId: e.exerciseId, sets: Math.min(12, sets.length), min: Math.max(1, Math.min(3600, ...values)), max: Math.max(1, Math.min(3600, Math.max(...values))), rest: e.rest };
      }),
    };
    await commit(s => ({ ...s, workouts: [...s.workouts, workout] }));
    nav.toast('Saved to your workout templates');
  };
  return <Sheet title="Session summary">
    <View style={{ alignItems: 'center', paddingVertical: 14, gap: 14 }}><View style={{ padding: 22, borderRadius: 30, backgroundColor: `${session.color}18` }}><Trophy size={38} color={session.color} /></View><Label color={session.color}>Work recorded</Label><T style={{ fontFamily: fonts.display, fontSize: 30, textAlign: 'center' }}>{session.name}</T><T muted>{session.day}</T></View>
    <Card><Row><Stat label="Minutes" value={String(Math.round((session.duration ?? 0) / 60))} /><Stat label="Sets" value={String(completedSets(session))} /><Stat label="Volume kg" value={fmt(volume(session))} color={session.color} /></Row></Card>
    {session.metrics && <Card style={{ gap: 12 }}><Label color={C.cyan}>Watch metrics · manually entered</Label><Row>{session.metrics.averageHeartRate !== undefined && <Stat value={String(session.metrics.averageHeartRate)} label="Average bpm" />}{session.metrics.maxHeartRate !== undefined && <Stat value={String(session.metrics.maxHeartRate)} label="Peak bpm" />}{session.metrics.steps !== undefined && <Stat value={fmt(session.metrics.steps)} label="Steps" />}</Row></Card>}
    {session.exercises.filter(e => e.sets.some(s => s.done)).map(e => <Card key={e.id} style={{ gap: 9 }}><T style={{ fontFamily: fonts.bold }}>{e.name}</T><T muted>{e.sets.filter(s => s.done).map(s => e.mode === 'weight' ? `${fmt(s.weight)} kg × ${s.reps}` : e.mode === 'reps' ? `${s.reps} reps` : `${Math.round(s.seconds)} sec${s.distance ? ` / ${s.distance} km` : ''}`).join('   /   ')}{e.perSide ? ' per side' : ''}</T></Card>)}
    <Button title="Save as workout template" icon={Copy} variant="secondary" onPress={() => void safely(saveTemplate, nav.toast)} />
    <Button title="Review & export summary" variant="secondary" onPress={() => nav.open(<AnalysisExport sessionId={id} />)} />
    <Button title="Edit logged workout" variant="ghost" onPress={() => nav.open(<SessionScreen id={id} />)} />
  </Sheet>;
}
export function AnalysisExport({ sessionId }: { sessionId?: string }) {
  const state = useStore(), nav = useNav();
  const summary = analysisSummary(state, sessionId ? state.sessions.find(s => s.id === sessionId) : undefined);
  return <Sheet title="Your summary" footer={<Button title="Copy summary" icon={Copy} onPress={() => void safely(async () => { await Clipboard.setStringAsync(summary); nav.toast('Copied. Paste into the assistant of your choice.'); }, nav.toast)} />}>
    <T muted style={{ lineHeight: 21 }}>Review before copying. Nothing is sent to an AI service by this app.</T>
    <Card><T style={{ lineHeight: 23 }} selectable>{summary}</T></Card>
  </Sheet>;
}
