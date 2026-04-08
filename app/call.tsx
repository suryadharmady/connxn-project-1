import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { endConversation } from '@/services/tavusApi';
import { useTheme } from '@/contexts/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '@/constants/theme';

const WebView = Platform.OS !== 'web' ? require('react-native-webview').default : null;

/*
 * Injected JS for WebView (native only).
 *
 * Phase 1 (pre-join): Do nothing. Let Tavus/Daily hair check render fully.
 * Phase 2 (in-call, 2+ videos): Post 'call-active', hide Daily chrome, restyle self-view.
 * Phase 3 (call ended, was active then videos drop to 0): Post 'call-ended'.
 */
const INJECT_JS = `
(function(){
  var cssId='__connxn_css';
  var wasActive=false;
  var endNotified=false;
  var activeNotified=false;

  function check(){
    var videoCount=document.querySelectorAll('video').length;

    /* Phase 2 entry: call just became active */
    if(videoCount>=2 && !wasActive){
      wasActive=true;
      activeNotified=true;
      if(window.ReactNativeWebView){
        window.ReactNativeWebView.postMessage('call-active');
      }
    }

    /* Phase 3: call ended */
    if(wasActive && videoCount===0 && !endNotified){
      endNotified=true;
      if(window.ReactNativeWebView){
        window.ReactNativeWebView.postMessage('call-ended');
      }
      return;
    }

    /* Phase 2: in-call CSS */
    if(videoCount>=2 && !document.getElementById(cssId)){
      var s=document.createElement('style');s.id=cssId;
      s.textContent=\`
        body,html{margin:0!important;padding:0!important;overflow:hidden!important;background:#000!important}
        .daily-tray,[class*="tray"],
        [data-testid="controls"],[data-testid="tray"],
        [class*="controlBar"],[class*="control-bar"],
        [class*="bottomBar"],[class*="bottom-bar"],
        button[aria-label="People"],
        button[aria-label="Share"],button[aria-label="Captions"],
        button[aria-label="More"],button[aria-label="Play test sound"],
        [class*="displayName"],[class*="participantName"],[class*="nameTag"]{
          display:none!important;
        }
        .daily-video-tile-self,
        [class*="self-view"],[class*="selfView"],[class*="SelfView"],
        [class*="local-tile"],[class*="localTile"],
        [data-testid="local-tile"],
        [class*="LocalVideo"],[class*="localVideo"],[class*="local-video"]{
          position:fixed!important;top:60px!important;right:12px!important;
          width:90px!important;height:130px!important;
          border-radius:12px!important;overflow:hidden!important;
          z-index:999!important;
          border:1.5px solid rgba(255,255,255,0.2)!important;
          box-shadow:0 4px 20px rgba(0,0,0,0.5)!important;
        }
        .daily-video-tile-self video,
        [data-testid="local-tile"] video,
        [class*="self-view"] video,[class*="selfView"] video,
        [class*="SelfView"] video,[class*="local-tile"] video,
        [class*="localTile"] video,
        [class*="LocalVideo"] video,[class*="localVideo"] video,
        [class*="local-video"] video{
          width:100%!important;height:100%!important;object-fit:cover!important;
        }
        .daily-video-tile:not(.daily-video-tile-self),
        [class*="videoContainer"],[class*="video-container"],[class*="VideoContainer"],
        main,[role="main"],.daily-call-wrapper,.daily-videos-wrapper,
        [class*="CallWrapper"],[class*="call-wrapper"],
        [class*="VideosWrapper"],[class*="videos-wrapper"],
        [class*="stage"],[class*="Stage"]{
          width:100vw!important;height:100vh!important;
          position:fixed!important;top:0!important;left:0!important;
          border-radius:0!important;margin:0!important;padding:0!important;z-index:1!important;
        }
        video{object-fit:cover!important}
      \`;
      document.head.appendChild(s);
    }
  }

  setInterval(check,1500);
  true;
})();
`;

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
export default function CallScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { conversationId, conversationUrl } = useLocalSearchParams<{
    conversationId: string;
    conversationUrl: string;
  }>();

  const [callActive, setCallActive] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const startTimeRef = useRef(Date.now());

  // Web: refs for Daily.co call frame
  const containerRef = useRef<HTMLDivElement>(null);
  const callFrameRef = useRef<any>(null);

  const handleLeave = useCallback(async () => {
    if (!callActive) return;
    setCallActive(false);
    setIsLeaving(true);
    const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
    if (Platform.OS === 'web' && callFrameRef.current) {
      try { callFrameRef.current.destroy(); } catch {}
      callFrameRef.current = null;
    }
    try { if (conversationId) await endConversation(conversationId); } catch {}
    router.replace({ pathname: '/call-ended', params: { duration: String(secs) } });
  }, [callActive, conversationId, router]);

  // Native: receive messages from injected JS
  const handleMessage = useCallback((event: any) => {
    const data = event.nativeEvent?.data;
    if (data === 'call-active') {
      setIsCallActive(true);
      startTimeRef.current = Date.now();
    }
    if (data === 'call-ended') {
      handleLeave();
    }
  }, [handleLeave]);

  // Web: create Daily.co call frame via JS SDK and listen for left-meeting
  useEffect(() => {
    if (Platform.OS !== 'web' || !conversationUrl || isLeaving) return;

    let destroyed = false;

    (async () => {
      try {
        const DailyIframe = (await import('@daily-co/daily-js')).default;
        if (destroyed || !containerRef.current) return;

        const frame = DailyIframe.createFrame(containerRef.current, {
          iframeStyle: { width: '100%', height: '100%', border: 'none' },
          showLeaveButton: true,
          showFullscreenButton: false,
        });

        callFrameRef.current = frame;

        frame.on('left-meeting', () => { if (!destroyed) handleLeave(); });
        frame.on('error', () => { if (!destroyed) handleLeave(); });

        await frame.join({ url: conversationUrl });
      } catch (err) {
        console.error('[Daily] Failed to create frame:', err);
      }
    })();

    return () => {
      destroyed = true;
      if (callFrameRef.current) {
        try { callFrameRef.current.destroy(); } catch {}
        callFrameRef.current = null;
      }
    };
  }, [conversationUrl, isLeaving, handleLeave]);

  if (!conversationUrl) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={[styles.errorText, { color: colors.danger }]}>No conversation URL</Text>
        <Pressable
          style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          onPress={() => router.replace('/')}
        >
          <Text style={[styles.backBtnText, { color: colors.textPrimary }]}>Go Home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {!isLeaving && (
        Platform.OS === 'web' ? (
          /* Web: Daily.co JS SDK renders its own iframe into this container */
          <div
            ref={containerRef as any}
            style={{
              position: 'absolute' as const, inset: 0,
              width: '100%', height: '100%',
              backgroundColor: '#000',
            }}
          />
        ) : (
          /* Mobile: fullscreen WebView — Daily.co hair check handles pre-join */
          <WebView
            source={{ uri: conversationUrl }}
            style={StyleSheet.absoluteFill}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            mediaCapturePermissionGrantType="grant"
            androidHardwareAccelerationDisabled={false}
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures={false}
            onPermissionRequest={(req: any) => req.grant(req.resources)}
            injectedJavaScript={INJECT_JS}
            onMessage={handleMessage}
            onError={(e: any) => console.warn('[WebView]', e.nativeEvent?.description)}
          />
        )
      )}

      {/* Mobile: floating End Call button — only visible when call is active */}
      {Platform.OS !== 'web' && isCallActive && !isLeaving && (
        <View style={styles.endCallOverlay}>
          <Pressable
            onPress={handleLeave}
            style={({ pressed }) => [
              styles.endCallBtn,
              pressed && { opacity: 0.7, transform: [{ scale: 0.9 }] },
            ]}
          >
            <Ionicons name="call" size={24} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>
          <Text style={styles.endCallLabel}>End Call</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  /* Mobile: floating end call overlay */
  endCallOverlay: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  endCallBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  endCallLabel: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  /* Error state */
  errorContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: Spacing.lg, gap: Spacing.md,
  },
  errorText: { fontSize: FontSize.lg },
  backBtn: {
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md, borderWidth: 1,
  },
  backBtnText: { fontSize: FontSize.md },
});
