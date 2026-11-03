import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, View } from 'react-native';
import { ArrowLeftRight, ChevronRight, Edit3, ExternalLink, ImagePlus, Play, Plus, Search, Sparkles } from './icons';
import * as ImagePicker from 'expo-image-picker';
import { Exercise, ExerciseSchema, equipmentTypes, modes, muscles, patterns } from './model';
import { alternatives, fmt, previousSets, uid } from './domain';
import { commit, useStore } from './store';
import { getSecret, saveImage } from './platform';
import { findTutorial, googleImagesUrl, youtubeId, youtubeSearchUrl } from './media';
import { Artwork, Button, C, Card, Chip, Empty, IconButton, Input, Label, Row, Section, Sheet, T, fonts, openUrl, safely, useNav } from './ui';
import Tutorial from './Tutorial';

function ExerciseList({ onPick, alternativeTo }: { onPick?: (exercise: Exercise) => void; alternativeTo?: Exercise }) {
  const state = useStore();
  const nav = useNav();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('All');
  const deferred = useDeferredValue(query);
  const filtered = useMemo(() => {
    const all = alternativeTo ? alternatives(state, alternativeTo) : state.exercises;
    return all.filter(e => (muscle === 'All' || e.muscle === muscle) && `${e.name} ${e.equipment} ${e.pattern}`.toLowerCase().includes(deferred.toLowerCase()));
  }, [state, alternativeTo, muscle, deferred]);
  return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: 22, gap: 14, paddingBottom: 14 }}>
      {!onPick && <Row style={{ justifyContent: 'space-between', marginTop: 6 }}><View style={{ gap: 7 }}><Label color={C.lime}>Your movement library</Label><T style={{ fontFamily: fonts.display, fontSize: 32 }}>Find your form.</T></View><IconButton icon={Plus} label="Create exercise" color={C.lime} onPress={() => nav.open(<ExerciseEditor />)} /></Row>}
      {alternativeTo && <T muted>Same primary muscle, movement pattern and tracking type. Choose a comfortable variation.</T>}
      <Row style={{ backgroundColor: C.raised, borderRadius: 15, paddingLeft: 14 }}><Search color={C.muted} size={19} /><View style={{ flex: 1, minWidth: 0 }}><Input accessibilityLabel="Search exercises" placeholder="Search movements or equipment" value={query} onChangeText={setQuery} style={{ borderWidth: 0, minWidth: 0 }} /></View></Row>
      {!alternativeTo && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{['All', ...muscles].map(value => <Chip key={value} title={value} selected={muscle === value} onPress={() => setMuscle(value)} />)}</ScrollView>}
      <Row style={{ justifyContent: 'space-between' }}><Label>{filtered.length} movements</Label>{onPick && <Button title="New exercise" icon={Plus} small variant="ghost" onPress={() => nav.open(<ExerciseEditor onCreated={exercise => { onPick(exercise); }} />)} />}</Row>
    </View>
    <FlatList
      data={filtered} keyExtractor={e => e.id} keyboardShouldPersistTaps="handled"
      initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5}
      contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 30, gap: 8 }}
      ListEmptyComponent={<Empty title="No matching movements" description={alternativeTo ? 'No close substitutes are in your library yet. Add a suitable exercise first.' : 'Try another search or add your own exercise.'} />}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={onPick ? `Select ${item.name}` : `View ${item.name}`} onPress={() => onPick ? onPick(item) : nav.open(<ExerciseDetail id={item.id} />)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 18, padding: 12, opacity: pressed ? 0.6 : 1 })}>
        <Artwork exercise={item} /><View style={{ flex: 1, gap: 5 }}><T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{item.name}</T><T muted style={{ fontSize: 11 }}>{item.muscle} · {item.equipment}</T></View>{onPick ? <Plus size={19} color={C.lime} /> : <ChevronRight size={17} color={C.muted} />}
      </Pressable>}
    />
  </View>;
}
export function ExploreScreen() { return <ExerciseList />; }
export function ExercisePicker({ onPick, alternativeTo }: { onPick: (exercise: Exercise) => void; alternativeTo?: Exercise }) {
  const { close } = useNav();
  return <Sheet title={alternativeTo ? 'Find an alternative' : 'Add exercise'} scroll={false}><ExerciseList alternativeTo={alternativeTo} onPick={e => { close(); onPick(e); }} /></Sheet>;
}
export function ExerciseDetail({ id }: { id: string }) {
  const state = useStore();
  const exercise = state.exercises.find(e => e.id === id)!;
  const nav = useNav();
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const requested = useRef(false);
  const previous = previousSets(state, id);
  const search = async () => {
    setBusy(true);
    try {
      const key = await getSecret('youtube-key');
      if (!key) { nav.toast('Add a YouTube API key in Settings, or choose a link in Edit exercise.'); return; }
      const result = await findTutorial(exercise, key);
      await commit(current => ({ ...current, exercises: current.exercises.map(e => e.id === id ? { ...e, ...result } : e) }));
    } finally { setBusy(false); }
  };
  useEffect(() => {
    if (exercise.videoId || requested.current) return;
    requested.current = true;
    void getSecret('youtube-key').then(key => { if (key) return safely(search, nav.toast); }).catch(() => undefined);
  // A tutorial lookup is attempted once per detail visit, not on every state update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const alternativesList = alternatives(state, exercise);
  return <Sheet title="Movement">
    <Row style={{ justifyContent: 'space-between' }}><Artwork exercise={exercise} size={104} /><IconButton icon={Edit3} label="Edit exercise" onPress={() => nav.open(<ExerciseEditor id={id} />)} /></Row>
    <View style={{ gap: 9 }}><Label color={C.lime}>{exercise.muscle} / {exercise.equipment}</Label><T style={{ fontFamily: fonts.display, fontSize: 30 }}>{exercise.name}</T><T muted>{exercise.pattern}{exercise.perSide ? ' · Repetitions / duration per side' : ''}</T></View>
    {!!exercise.notes && <Card><T style={{ lineHeight: 23 }}>{exercise.notes}</T></Card>}
    {previous.length > 0 && <Card style={{ gap: 10 }}><Label>Last completed sets</Label><T>{previous.map(s => exercise.mode === 'weight' ? `${fmt(s.weight)} kg × ${s.reps}` : exercise.mode === 'reps' ? `${s.reps} reps` : `${s.seconds} sec`).join('   /   ')}</T></Card>}
    <Section title="See the movement" />
    {exercise.videoId ? playing ? <Tutorial videoId={exercise.videoId} /> : <Pressable accessibilityRole="button" accessibilityLabel="Play exercise tutorial" onPress={() => setPlaying(true)} style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: C.card }}>
      <Image source={{ uri: `https://i.ytimg.com/vi/${exercise.videoId}/hqdefault.jpg` }} style={{ height: 180, width: '100%' }} />
      <Row style={{ padding: 16 }}><Play size={20} color={C.lime} /><T style={{ flex: 1 }}>{exercise.videoTitle ?? 'Watch tutorial'}</T></Row>
    </Pressable> : <Card style={{ gap: 14 }}><T muted>No tutorial selected yet.</T><Button title={busy ? 'Finding tutorial…' : 'Find short tutorial'} icon={Sparkles} disabled={busy} onPress={() => void safely(search, nav.toast)} /></Card>}
    <Button title={exercise.videoId ? 'Open in YouTube' : 'Browse YouTube'} icon={ExternalLink} variant="secondary" onPress={() => openUrl(exercise.videoId ? `https://www.youtube.com/watch?v=${exercise.videoId}` : youtubeSearchUrl(exercise), nav.toast)} />
    <Section title="Similar movements" />
    {alternativesList.length ? alternativesList.map(e => <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`View ${e.name}`} onPress={() => nav.open(<ExerciseDetail id={e.id} />)}><Card><Row><Artwork exercise={e} size={44} /><T style={{ flex: 1 }}>{e.name}</T><ArrowLeftRight size={18} color={C.muted} /></Row></Card></Pressable>) : <T muted>No close alternatives in your library yet.</T>}
  </Sheet>;
}
export function ExerciseEditor({ id, onCreated }: { id?: string; onCreated?: (exercise: Exercise) => void }) {
  const state = useStore();
  const original = state.exercises.find(e => e.id === id);
  const [draft, setDraft] = useState<Exercise>(original ?? { id: uid(), name: '', muscle: 'Chest', equipment: 'Dumbbell', mode: 'weight', pattern: 'Horizontal push', perSide: false, notes: '' });
  const [video, setVideo] = useState(original?.videoId ? `https://youtu.be/${original.videoId}` : '');
  const [busy, setBusy] = useState(false);
  const nav = useNav();
  const chooseImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.5, base64: true });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset?.base64) return;
    if (asset.base64.length > 2_500_000) throw new Error('Choose a smaller image (under about 2 MB).');
    const image = uid();
    await saveImage(image, `data:image/jpeg;base64,${asset.base64}`);
    setDraft(current => ({ ...current, image }));
  };
  const save = async () => {
    if (video.trim() && !youtubeId(video)) throw new Error('Enter a valid YouTube video link.');
    const selectedId = video.trim() ? youtubeId(video) : undefined;
    const exercise = ExerciseSchema.parse({ ...draft, videoId: selectedId, videoTitle: selectedId === draft.videoId ? draft.videoTitle : 'Exercise tutorial', videoFetchedAt: selectedId === draft.videoId ? draft.videoFetchedAt : undefined });
    await commit(current => ({ ...current, exercises: original ? current.exercises.map(e => e.id === id ? exercise : e) : [...current.exercises, exercise] }));
    nav.close();
    onCreated?.(exercise);
    nav.toast('Exercise saved');
  };
  return <Sheet title={id ? 'Edit exercise' : 'New exercise'} footer={<Button title="Save exercise" disabled={!draft.name.trim() || busy} onPress={() => void safely(save, nav.toast)} />}>
    <Input label="Exercise name" placeholder="e.g. Goblet squat" value={draft.name} maxLength={100} onChangeText={name => setDraft({ ...draft, name })} />
    <Label>Primary muscle</Label><Row style={{ flexWrap: 'wrap', gap: 8 }}>{muscles.map(muscle => <Chip key={muscle} title={muscle} selected={draft.muscle === muscle} onPress={() => setDraft({ ...draft, muscle })} />)}</Row>
    <Label>Equipment</Label><Row style={{ flexWrap: 'wrap', gap: 8 }}>{equipmentTypes.map(equipment => <Chip key={equipment} title={equipment} selected={draft.equipment === equipment} onPress={() => setDraft({ ...draft, equipment })} />)}</Row>
    <Label>Movement pattern</Label><Row style={{ flexWrap: 'wrap', gap: 8 }}>{patterns.map(pattern => <Chip key={pattern} title={pattern} selected={draft.pattern === pattern} onPress={() => setDraft({ ...draft, pattern })} />)}</Row>
    <Label>Track by</Label><Row style={{ flexWrap: 'wrap', gap: 8 }}>{modes.map(mode => <Chip key={mode} title={{ weight: 'Weight + reps', reps: 'Reps', seconds: 'Seconds', cardio: 'Minutes + km' }[mode]} selected={draft.mode === mode} onPress={() => setDraft({ ...draft, mode })} />)}</Row>
    <Chip title="Record per side" selected={draft.perSide} onPress={() => setDraft({ ...draft, perSide: !draft.perSide })} />
    <Input label="Your notes" placeholder="Setup or technique notes" multiline value={draft.notes} maxLength={4000} onChangeText={notes => setDraft({ ...draft, notes })} />
    <Section title="Exercise image" /><Artwork exercise={draft} size={112} />
    <Row><View style={{ flex: 1 }}><Button title="Google Images" variant="secondary" icon={Search} disabled={!draft.name.trim()} onPress={() => openUrl(googleImagesUrl(draft), nav.toast)} /></View><View style={{ flex: 1 }}><Button title="Choose image" variant="secondary" icon={ImagePlus} onPress={() => void safely(chooseImage, nav.toast)} /></View></Row>
    <T muted style={{ fontSize: 12, lineHeight: 19 }}>Find an image you can use, save it to Photos, then choose it here.</T>
    <Input label="YouTube video" placeholder="Paste a YouTube link" autoCapitalize="none" autoCorrect={false} value={video} onChangeText={setVideo} />
    <Button title={busy ? 'Finding…' : 'Auto-find short video'} icon={Sparkles} variant="secondary" disabled={!draft.name.trim() || busy} onPress={() => void safely(async () => {
      setBusy(true);
      try {
        const key = await getSecret('youtube-key');
        const result = await findTutorial(draft, key ?? '');
        setVideo(`https://youtu.be/${result.videoId}`);
        setDraft(current => ({ ...current, ...result }));
      } finally { setBusy(false); }
    }, nav.toast)} />
  </Sheet>;
}
