import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CallTimer } from '@/components/CallTimer';
import { endConversation } from '@/services/tavusApi';
import { useTheme } from '@/contexts/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '@/constants/theme';

const WebView = Platform.OS !== 'web' ? require('react-native-webview').default : null;

/*
 * Injected JS for WebView (native only).
 * Only detects when the call ends (videos drop to 0 after being active).
 * Daily.co renders its own UI completely untouched.
 */
const INJECT_JS = `
(function(){
  var wasActive=false;
  var endNotified=false;
  var startTime=Date.now();

  function notifyEnd(){
    if(endNotified) return;
    endNotified=true;
    if(window.ReactNativeWebView){
      window.ReactNativeWebView.postMessage('call-ended');
    }
  }

  /* Approach 1a: video count detection */
  function check(){
    var videoCount=document.querySelectorAll('video').length;
    console.log('[INJECT_JS] videoCount='+videoCount+' wasActive='+wasActive);
    if(videoCount>=2) wasActive=true;
    if(wasActive && videoCount===0 && !endNotified && (Date.now()-startTime)>5000){
      setTimeout(function(){
        if(document.querySelectorAll('video').length===0){
          notifyEnd();
        }
      },3000);
    }
  }

  /* Approach 1b: listen for Daily.co left-meeting event inside WebView */
  window.addEventListener('message',function(e){
    try{
      var d=typeof e.data==='string'?JSON.parse(e.data):e.data;
      if(d&&(d.action==='left-meeting'||d.action==='meeting-ended')){
        notifyEnd();
      }
    }catch(err){}
  });

  setInterval(check,1500);
  true;
})();
`;

export default function CallScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { conversationId, conversationUrl } = useLocalSearchParams<{
    conversationId: string;
    conversationUrl: string;
  }>();

  const [callActive, setCallActive] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
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

  // Native: receive call-ended from injected JS
  const handleMessage = useCallback((event: any) => {
    if (event.nativeEvent?.data === 'call-ended') {
      handleLeave();
    }
  }, [handleLeave]);

  // Web: create Daily.co call frame via JS SDK and listen for left-meeting
  useEffect(() => {
    if (Platform.OS !== 'web' || !conversationUrl || isLeaving) return;

    let destroyed = false;

    // Fallback: force dismiss connecting overlay after 8s
    const fallback = setTimeout(() => setIsConnecting(false), 8000);

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

        frame
          .on('joined-meeting', () => { if (!destroyed) setIsConnecting(false); })
          .on('left-meeting', () => { if (!destroyed) handleLeave(); })
          .on('error', () => { if (!destroyed) handleLeave(); });

        await frame.join({ url: conversationUrl });
      } catch (err) {
        console.error('[Daily] Failed to create frame:', err);
        setIsConnecting(false);
      }
    })();

    return () => {
      destroyed = true;
      clearTimeout(fallback);
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
          <div
            ref={containerRef as any}
            style={{
              position: 'absolute' as const, inset: 0,
              width: '100%', height: '100%',
              backgroundColor: '#000',
            }}
          />
        ) : (
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
            onPermissionRequest={(req: any) => req.grant(req.resources)}
            injectedJavaScript={INJECT_JS}
            onMessage={handleMessage}
            onLoadEnd={() => setIsConnecting(false)}
            onNavigationStateChange={(navState: any) => {
              const url = (navState.url || '').toLowerCase();
              if (url && !url.includes('daily.co') && !url.includes('tavus')) {
                handleLeave();
              }
            }}
            onError={(e: any) => console.warn('[WebView]', e.nativeEvent?.description)}
          />
        )
      )}

      {/* Connecting overlay */}
      {isConnecting && !isLeaving && (
        <View style={styles.connectingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.connectingText}>Connecting...</Text>
        </View>
      )}

      {/* Call timer pill */}
      {!isLeaving && (
        <View style={styles.timerPill}>
          <CallTimer isRunning={callActive} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  timerPill: {
    position: 'absolute',
    top: Spacing.md,
    alignSelf: 'center',
    zIndex: 999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  connectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 998,
  },
  connectingText: {
    color: '#fff',
    fontSize: FontSize.md,
    marginTop: Spacing.md,
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
