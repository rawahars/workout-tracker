import { Exercise } from './model';
import { defaultTutorials } from './default-tutorials';

export class NoTutorialError extends Error {}

export function tutorialFor(exercise: Exercise): { videoId: string; videoTitle: string } | undefined {
  if (exercise.videoId) return { videoId: exercise.videoId, videoTitle: exercise.videoTitle || 'Exercise tutorial' };
  if (!exercise.hideDefaultVideo) return defaultTutorials[exercise.id];
}
export function thumbnailFor(exercise: Exercise): string | undefined {
  const tutorial = tutorialFor(exercise);
  return tutorial ? `https://i.ytimg.com/vi/${tutorial.videoId}/mqdefault.jpg` : undefined;
}
export function canRefreshMedia(exercise: Exercise): boolean {
  // A saved video without source metadata may be an older manual selection.
  return !exercise.hideDefaultVideo && (!exercise.videoId || exercise.videoSource === 'automatic');
}

export function youtubeId(input: string): string | undefined {
  const value = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
    let result: string | null | undefined;
    if (url.hostname === 'youtu.be') result = url.pathname.split('/')[1];
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      result = url.searchParams.get('v') ?? (/^\/(?:shorts|embed)\//.test(url.pathname) ? url.pathname.split('/')[2] : undefined);
    }
    return result && /^[A-Za-z0-9_-]{11}$/.test(result) ? result : undefined;
  } catch { return; }
}
export const googleImagesUrl = (exercise: Exercise) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${exercise.name} exercise form`)}`;
export const youtubeSearchUrl = (exercise: Exercise) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name} proper form tutorial`)}`;
export async function findTutorial(exercise: Exercise, apiKey: string, signal?: AbortSignal): Promise<{ videoId: string; videoTitle: string; videoFetchedAt: number }> {
  if (!apiKey.trim()) throw new Error('Add a YouTube Data API key in Settings to enable automatic search.');
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoDuration: 'short', videoEmbeddable: 'true',
    safeSearch: 'strict', maxResults: '1', q: `${exercise.name} proper form exercise tutorial`,
  });
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
      headers: { 'X-Goog-Api-Key': apiKey.trim() }, signal: controller.signal,
    });
    if (!response.ok) throw new Error([400, 401, 403].includes(response.status) ? 'YouTube rejected the key or its quota was reached. Check the key and API access.' : 'YouTube search is unavailable. Try again later.');
    const data = await response.json() as { items?: { id?: { videoId?: string }; snippet?: { title?: string } }[] };
    const videoId = data.items?.[0]?.id?.videoId;
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new NoTutorialError('No short tutorial was found. Choose a YouTube link instead.');
    return { videoId, videoTitle: data.items?.[0]?.snippet?.title ?? 'Exercise tutorial', videoFetchedAt: Date.now() };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
