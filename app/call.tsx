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
 * Phase 1 (pre-join): Do nothing. Let Tavus/Daily render fully.
 * Phase 2 (in-call, 2+ videos): Hide Daily chrome, restyle self-view.
 * Phase 3 (call ended, was active then videos drop to 0): Notify RN.
 */
const INJECT_JS = `
(function(){
  var cssId='__connxn_css';
  var wasActive=false;
  var endNotified=false;

  function check(){
    var videoCount=document.querySelectorAll('video').length;

    if(videoCount>=2) wasActive=true;

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

/* ------------------------------------------------------------------ */
/*  Native camera preview for pre-join                                 */
/* ------------------------------------------------------------------ */
function NativeCameraPreview() {
  const [Cam, setCam] = useState<any>(null);
  useEffect(() => {
    let mounted = true;
    import('expo-camera')
      .then((mod) => { if (mounted) setCam(() => mod.CameraView); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);
  if (!Cam) return <View style={{ flex: 1, backgroundColor: '#111' }} />;
  return <Cam style={{ flex: 1 }} facing="front" />;
}

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
  const [hasJoined, setHasJoined] = useState(false); // mobile: gate before loading WebView
  const startTimeRef = useRef(Date.now());

  const handleLeave = useCallback(async () => {
    if (!callActive) return;
    setCallActive(false);
    setIsLeaving(true);
    const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
    try { if (conversationId) await endConversation(conversationId); } catch {}
    router.replace({ pathname: '/call-ended', params: { duration: String(secs) } });
  }, [callActive, conversationId, router]);

  // Native: receive "call-ended" from injected JS
  const handleMessage = useCallback((event: any) => {
    if (event.nativeEvent?.data === 'call-ended') {
      handleLeave();
    }
  }, [handleLeave]);

  // Web: listen for Daily.co postMessage events signalling call ended
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handler = (event: MessageEvent) => {
      // Only process messages from Daily.co or Tavus origins
      const origin = event.origin || '';
      if (!origin.includes('daily') && !origin.includes('tavus')) return;

      const d = event.data;
      if (!d) return;

      // Daily.co sends { action: 'left-meeting' } or similar typed objects
      if (typeof d === 'object' && d !== null) {
        const action = d.action || d.type || '';
        if (
          action === 'left-meeting' ||
          action === 'meeting-ended' ||
          action === 'call-ended' ||
          action === 'error'
        ) {
          handleLeave();
          return;
        }
      }

      // Fallback: string data
      if (typeof d === 'string') {
        if (d.includes('left-meeting') || d.includes('meeting-ended') || d.includes('call-ended')) {
          handleLeave();
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [handleLeave]);

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
          <iframe
            src={conversationUrl}
            allow="camera *; microphone *; autoplay *; display-capture *"
            style={{
              position: 'absolute' as const, inset: 0,
              width: '100%', height: '100%', border: 'none',
              backgroundColor: '#000',
            }}
          />
        ) : !hasJoined ? (
          /* ---- Mobile pre-join: native camera preview, no WebView ---- */
          <>
            <View style={styles.webviewArea}>
              <NativeCameraPreview />
            </View>
            <View style={styles.mobileBottomBar}>
              <Pressable
                onPress={() => router.replace('/')}
                style={[styles.mobileBackBtn, { borderColor: 'rgba(255,255,255,0.2)' }]}
              >
                <Ionicons name="arrow-back" size={18} color="#fff" />
                <Text style={styles.mobileBackText}>Back</Text>
              </Pressable>
              <Pressable
                onPress={() => { setHasJoined(true); startTimeRef.current = Date.now(); }}
                style={styles.mobileJoinBtn}
              >
                <Ionicons name="videocam" size={18} color="#fff" />
                <Text style={styles.mobileJoinText}>Join Call</Text>
              </Pressable>
            </View>
          </>
        ) : (
          /* ---- Mobile in-call: WebView with Daily.co ---- */
          <>
            <View style={styles.webviewArea}>
              <WebView
                source={{ uri: conversationUrl }}
                style={{ flex: 1 }}
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
            </View>
            <View style={styles.mobileBottomBar}>
              <Pressable
                onPress={() => router.replace('/')}
                style={[styles.mobileBackBtn, { borderColor: 'rgba(255,255,255,0.2)' }]}
              >
                <Ionicons name="arrow-back" size={18} color="#fff" />
                <Text style={styles.mobileBackText}>Back</Text>
              </Pressable>
              <Pressable
                onPress={handleLeave}
                style={styles.mobileEndBtn}
              >
                <Ionicons name="call" size={18} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
                <Text style={styles.mobileEndText}>End Call</Text>
              </Pressable>
            </View>
          </>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  webviewArea: {
    flex: 1,
  },
  mobileBottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  mobileBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  mobileBackText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  mobileJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#22C55E',
  },
  mobileJoinText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  mobileEndBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#EF4444',
  },
  mobileEndText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
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
