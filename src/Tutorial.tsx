import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function Tutorial({ videoId }: { videoId: string }) {
  return <View style={{ height: 220, overflow: 'hidden', borderRadius: 16 }}>
    <WebView
      source={{ uri: `https://www.youtube.com/embed/${videoId}?playsinline=1`, headers: { Referer: 'https://app.formworkout.personal/' } }}
      allowsInlineMediaPlayback allowsFullscreenVideo
      originWhitelist={['https://*']}
      mediaPlaybackRequiresUserAction
      style={{ backgroundColor: '#101411' }}
    />
  </View>;
}
