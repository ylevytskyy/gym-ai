import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { usePalette } from './kit';

/** The looping, silent demo of an exercise. If the video cannot load, the space simply stays empty. */
export function VideoDemo({ url, playing, label }: { url: string; playing: boolean; label: string }) {
  const palette = usePalette();
  const player = useVideoPlayer(url, (created) => {
    created.loop = true;
    created.muted = true;
    if (playing) created.play();
  });

  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);

  return (
    <View style={[styles.frame, { backgroundColor: palette.surface, borderColor: palette.border }]} accessible accessibilityLabel={`Demo: ${label}`} testID="video-demo">
      <VideoView player={player} style={styles.video} nativeControls={false} contentFit="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 1, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  video: { flex: 1 },
});
