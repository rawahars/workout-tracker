import React from 'react';

export default function Tutorial({ videoId }: { videoId: string }) {
  return <iframe title="Exercise tutorial" src={`https://www.youtube.com/embed/${videoId}`} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen style={{ width: '100%', height: 220, border: 0, borderRadius: 16 }} />;
}
