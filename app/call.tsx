import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CallTimer } from '@/components/CallTimer';
import { endConversation } from '@/services/tavusApi';
import { useTheme } from '@/contexts/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { ElevenLabsAgent } from '@/services/elevenLabsAgent';
import { buildCallPageHtml } from '@/services/callPage';

const WebView = Platform.OS !== 'web' ? require('react-native-webview').default : null;

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

  // Native: receive messages from WebView
  const handleMessage = useCallback((event: any) => {
    const msg = event.nativeEvent?.data;
    if (!msg) return;
    if (msg === 'call-ended') {
      handleLeave();
    } else if (typeof msg === 'string' && msg.startsWith('LOG:')) {
      console.log('[WebView]', msg.slice(4));
    } else if (typeof msg === 'string' && msg.startsWith('WARN:')) {
      console.warn('[WebView]', msg.slice(5));
    }
  }, [handleLeave]);

  // Web: create Daily.co call frame, connect ElevenLabs Agent, bridge audio
  useEffect(() => {
    if (Platform.OS !== 'web' || !conversationUrl || isLeaving) return;

    let destroyed = false;
    const elAgent = new ElevenLabsAgent();
    let audioCtx: AudioContext | null = null;
    let micStream: MediaStream | null = null;
    let scriptNode: ScriptProcessorNode | null = null;
    let micSource: MediaStreamAudioSourceNode | null = null;
    // Gapless playback: tracks the next scheduled time for destNode output
    let nextPlayTime = 0;

    const agentId = process.env.EXPO_PUBLIC_ELEVENLABS_AGENT_ID ?? '';

    // Fallback: force dismiss connecting overlay after 8s
    const fallback = setTimeout(() => setIsConnecting(false), 8000);

    /* -------------------------------------------------------------- */
    /*  Audio helpers (web-only, all scoped inside this useEffect)     */
    /* -------------------------------------------------------------- */

    /** Downsample a Float32Array from srcRate to 16 kHz mono */
    function downsampleTo16k(buffer: Float32Array, srcRate: number): Float32Array {
      if (srcRate === 16000) return buffer;
      const ratio = srcRate / 16000;
      const newLen = Math.floor(buffer.length / ratio);
      const out = new Float32Array(newLen);
      for (let i = 0; i < newLen; i++) {
        out[i] = buffer[Math.floor(i * ratio)];
      }
      return out;
    }

    /** Float32 → 16-bit PCM → base64 */
    function float32ToBase64Pcm16(samples: Float32Array): string {
      const buf = new ArrayBuffer(samples.length * 2);
      const view = new DataView(buf);
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }

    /** Base64 PCM 16-bit → Float32Array */
    function base64PcmToFloat32(b64: string): Float32Array {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const view = new DataView(bytes.buffer);
      const samples = new Float32Array(bytes.length / 2);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = view.getInt16(i * 2, true) / 0x8000;
      }
      return samples;
    }

    /**
     * Schedule a PCM chunk into the destNode with gapless timing.
     * Each chunk is scheduled at exactly the end of the previous one
     * using precise audioContext.currentTime offsets — no gaps, no pops.
     * Audio is ONLY routed to destNode (→ Daily custom track → Tavus).
     * The user hears it through the Tavus participant's audio track.
     */
    function scheduleToDestNode(samples: Float32Array) {
      if (!audioCtx || !destNode || destroyed) return;
      const sr = elAgent.outputSampleRate || 24000;
      const abuf = audioCtx.createBuffer(1, samples.length, sr);
      abuf.copyToChannel(new Float32Array(samples), 0);
      const src = audioCtx.createBufferSource();
      src.buffer = abuf;
      src.connect(destNode);

      const now = audioCtx.currentTime;

      // If the queue stalled (nextPlayTime fell behind by >0.1s) or this is
      // the very first chunk, reset with a small lookahead buffer
      if (nextPlayTime < now - 0.1) {
        nextPlayTime = now + 0.02;
      }

      // Schedule exactly at the end of the previous chunk
      const startAt = Math.max(nextPlayTime, now + 0.01);
      src.start(startAt);
      nextPlayTime = startAt + abuf.duration;
    }

    /** Reset the gapless queue — call on interruption, new response, reconnect */
    function resetPlaybackQueue() {
      if (audioCtx) {
        nextPlayTime = audioCtx.currentTime;
      } else {
        nextPlayTime = 0;
      }
    }

    /* -------------------------------------------------------------- */
    /*  Set up Daily + ElevenLabs                                      */
    /* -------------------------------------------------------------- */

    // MediaStreamDestination for routing ElevenLabs audio into the Daily room
    let destNode: MediaStreamAudioDestinationNode | null = null;

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

        // Fix 3: Mute the Tavus replica's audio so the user doesn't hear
        // Tavus's own TTS voice (if it somehow still speaks in echo mode).
        frame.on('participant-joined', (event: any) => {
          if (destroyed) return;
          const p = event?.participant;
          if (!p || p.local) return;
          const name = (p.user_name || '').toLowerCase();
          if (name.includes('tavus') || name.includes('replica') || !p.owner) {
            console.log('[Daily] Muting Tavus participant:', p.user_name, p.session_id);
            try {
              frame.updateParticipant(p.session_id, { setAudio: false });
            } catch (err) {
              console.warn('[Daily] Failed to mute Tavus participant:', err);
            }
          }
        });

        frame
          .on('joined-meeting', () => {
            if (destroyed) return;
            setIsConnecting(false);
            console.log('[Daily] Joined meeting — starting ElevenLabs bridge');

            // Also mute any Tavus participants that joined before us
            try {
              const participants = frame.participants();
              for (const [id, p] of Object.entries(participants) as [string, any][]) {
                if (p.local) continue;
                const name = (p.user_name || '').toLowerCase();
                if (name.includes('tavus') || name.includes('replica') || !p.owner) {
                  console.log('[Daily] Muting existing Tavus participant:', p.user_name);
                  frame.updateParticipant(id, { setAudio: false });
                }
              }
            } catch (err) {
              console.warn('[Daily] Failed to enumerate participants:', err);
            }

            // --- Connect ElevenLabs Agent ---
            if (!agentId) {
              console.warn('[ElevenLabs] No EXPO_PUBLIC_ELEVENLABS_AGENT_ID set, skipping agent connection');
              return;
            }

            elAgent.onAudioOutput((base64Audio, eventId) => {
              if (destroyed) return;

              // Decode PCM and schedule into destNode for gapless playback.
              // Audio flows: destNode → Daily custom track → Tavus animates
              // → user hears audio through the Tavus participant track.
              // No direct local playback — avoids double audio.
              const samples = base64PcmToFloat32(base64Audio);
              scheduleToDestNode(samples);

              // Also send echo event as the primary lip-sync mechanism
              try {
                frame.sendAppMessage({
                  message_type: 'conversation',
                  event_type: 'conversation.echo',
                  conversation_id: conversationId ?? '',
                  properties: {
                    modality: 'audio',
                    audio: base64Audio,
                    sample_rate: elAgent.outputSampleRate || 24000,
                    inference_id: `el-${eventId}`,
                    done: true,
                  },
                }, '*');
              } catch (err) {
                console.warn('[Tavus] Failed to send echo event:', err);
              }
            });

            elAgent.onAgentResponse((text) => {
              console.log('[ElevenLabs] Agent:', text.slice(0, 120));
              // New response starting — reset queue so chunks schedule fresh
              resetPlaybackQueue();
            });

            elAgent.onInterruption(() => {
              console.log('[ElevenLabs] Interruption — resetting audio queue');
              resetPlaybackQueue();
            });

            elAgent.onConnected(() => {
              console.log('[ElevenLabs] Agent connected — starting mic capture');
              resetPlaybackQueue();
              startMicCapture(frame);
            });

            elAgent.onDisconnected(() => {
              console.log('[ElevenLabs] Agent disconnected');
              resetPlaybackQueue();
            });

            elAgent.connect(agentId);
          })
          .on('left-meeting', () => { if (!destroyed) handleLeave(); })
          .on('error', () => { if (!destroyed) handleLeave(); });

        // Join Daily with mic/camera OFF — audio is handled by ElevenLabs,
        // not the Daily room. The replica video comes through Daily.
        await frame.join({
          url: conversationUrl,
          startAudioOff: true,
          startVideoOff: true,
        });
      } catch (err) {
        console.error('[Daily] Failed to create frame:', err);
        setIsConnecting(false);
      }
    })();

    /* -------------------------------------------------------------- */
    /*  Mic capture → ElevenLabs                                       */
    /* -------------------------------------------------------------- */

    async function startMicCapture(frame: any) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
        });
        // Use native browser sample rate — Web Audio resamples automatically
        // when AudioBuffers use a different rate (e.g. 24kHz for ElevenLabs output)
        audioCtx = new AudioContext();
        nextPlayTime = audioCtx.currentTime;
        micSource = audioCtx.createMediaStreamSource(micStream);

        // Create a MediaStreamDestination to route ElevenLabs audio into Daily
        destNode = audioCtx.createMediaStreamDestination();

        // Publish the destination stream as a custom track in the Daily room
        // so the Tavus replica can detect and animate to it
        try {
          const elTrack = destNode.stream.getAudioTracks()[0];
          if (elTrack) {
            await frame.startCustomTrack({
              track: elTrack,
              trackName: 'elevenlabs-audio',
            });
            console.log('[Daily] Published ElevenLabs audio as custom track');
          }
        } catch (err) {
          console.warn('[Daily] Failed to publish custom track (echo events still active):', err);
        }

        // ScriptProcessorNode for capturing raw PCM (deprecated but widely supported)
        scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
        scriptNode.onaudioprocess = (e) => {
          if (destroyed) return;
          const input = e.inputBuffer.getChannelData(0);
          const downsampled = downsampleTo16k(input, audioCtx!.sampleRate);
          const b64 = float32ToBase64Pcm16(downsampled);
          elAgent.sendAudioChunk(b64);
        };

        micSource.connect(scriptNode);
        // Connect to destination to keep the processor alive (outputs silence)
        scriptNode.connect(audioCtx.destination);

        console.log('[Audio] Mic capture started at', audioCtx.sampleRate, 'Hz, downsampling to 16kHz');
      } catch (err) {
        console.error('[Audio] Failed to start mic capture:', err);
      }
    }

    /* -------------------------------------------------------------- */
    /*  Cleanup                                                        */
    /* -------------------------------------------------------------- */

    return () => {
      destroyed = true;
      clearTimeout(fallback);

      // Disconnect ElevenLabs
      elAgent.disconnect();

      // Stop mic
      if (scriptNode) {
        scriptNode.disconnect();
        scriptNode = null;
      }
      if (micSource) {
        micSource.disconnect();
        micSource = null;
      }
      if (micStream) {
        micStream.getTracks().forEach((t) => t.stop());
        micStream = null;
      }
      if (audioCtx) {
        audioCtx.close().catch(() => {});
        audioCtx = null;
      }

      // Stop custom track
      if (destNode) {
        destNode.disconnect();
        destNode = null;
      }

      // Reset gapless scheduler
      nextPlayTime = 0;

      // Destroy Daily frame
      if (callFrameRef.current) {
        try { callFrameRef.current.destroy(); } catch {}
        callFrameRef.current = null;
      }
    };
  }, [conversationUrl, isLeaving, handleLeave, conversationId]);

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
            source={{
              html: buildCallPageHtml({
                conversationUrl: conversationUrl!,
                elevenLabsAgentId: process.env.EXPO_PUBLIC_ELEVENLABS_AGENT_ID ?? '',
                conversationId: conversationId ?? '',
              }),
              baseUrl: 'https://daily.co',
            }}
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
            onMessage={handleMessage}
            onLoadEnd={() => setIsConnecting(false)}
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
