import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Dumbbell, Flame, HeartPulse, Play, Plus, TrendingUp } from './icons';
import { localDay } from './model';
import { analyze, completedSets, fmt, shortDate, weekDays, weeklySessions, weekdayNames } from './domain';
import { useStore } from './store';
import { AnalysisExport, SessionScreen, launchWorkout } from './session-screens';
import { WorkoutCard, WorkoutDetail } from './routine-screens';
import { HealthScreen } from './health-screen';
import { Button, C, Card, Clock, Empty, Hero, IconButton, Label, Row, Section, SessionCard, Sheet, Stat, T, fonts, safely, useNav } from './ui';

export function TodayScreen() {
  const state = useStore(), nav = useNav();
  const today = localDay();
  const program = state.programs.find(p => p.id === state.settings.programId);
  const scheduled = program?.slots.filter(slot => slot.day === new Date().getDay()).flatMap(slot => state.workouts.find(w => w.id === slot.workoutId) ?? []) ?? [];
  const weekly = weeklySessions(state);
  const trained = new Set(weekly.map(s => s.day));
  const recent = [...state.sessions].sort((a, b) => b.day.localeCompare(a.day) || b.startedAt - a.startedAt).slice(0, 3);
  return <ScrollView contentContainerStyle={{ padding: 22, gap: 16, paddingBottom: 35 }}>
    <View style={{ gap: 8, marginBottom: 5 }}><Label color={C.lime}>{new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}</Label><T style={{ fontFamily: fonts.display, fontSize: 36, lineHeight: 41 }}>Show up.{'\n'}Build momentum.</T></View>
    <Card style={{ padding: 17, gap: 17 }}>
      <Row style={{ justifyContent: 'space-between' }}><Label>This week</Label><T style={{ color: C.lime, fontFamily: fonts.bold, fontSize: 12 }}>{trained.size} / {state.settings.weeklyGoal} days</T></Row>
      <Row style={{ gap: 6 }}>{weekDays().map(day => {
        const done = trained.has(day), isToday = day === today;
        return <View key={day} style={{ flex: 1, alignItems: 'center', gap: 8 }}><T muted style={{ fontSize: 10 }}>{weekdayNames[new Date(`${day}T12:00:00`).getDay()]}</T><View style={{ width: 32, height: 32, backgroundColor: done ? C.lime : C.raised, borderRadius: 16, borderWidth: isToday ? 1 : 0, borderColor: C.lime, alignItems: 'center', justifyContent: 'center' }}>{done ? <Check size={17} color={C.bg} /> : <T style={{ fontSize: 12, color: isToday ? C.lime : C.muted }}>{Number(day.slice(-2))}</T>}</View></View>;
      })}</Row>
    </Card>
    {state.active ? <Hero color={state.active.color}>
      <Row style={{ justifyContent: 'space-between' }}><Label color={state.active.color}>Session in progress</Label><Clock start={state.active.startedAt} /></Row>
      <T style={{ fontFamily: fonts.display, fontSize: 29 }}>{state.active.name}</T>
      <T muted>{completedSets(state.active)} completed sets · Saved on your device</T>
      <Button title="Resume workout" icon={Play} onPress={() => nav.open(<SessionScreen />)} />
    </Hero> : scheduled.length ? <Hero color={scheduled[0]!.color}>
      <Row style={{ justifyContent: 'space-between' }}><Label color={scheduled[0]!.color}>{program?.name}</Label><Dumbbell size={22} color={scheduled[0]!.color} /></Row>
      <View style={{ gap: 8 }}><T style={{ fontFamily: fonts.display, fontSize: 30 }}>{scheduled[0]!.name}</T><T muted>{scheduled[0]!.subtitle}</T></View>
      <Row style={{ gap: 20 }}><T style={{ color: scheduled[0]!.color, fontFamily: fonts.bold }}>{scheduled[0]!.minutes} min</T><T muted>{scheduled[0]!.exercises.length} exercises</T></Row>
      <Button title="Start today's workout" icon={Play} onPress={() => void safely(() => launchWorkout(scheduled[0], nav, today, program?.id), nav.toast)} />
      <Pressable accessibilityRole="button" onPress={() => nav.open(<WorkoutDetail id={scheduled[0]!.id} programId={program?.id} />)}><T style={{ color: C.muted, textAlign: 'center', fontSize: 12 }}>Preview workout</T></Pressable>
    </Hero> : <Hero color={C.cyan}>
      <Label color={C.cyan}>Space to recover</Label><T style={{ fontFamily: fonts.display, fontSize: 28 }}>No workout scheduled.</T><T muted style={{ lineHeight: 22 }}>Take it easy, or start a session of your own.</T><Button title="Start freestyle workout" icon={Plus} onPress={() => void safely(() => launchWorkout(undefined, nav), nav.toast)} />
    </Hero>}
    {scheduled.length > 1 && scheduled.slice(1).map(w => <WorkoutCard key={w.id} workout={w} onPress={() => nav.open(<WorkoutDetail id={w.id} programId={program?.id} />)} />)}
    {(scheduled.length > 0 || state.active) && <Button title="Start freestyle workout" icon={Plus} variant="secondary" onPress={() => void safely(() => launchWorkout(undefined, nav), nav.toast)} />}
    <Row style={{ gap: 10 }}><Card style={{ flex: 1, gap: 9 }}><TrendingUp color={C.purple} size={20} /><Stat label="Sessions this week" value={String(weekly.length)} /></Card><Card style={{ flex: 1, gap: 9 }}><Flame color={C.orange} size={20} /><Stat label="Minutes this week" value={fmt(Math.round(weekly.reduce((sum, s) => sum + (s.duration ?? 0), 0) / 60))} /></Card></Row>
    <Section title="Recent sessions" />
    {recent.length ? recent.map(session => <SessionCard key={session.id} session={session} onPress={() => nav.open(<SessionScreen id={session.id} />)} />) : <Empty title="Your next chapter starts here" description="Finish a workout to see your training history take shape." />}
  </ScrollView>;
}
function StartForDate({ day }: { day: string }) {
  const state = useStore(), nav = useNav();
  return <Sheet title={`Log ${shortDate(day)}`}>
    <Button title="Freestyle workout" icon={Plus} onPress={() => void safely(() => launchWorkout(undefined, nav, day), nav.toast)} />
    {state.workouts.map(w => <WorkoutCard key={w.id} workout={w} onPress={() => void safely(() => launchWorkout(w, nav, day), nav.toast)} />)}
  </Sheet>;
}
export function CalendarScreen() {
  const state = useStore(), nav = useNav();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [selected, setSelected] = useState(localDay());
  const offset = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const n = index - offset + 1;
    return n >= 1 && n <= count ? localDay(new Date(month.getFullYear(), month.getMonth(), n, 12)) : null;
  });
  const sessions = state.sessions.filter(s => s.day === selected).sort((a, b) => a.startedAt - b.startedAt);
  const monthSessions = state.sessions.filter(s => s.day.startsWith(localDay(month).slice(0, 7)));
  const move = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1, 12);
    setMonth(next); setSelected(localDay(next));
  };
  return <ScrollView contentContainerStyle={{ padding: 22, gap: 16, paddingBottom: 35 }}>
    <View style={{ gap: 7 }}><Label color={C.lime}>Every session counts</Label><T style={{ fontFamily: fonts.display, fontSize: 32 }}>Your consistency.</T></View>
    <Card style={{ padding: 14 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 20 }}><IconButton icon={ChevronLeft} label="Previous month" onPress={() => move(-1)} /><T style={{ fontFamily: fonts.display, fontSize: 19 }}>{month.toLocaleDateString('en', { month: 'long', year: 'numeric' })}</T><IconButton icon={ChevronRight} label="Next month" onPress={() => move(1)} /></Row>
      <Row style={{ gap: 0, marginBottom: 10 }}>{[1, 2, 3, 4, 5, 6, 0].map(day => <T key={day} muted style={{ width: `${100 / 7}%`, textAlign: 'center', fontSize: 10 }}>{weekdayNames[day]}</T>)}</Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{days.map((day, i) => {
        const logs = day ? state.sessions.filter(s => s.day === day) : [];
        return <View key={day ?? `blank-${i}`} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 5 }}>
          {day && <Pressable accessibilityRole="button" accessibilityLabel={`${day}, ${logs.length} sessions`} accessibilityState={{ selected: day === selected }} onPress={() => setSelected(day)} style={{ width: 38, height: 47, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: day === selected ? C.lime : 'transparent', borderWidth: day === localDay() ? 1 : 0, borderColor: C.lime }}>
            <T style={{ color: day === selected ? C.bg : C.text, fontFamily: fonts.bold, fontSize: 14 }}>{Number(day.slice(-2))}</T>
            <Row style={{ gap: 3, height: 4 }}>{logs.slice(0, 3).map(log => <View key={log.id} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: day === selected ? C.bg : log.color }} />)}</Row>
          </Pressable>}
        </View>;
      })}</View>
    </Card>
    <Row style={{ gap: 10 }}><Card style={{ flex: 1 }}><Stat label="Sessions this month" value={String(monthSessions.length)} /></Card><Card style={{ flex: 1 }}><Stat label="Training days" value={String(new Set(monthSessions.map(s => s.day)).size)} color={C.lime} /></Card></Row>
    <Section title={shortDate(selected)} action={selected <= localDay() ? 'Log workout +' : undefined} onPress={() => nav.open(<StartForDate day={selected} />)} />
    {sessions.length ? sessions.map(session => <SessionCard key={session.id} session={session} onPress={() => nav.open(<SessionScreen id={session.id} />)} />) : <Empty title={selected > localDay() ? 'A fresh page' : 'No sessions logged'} description={selected > localDay() ? 'Completed sessions will appear here.' : 'Planned and freestyle sessions both appear here once saved.'} icon={CalendarDays} />}
  </ScrollView>;
}
export function ProgressScreen() {
  const state = useStore(), nav = useNav();
  const analysis = analyze(state);
  const days = weekDays();
  const counts = days.map(day => state.sessions.filter(s => s.day === day).reduce((sum, s) => sum + completedSets(s), 0));
  const highest = Math.max(1, ...counts);
  const [selectedExercise, setSelectedExercise] = useState<string>();
  const selection = analysis.records.find(r => r.exercise.id === selectedExercise) ?? analysis.records[0];
  const history = selection ? [...state.sessions].sort((a, b) => a.day.localeCompare(b.day) || a.startedAt - b.startedAt)
    .flatMap(session => {
      const sets = session.exercises.filter(e => e.exerciseId === selection.exercise.id).flatMap(e => e.sets.filter(s => s.done));
      return sets.length ? [{ day: session.day, best: Math.max(...sets.map(s => s.weight)), reps: Math.max(...sets.map(s => s.reps)) }] : [];
    }).slice(-8) : [];
  return <ScrollView contentContainerStyle={{ padding: 22, gap: 16, paddingBottom: 35 }}>
    <View style={{ gap: 7 }}><Label color={C.lime}>Small wins. Real progress.</Label><T style={{ fontFamily: fonts.display, fontSize: 32 }}>See the work.</T></View>
    <Card><Row><Stat label="Total sessions" value={String(state.sessions.length)} /><Stat label="Total completed sets" value={fmt(state.sessions.reduce((sum, session) => sum + completedSets(session), 0))} color={C.lime} /></Row></Card>
    <Card style={{ gap: 20 }}>
      <Row style={{ justifyContent: 'space-between' }}><T style={{ fontFamily: fonts.display, fontSize: 19 }}>This week&apos;s work</T><Label>Sets</Label></Row>
      <Row style={{ height: 137, gap: 10, alignItems: 'flex-end' }}>{days.map((day, index) => <View key={day} style={{ flex: 1, alignItems: 'center', gap: 10 }}><T muted style={{ fontSize: 10 }}>{counts[index]}</T><View style={{ width: '100%', maxWidth: 35, height: Math.max(4, counts[index]! / highest * 85), borderRadius: 7, backgroundColor: day === localDay() ? C.lime : counts[index] ? '#617B43' : C.raised }} /><T muted style={{ fontSize: 10 }}>{weekdayNames[new Date(`${day}T12:00:00`).getDay()]?.slice(0, 1)}</T></View>)}</Row>
    </Card>
    <Section title="Training insights" />
    {analysis.insights.map((insight, i) => <Card key={i}><Row style={{ alignItems: 'flex-start' }}><View style={{ width: 6, height: 6, marginTop: 7, borderRadius: 3, backgroundColor: C.lime }} /><T style={{ flex: 1, lineHeight: 22 }}>{insight}</T></Row></Card>)}
    {!!analysis.muscleSets.length && <Card style={{ gap: 17 }}><Label>This week · primary-muscle sets</Label>{analysis.muscleSets.map(([muscle, sets]) => <Row key={muscle}><T style={{ width: 80, fontSize: 12 }}>{muscle}</T><View style={{ height: 6, flex: 1, borderRadius: 3, backgroundColor: C.raised }}><View style={{ width: `${Math.min(100, sets / Math.max(1, analysis.muscleSets[0]![1]) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: C.purple }} /></View><T muted style={{ width: 25, textAlign: 'right', fontSize: 12 }}>{sets}</T></Row>)}</Card>}
    <Section title="Load history" />
    {selection ? <Card style={{ gap: 20 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{analysis.records.map(r => <Pressable key={r.exercise.id} accessibilityRole="button" onPress={() => setSelectedExercise(r.exercise.id)} style={{ paddingVertical: 10, paddingHorizontal: 13, borderRadius: 12, backgroundColor: selection.exercise.id === r.exercise.id ? C.lime : C.raised }}><T style={{ fontSize: 11, color: selection.exercise.id === r.exercise.id ? C.bg : C.text }}>{r.exercise.name}</T></Pressable>)}</ScrollView>
      <Row><Stat label="Heaviest completed load" value={`${fmt(selection.weight)} kg`} color={C.lime} /><Stat label="Reps at that load" value={String(selection.reps)} /></Row>
      {history.map((point, index) => <Row key={`${point.day}-${index}`}><T muted style={{ flex: 1, fontSize: 12 }}>{shortDate(point.day)}</T><T style={{ fontFamily: fonts.bold }}>{fmt(point.best)} kg</T></Row>)}
    </Card> : <Empty title="Build your baseline" description="Complete weighted sets to start your exercise-specific load history." icon={TrendingUp} />}
    <Button title="Google Health wearable data" icon={HeartPulse} variant="secondary" onPress={() => nav.open(<HealthScreen />)} />
    <Button title="Review & export training summary" icon={ArrowRight} variant="secondary" disabled={!state.sessions.length} onPress={() => nav.open(<AnalysisExport />)} />
  </ScrollView>;
}
