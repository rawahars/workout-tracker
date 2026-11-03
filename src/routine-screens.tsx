import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Check, ChevronRight, Copy, Edit3, Layers, Play, Plus, Trash2 } from './icons';
import { Program, ProgramSchema, Workout, WorkoutSchema } from './model';
import { targetFor, uid, weekdayNames } from './domain';
import { commit, useStore } from './store';
import { ExerciseDetail, ExercisePicker } from './exercise-screens';
import { launchWorkout } from './session-screens';
import { AddButton, Artwork, Button, C, Card, Chip, Empty, IconButton, Input, Label, Reorder, Row, Section, Sheet, T, confirm, fonts, safely, useNav } from './ui';

const colors = [C.lime, C.purple, C.cyan, C.orange, '#ED9BCD'];
export function RoutinesScreen() {
  const state = useStore();
  const nav = useNav();
  const [segment, setSegment] = useState<'Programs' | 'Workouts'>('Programs');
  return <ScrollView contentContainerStyle={{ padding: 22, gap: 14, paddingBottom: 35 }}>
    <View style={{ gap: 7 }}><Label color={C.lime}>Built around you</Label><T style={{ fontFamily: fonts.display, fontSize: 32 }}>Your training.</T></View>
    <Row style={{ justifyContent: 'space-between', marginVertical: 8 }}><Row><Chip title="Programs" selected={segment === 'Programs'} onPress={() => setSegment('Programs')} /><Chip title="Workouts" selected={segment === 'Workouts'} onPress={() => setSegment('Workouts')} /></Row><IconButton icon={Plus} label={segment === 'Programs' ? 'Create program' : 'Create workout'} color={C.lime} onPress={() => nav.open(segment === 'Programs' ? <ProgramEditor /> : <WorkoutEditor />)} /></Row>
    {segment === 'Programs' ? <>
      {state.programs.map(program => {
        const active = state.settings.programId === program.id;
        return <Pressable key={program.id} accessibilityRole="button" accessibilityLabel={`View ${program.name}`} onPress={() => nav.open(<ProgramDetail id={program.id} />)}>
          <Card style={{ padding: 22, gap: 18, borderColor: active ? `${C.lime}70` : C.line }}>
            <Row style={{ justifyContent: 'space-between' }}><View style={{ backgroundColor: `${C.lime}16`, padding: 10, borderRadius: 13 }}><Layers color={C.lime} size={22} /></View>{active ? <Chip title="Active program" selected /> : <ChevronRight color={C.muted} size={20} />}</Row>
            <View style={{ gap: 7 }}><T style={{ fontFamily: fonts.display, fontSize: 23 }}>{program.name}</T><T muted style={{ lineHeight: 20 }}>{program.subtitle || `${program.slots.length} scheduled workouts`}</T></View>
            <Row style={{ gap: 6 }}>{[1, 2, 3, 4, 5, 6, 0].map(day => {
              const scheduled = program.slots.some(slot => slot.day === day);
              return <View key={day} style={{ flex: 1, borderRadius: 9, backgroundColor: scheduled ? `${C.lime}18` : C.bg, paddingVertical: 10, alignItems: 'center' }}><T style={{ fontSize: 10, color: scheduled ? C.lime : C.muted }}>{weekdayNames[day]}</T></View>;
            })}</Row>
          </Card>
        </Pressable>;
      })}
      {!state.programs.length && <Empty title="Make your first program" description="Group reusable workouts into a weekly schedule." />}
      <T muted style={{ fontSize: 12, lineHeight: 20 }}>Programs share workout templates. Edit a template once and every program using it updates.</T>
    </> : <>
      {state.workouts.map((workout, index) => <WorkoutCard key={workout.id} workout={workout} index={index} onPress={() => nav.open(<WorkoutDetail id={workout.id} />)} />)}
      {!state.workouts.length && <Empty title="Build a workout" description="Add movements, working sets and rest times." />}
    </>}
  </ScrollView>;
}
export function WorkoutCard({ workout, index, onPress }: { workout: Workout; index?: number; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${workout.name}`} onPress={onPress}>
    <Card style={{ gap: 12 }}>
      <Row>{index !== undefined && <T style={{ fontFamily: fonts.display, fontSize: 31, color: workout.color, width: 43 }}>{String(index + 1).padStart(2, '0')}</T>}<View style={{ flex: 1, gap: 5 }}><T style={{ fontFamily: fonts.bold, fontSize: 17 }}>{workout.name}</T><T muted style={{ fontSize: 12 }}>{workout.subtitle}</T></View><ChevronRight size={18} color={workout.color} /></Row>
      <Row style={{ gap: 16 }}><Label color={workout.color}>{workout.minutes} min</Label><T muted style={{ fontSize: 11 }}>{workout.exercises.length} exercises · {workout.exercises.reduce((sum, e) => sum + e.sets, 0)} sets</T></Row>
    </Card>
  </Pressable>;
}
export function ProgramDetail({ id }: { id: string }) {
  const state = useStore();
  const program = state.programs.find(p => p.id === id);
  const nav = useNav();
  if (!program) return <Sheet title="Program"><T muted>This program was removed.</T></Sheet>;
  return <Sheet title="Program">
    <Row style={{ justifyContent: 'space-between' }}><Label color={C.lime}>Weekly structure</Label><IconButton icon={Edit3} label="Edit program" onPress={() => nav.open(<ProgramEditor id={id} />)} /></Row>
    <T style={{ fontFamily: fonts.display, fontSize: 32 }}>{program.name}</T><T muted>{program.subtitle}</T>
    <Button title={state.settings.programId === id ? 'Your active program' : 'Use this program'} icon={Check} variant={state.settings.programId === id ? 'secondary' : 'primary'} onPress={() => void safely(async () => { await commit(s => ({ ...s, settings: { ...s.settings, programId: id } })); nav.toast('Active program updated'); }, nav.toast)} />
    {program.slots.map(slot => {
      const workout = state.workouts.find(w => w.id === slot.workoutId);
      return workout && <View key={slot.id} style={{ gap: 8 }}><Label>{weekdayNames[slot.day]}</Label><WorkoutCard workout={workout} onPress={() => nav.open(<WorkoutDetail id={workout.id} programId={id} />)} /></View>;
    })}
  </Sheet>;
}
export function WorkoutDetail({ id, programId }: { id: string; programId?: string }) {
  const state = useStore();
  const workout = state.workouts.find(w => w.id === id);
  const nav = useNav();
  if (!workout) return <Sheet title="Workout"><T muted>This template was removed.</T></Sheet>;
  return <Sheet title="Workout" footer={<Button title={state.active ? 'Resume current workout' : 'Start workout'} icon={Play} onPress={() => void safely(() => launchWorkout(workout, nav, undefined, programId), nav.toast)} />}>
    <Row style={{ justifyContent: 'space-between' }}><Label color={workout.color}>Your working sets</Label><IconButton icon={Edit3} label="Edit workout" onPress={() => nav.open(<WorkoutEditor id={id} />)} /></Row>
    <T style={{ fontFamily: fonts.display, fontSize: 32 }}>{workout.name}</T><T muted>{workout.subtitle}</T>
    <Row><Chip title={`${workout.minutes} min`} /><Chip title={`${workout.exercises.length} exercises`} />{state.settings.returnMode && <Chip title="Return mode" selected color={C.cyan} />}</Row>
    {workout.exercises.map((rx, index) => {
      const exercise = state.exercises.find(e => e.id === rx.exerciseId)!;
      return <Pressable accessibilityRole="button" accessibilityLabel={`View ${exercise.name}`} key={rx.id} onPress={() => nav.open(<ExerciseDetail id={exercise.id} />)}><Card><Row><Artwork exercise={exercise} /><View style={{ flex: 1, gap: 7 }}><T style={{ fontFamily: fonts.bold }}>{index + 1}. {exercise.name}</T><T muted style={{ fontSize: 12 }}>{state.settings.returnMode ? Math.min(2, rx.sets) : rx.sets} × {targetFor(exercise, rx)} · {rx.rest}s rest</T></View><ChevronRight size={16} color={C.muted} /></Row></Card></Pressable>;
    })}
    <Button title="Duplicate workout" icon={Copy} variant="secondary" onPress={() => void safely(async () => {
      const duplicate = { ...workout, id: uid(), name: `${workout.name.slice(0, 90)} copy`, exercises: workout.exercises.map(e => ({ ...e, id: uid() })) };
      await commit(s => ({ ...s, workouts: [...s.workouts, duplicate] }));
      nav.open(<WorkoutEditor id={duplicate.id} />);
    }, nav.toast)} />
  </Sheet>;
}
export function WorkoutEditor({ id }: { id?: string }) {
  const state = useStore();
  const original = state.workouts.find(w => w.id === id);
  const [draft, setDraft] = useState<Workout>(() => original ? { ...original, exercises: original.exercises.map(e => ({ ...e })) } : { id: uid(), name: '', subtitle: '', minutes: 60, color: C.lime, exercises: [] });
  const nav = useNav();
  const move = (index: number, delta: number) => {
    const list = [...draft.exercises], target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target]!, list[index]!];
    setDraft({ ...draft, exercises: list });
  };
  const save = async () => {
    if (!draft.exercises.length) throw new Error('Add at least one exercise.');
    const workout = WorkoutSchema.parse(draft);
    await commit(s => ({ ...s, workouts: original ? s.workouts.map(w => w.id === id ? workout : w) : [...s.workouts, workout] }));
    nav.close(); nav.toast('Workout saved');
  };
  return <Sheet title={id ? 'Edit workout' : 'New workout'} footer={<Button title="Save workout" disabled={!draft.name.trim()} onPress={() => void safely(save, nav.toast)} />}>
    <Input label="Workout name" placeholder="e.g. Full body express" maxLength={100} value={draft.name} onChangeText={name => setDraft({ ...draft, name })} />
    <Input label="Description" placeholder="A short focus for this session" maxLength={150} value={draft.subtitle} onChangeText={subtitle => setDraft({ ...draft, subtitle })} />
    <Input label="Estimated minutes" keyboardType="number-pad" value={String(draft.minutes)} onChangeText={value => setDraft({ ...draft, minutes: Number(value) || 0 })} />
    <Row>{colors.map(color => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`Choose ${color}`} onPress={() => setDraft({ ...draft, color })} style={{ width: 42, height: 42, backgroundColor: color, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }}>{draft.color === color && <Check size={23} color={C.bg} />}</Pressable>)}</Row>
    <Section title="Exercise order" />
    {draft.exercises.map((rx, index) => {
      const exercise = state.exercises.find(e => e.id === rx.exerciseId)!;
      const update = (key: 'sets' | 'min' | 'max' | 'rest', value: string) => setDraft(current => ({ ...current, exercises: current.exercises.map(e => e.id === rx.id ? { ...e, [key]: Number(value) || 0 } : e) }));
      return <Card key={rx.id} style={{ gap: 13 }}>
        <Row><Artwork exercise={exercise} size={42} /><T style={{ flex: 1, fontFamily: fonts.bold }}>{exercise.name}</T></Row>
        <Row style={{ gap: 8 }}>{(['sets', 'min', 'max', 'rest'] as const).map(key => <View key={key} style={{ flex: 1 }}><Input label={key === 'rest' ? 'Rest sec' : key === 'sets' ? 'Sets' : `${key} ${exercise.mode === 'cardio' || exercise.mode === 'seconds' ? 'sec' : 'reps'}`} keyboardType="number-pad" value={String(rx[key])} onChangeText={value => update(key, value)} style={{ textAlign: 'center', paddingHorizontal: 5 }} /></View>)}</Row>
        <Row style={{ justifyContent: 'space-between' }}><Button title="Replace" small variant="ghost" onPress={() => nav.open(<ExercisePicker alternativeTo={exercise} onPick={replacement => setDraft(current => ({ ...current, exercises: current.exercises.map(e => e.id === rx.id ? { ...e, exerciseId: replacement.id } : e) }))} />)} /><Reorder onUp={() => move(index, -1)} onDown={() => move(index, 1)} onRemove={() => setDraft(current => ({ ...current, exercises: current.exercises.filter(e => e.id !== rx.id) }))} /></Row>
      </Card>;
    })}
    <AddButton title="Add exercise" onPress={() => nav.open(<ExercisePicker onPick={exercise => setDraft(current => ({ ...current, exercises: [...current.exercises, { id: uid(), exerciseId: exercise.id, sets: 2, min: exercise.mode === 'cardio' ? 1200 : exercise.mode === 'seconds' ? 20 : 8, max: exercise.mode === 'cardio' ? 1800 : exercise.mode === 'seconds' ? 40 : 12, rest: exercise.mode === 'cardio' ? 0 : 90 }] }))} />)} />
    {original && <Button title="Delete workout" icon={Trash2} variant="danger" onPress={() => confirm('Delete this template?', 'It will be removed from programs. Completed workouts and your current session stay unchanged.', () => void safely(async () => {
      await commit(s => ({ ...s, workouts: s.workouts.filter(w => w.id !== id), programs: s.programs.map(p => ({ ...p, slots: p.slots.filter(slot => slot.workoutId !== id) })) }));
      nav.close(); nav.toast('Workout deleted');
    }, nav.toast), true)} />}
  </Sheet>;
}
function WorkoutPicker({ onPick }: { onPick: (id: string) => void }) {
  const state = useStore(), nav = useNav();
  return <Sheet title="Choose a workout">{state.workouts.map(w => <WorkoutCard key={w.id} workout={w} onPress={() => { nav.close(); onPick(w.id); }} />)}{!state.workouts.length && <Empty title="No workout templates" description="Create a workout in the Workouts tab first." />}</Sheet>;
}
export function ProgramEditor({ id }: { id?: string }) {
  const state = useStore(), nav = useNav();
  const original = state.programs.find(p => p.id === id);
  const [draft, setDraft] = useState<Program>(original ? { ...original, slots: [...original.slots] } : { id: uid(), name: '', subtitle: '', slots: [] });
  const save = async () => {
    const program = ProgramSchema.parse(draft);
    await commit(s => ({ ...s, programs: original ? s.programs.map(p => p.id === id ? program : p) : [...s.programs, program], settings: { ...s.settings, programId: s.settings.programId ?? program.id } }));
    nav.close(); nav.toast('Program saved');
  };
  return <Sheet title={id ? 'Edit program' : 'New program'} footer={<Button title="Save program" disabled={!draft.name.trim()} onPress={() => void safely(save, nav.toast)} />}>
    <Input label="Program name" placeholder="e.g. My next eight weeks" maxLength={100} value={draft.name} onChangeText={name => setDraft({ ...draft, name })} />
    <Input label="Description" placeholder="What this program is for" maxLength={150} value={draft.subtitle} onChangeText={subtitle => setDraft({ ...draft, subtitle })} />
    <Section title="Scheduled workouts" />
    {draft.slots.map(slot => <Card key={slot.id} style={{ gap: 14 }}>
      <Row><T style={{ flex: 1, fontFamily: fonts.bold }}>{state.workouts.find(w => w.id === slot.workoutId)?.name}</T><IconButton icon={Trash2} label="Remove scheduled workout" color={C.muted} onPress={() => setDraft({ ...draft, slots: draft.slots.filter(s => s.id !== slot.id) })} /></Row>
      <Row style={{ flexWrap: 'wrap', gap: 6 }}>{[1, 2, 3, 4, 5, 6, 0].map(day => <Chip key={day} title={weekdayNames[day]!} selected={slot.day === day} onPress={() => setDraft({ ...draft, slots: draft.slots.map(s => s.id === slot.id ? { ...s, day } : s) })} />)}</Row>
    </Card>)}
    <AddButton title="Link existing workout" onPress={() => nav.open(<WorkoutPicker onPick={workoutId => setDraft(current => ({ ...current, slots: [...current.slots, { id: uid(), workoutId, day: 1 }] }))} />)} />
    <T muted style={{ fontSize: 12, lineHeight: 20 }}>A linked workout can belong to any number of programs. Your logged sessions keep their own history.</T>
    {original && <Button title="Delete program" variant="danger" icon={Trash2} onPress={() => confirm('Delete this program?', 'Workout templates and training history will be kept.', () => void safely(async () => {
      await commit(s => ({ ...s, programs: s.programs.filter(p => p.id !== id), settings: { ...s.settings, programId: s.settings.programId === id ? null : s.settings.programId } }));
      nav.close(); nav.toast('Program deleted');
    }, nav.toast), true)} />}
  </Sheet>;
}
