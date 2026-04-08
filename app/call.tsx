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
 * Only detects when the call ends (videos drop to 0 after being active).
 * Daily.co renders its own UI completely untouched.
 */
const INJECT_JS = `
(function(){
  var wasActive=false;
  var endNotified=false;
  var startTime=Date.now();

  function check(){
    var videoCount=document.querySelectorAll('video').length;
    console.log('[INJECT_JS] videoCount='+videoCount+' wasActive='+wasActive);
    if(videoCount>=2) wasActive=true;
    if(wasActive && videoCount===0 && !endNotified && (Date.now()-startTime)>15000){
      endNotified=true;
      setTimeout(function(){
        if(document.querySelectorAll('video').length===0){
          if(window.ReactNativeWebView){
            window.ReactNativeWebView.postMessage('call-ended');
          }
        }
      },3000);
    }
  }

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
            onError={(e: any) => console.warn('[WebView]', e.nativeEvent?.description)}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
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
