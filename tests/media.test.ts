import { afterEach, describe, expect, it, vi } from 'vitest';
import { canRefreshMedia, findTutorial, googleImagesUrl, thumbnailFor, tutorialFor, youtubeId } from '../src/media';
import { defaultExercises } from '../src/seed';

afterEach(() => vi.unstubAllGlobals());
describe('exercise media', () => {
  it('supplies a default tutorial and thumbnail for every built-in exercise without stored media or a key', () => {
    for (const exercise of defaultExercises) {
      expect(exercise.videoId).toBeUndefined();
      const tutorial = tutorialFor(exercise);
      expect(tutorial?.videoId, exercise.name).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(tutorial?.videoTitle, exercise.name).toBeTruthy();
      expect(thumbnailFor(exercise), exercise.name).toBe(`https://i.ytimg.com/vi/${tutorial!.videoId}/mqdefault.jpg`);
    }
  });
  it('preserves manual overrides and explicit removal while allowing automatic media to refresh', () => {
    const builtin = defaultExercises[0]!;
    const custom = { ...builtin, videoId: 'dQw4w9WgXcQ', videoTitle: 'My selection', videoSource: 'manual' as const };
    expect(tutorialFor(custom)).toEqual({ videoId: custom.videoId, videoTitle: 'My selection' });
    expect(canRefreshMedia(custom)).toBe(false);
    expect(canRefreshMedia({ ...custom, videoSource: undefined })).toBe(false);
    expect(canRefreshMedia({ ...custom, videoSource: 'automatic' })).toBe(true);
    expect(tutorialFor({ ...builtin, hideDefaultVideo: true })).toBeUndefined();
    expect(canRefreshMedia({ ...builtin, hideDefaultVideo: true })).toBe(false);
    expect(tutorialFor({ ...builtin, id: 'my-custom-movement' })).toBeUndefined();
  });
  it('accepts supported YouTube URLs and rejects lookalike or non-web URLs', () => {
    const id = 'dQw4w9WgXcQ';
    for (const value of [id, `https://youtu.be/${id}`, `https://www.youtube.com/watch?v=${id}&t=20`, `https://youtube.com/shorts/${id}`]) expect(youtubeId(value)).toBe(id);
    expect(youtubeId(`https://youtube.com.evil.example/watch?v=${id}`)).toBeUndefined();
    expect(youtubeId(`javascript://youtube.com/watch?v=${id}`)).toBeUndefined();
    expect(youtubeId('not a video')).toBeUndefined();
  });
  it('uses the official short embeddable search with a credential header, not a scraped page', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: { videoId: 'dQw4w9WgXcQ' }, snippet: { title: 'Proper form' } }] }) });
    vi.stubGlobal('fetch', fetch);
    const result = await findTutorial(defaultExercises[0]!, 'test-key');
    expect(result.videoId).toBe('dQw4w9WgXcQ');
    expect(fetch.mock.calls[0]![0]).toContain('videoDuration=short');
    expect(fetch.mock.calls[0]![0]).toContain('videoEmbeddable=true');
    expect(fetch.mock.calls[0]![0]).not.toContain('test-key');
    expect(fetch.mock.calls[0]![1].headers['X-Goog-Api-Key']).toBe('test-key');
    expect(googleImagesUrl(defaultExercises[0]!)).toContain('tbm=isch');
  });
  it('requires an API key and reports quota failures without inserting fake tutorials', async () => {
    await expect(findTutorial(defaultExercises[0]!, '')).rejects.toThrow('API key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(findTutorial(defaultExercises[0]!, 'test-key')).rejects.toThrow('quota');
  });
});
