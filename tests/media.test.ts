import { afterEach, describe, expect, it, vi } from 'vitest';
import { findTutorial, googleImagesUrl, youtubeId } from '../src/media';
import { defaultExercises } from '../src/seed';

afterEach(() => vi.unstubAllGlobals());
describe('exercise media', () => {
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
