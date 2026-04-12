import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { endConversation } from '@/services/tavusApi';
import { useTheme } from '@/contexts/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '@/constants/theme';
import { ElevenLabsAgent } from '@/services/elevenLabsAgent';
import { buildCallPageHtml } from '@/services/callPage';

const WebView = Platform.OS !== 'web' ? require('react-native-webview').default : null;

const CREATOR_NAME = 'AI Creator';
type Stage = 'prejoin' | 'connecting' | 'incall' | 'ended';

export default function CallScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { conversationId, conversationUrl } = useLocalSearchParams<{
    conversationId: string;
    conversationUrl: string;
  }>();

  const [callActive, setCallActive] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);
  const [stage, setStage] = useState<Stage>('prejoin');
  const [micMuted, setMicMuted] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [timerSec, setTimerSec] = useState(0);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [selectedMic, setSelectedMic] = useState<string>('');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('');
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [userCamOff, setUserCamOff] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [preJoinMicMuted, setPreJoinMicMuted] = useState(false);
  const [preJoinCamOff, setPreJoinCamOff] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [captions, setCaptions] = useState<Array<{ id: number; speaker: 'user' | 'agent'; text: string }>>([]);

  const micMutedRef = useRef(false);
  const selectedMicRef = useRef<string>('');
  const selectedSpeakerRef = useRef<string>('');
  const startTimeRef = useRef(Date.now());
  const captionIdRef = useRef(0);
  const speakingRafRef = useRef<number>(0);

  // Web refs
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);
  const userCamRef = useRef<HTMLVideoElement>(null);
  const splitVideoRef = useRef<HTMLVideoElement>(null);
  const userCamStreamRef = useRef<MediaStream | null>(null);
  const pipRef = useRef<HTMLDivElement>(null);
  const pipPosRef = useRef<{ right: number; bottom: number }>({ right: 16, bottom: 112 });
  const micLevelRef = useRef<HTMLDivElement>(null);
  const callFrameRef = useRef<any>(null);
  const preJoinCamStreamRef = useRef<MediaStream | null>(null);
  const preJoinMicStreamRef = useRef<MediaStream | null>(null);
  const preJoinCtxRef = useRef<AudioContext | null>(null);

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

  const handleMessage = useCallback((event: any) => {
    const msg = event.nativeEvent?.data;
    if (!msg) return;
    if (msg === 'call-ended' || msg === 'go-back') {
      handleLeave();
    } else if (typeof msg === 'string' && msg.startsWith('LOG:')) {
      console.log('[WebView]', msg.slice(4));
    } else if (typeof msg === 'string' && msg.startsWith('WARN:')) {
      console.warn('[WebView]', msg.slice(5));
    }
  }, [handleLeave]);

  // Inject keyframes (web only, once)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      @keyframes connxn-spin { to { transform: rotate(360deg); } }
      @keyframes connxn-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      @keyframes connxn-ring-pulse {
        0% { box-shadow: 0 0 0 0 rgba(0,212,170,0.6); }
        70% { box-shadow: 0 0 0 24px rgba(0,212,170,0); }
        100% { box-shadow: 0 0 0 0 rgba(0,212,170,0); }
      }
      @keyframes connxn-speaking-ring {
        0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
        50% { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
      }
      @keyframes connxn-caption-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .connxn-speaking { animation: connxn-speaking-ring 1s ease infinite; }
      .connxn-caption { animation: connxn-caption-in 0.2s ease; }
      select.connxn-select {
        -webkit-appearance: none; appearance: none;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2394a3b8' stroke-width='2' viewBox='0 0 24 24'><polyline points='6 9 12 15 18 9'/></svg>");
        background-repeat: no-repeat;
        background-position: right 12px center;
        padding-right: 36px !important;
      }
      .connxn-btn-press:active { transform: scale(0.92); }
    `;
    document.head.appendChild(styleEl);
    return () => { styleEl.remove(); };
  }, []);

  // Pre-join: camera preview + mic analyser + device enumeration
  useEffect(() => {
    if (Platform.OS !== 'web' || stage !== 'prejoin') return;
    let destroyed = false;
    let rafId = 0;

    // Camera (skip if pre-join camera is toggled off)
    if (preJoinCamOff) {
      setCamReady(false);
    } else {
    const camConstraints: MediaStreamConstraints = {
      video: selectedCamera
        ? { deviceId: { exact: selectedCamera } }
        : { facingMode: 'user' },
    };
    navigator.mediaDevices.getUserMedia(camConstraints)
      .then(async (stream) => {
        if (destroyed) { stream.getTracks().forEach((t) => t.stop()); return; }
        preJoinCamStreamRef.current = stream;
        if (cameraPreviewRef.current) {
          cameraPreviewRef.current.srcObject = stream;
        }
        setCamReady(true);
        // Enumerate devices after permission
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (destroyed) return;
          setCameras(devices.filter((d) => d.kind === 'videoinput'));
          setMics(devices.filter((d) => d.kind === 'audioinput'));
          setSpeakers(devices.filter((d) => d.kind === 'audiooutput'));
          if (!selectedCamera) {
            const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId;
            if (activeId) setSelectedCamera(activeId);
          }
        } catch {}
      })
      .catch(() => setCamReady(false));
    }

    // Mic analyser
    const micConstraints: MediaStreamConstraints = {
      audio: selectedMic
        ? { deviceId: { exact: selectedMic } }
        : true,
    };
    navigator.mediaDevices.getUserMedia(micConstraints)
      .then((stream) => {
        if (destroyed) { stream.getTracks().forEach((t) => t.stop()); return; }
        preJoinMicStreamRef.current = stream;
        const ctx = new AudioContext();
        preJoinCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        setMicReady(true);
        if (!selectedMic) {
          const activeId = stream.getAudioTracks()[0]?.getSettings().deviceId;
          if (activeId) {
            setSelectedMic(activeId);
            selectedMicRef.current = activeId;
          }
        }

        const data = new Uint8Array(analyser.frequencyBinCount);
        const draw = () => {
          if (destroyed) return;
          analyser.getByteFrequencyData(data);
          let avg = 0;
          for (let i = 0; i < 32; i++) avg += data[i];
          avg = avg / 32;
          const level = Math.min(1, avg / 128);
          if (micLevelRef.current) {
            micLevelRef.current.style.width = (level * 100) + '%';
          }
          rafId = requestAnimationFrame(draw);
        };
        draw();
      })
      .catch(() => setMicReady(false));

    return () => {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (preJoinCamStreamRef.current) {
        preJoinCamStreamRef.current.getTracks().forEach((t) => t.stop());
        preJoinCamStreamRef.current = null;
      }
      if (preJoinMicStreamRef.current) {
        preJoinMicStreamRef.current.getTracks().forEach((t) => t.stop());
        preJoinMicStreamRef.current = null;
      }
      if (preJoinCtxRef.current) {
        preJoinCtxRef.current.close().catch(() => {});
        preJoinCtxRef.current = null;
      }
    };
  }, [stage, selectedCamera, selectedMic, preJoinCamOff]);

  // User PiP camera (in-call only)
  useEffect(() => {
    if (Platform.OS !== 'web' || stage !== 'incall' || userCamOff) return;
    let destroyed = false;

    const constraints: MediaStreamConstraints = {
      video: selectedCamera
        ? { deviceId: { exact: selectedCamera } }
        : { facingMode: 'user' },
    };
    navigator.mediaDevices.getUserMedia(constraints)
      .then((stream) => {
        if (destroyed) { stream.getTracks().forEach((t) => t.stop()); return; }
        userCamStreamRef.current = stream;
        if (userCamRef.current) {
          userCamRef.current.srcObject = stream;
        }
        if (splitVideoRef.current) {
          splitVideoRef.current.srcObject = stream;
        }
      })
      .catch(() => setUserCamOff(true));

    return () => {
      destroyed = true;
      if (userCamStreamRef.current) {
        userCamStreamRef.current.getTracks().forEach((t) => t.stop());
        userCamStreamRef.current = null;
      }
    };
  }, [stage, userCamOff, selectedCamera]);

  // PiP drag using right/bottom (web, in-call only, NOT in split view)
  useEffect(() => {
    if (Platform.OS !== 'web' || stage !== 'incall') return;
    const pip = pipRef.current;
    if (!pip) return;

    if (splitView) {
      // No drag in split mode — clear inline positioning so flex layout works
      pip.style.transform = 'none';
      return;
    }

    // Restore saved position when returning to normal view
    pip.style.right = pipPosRef.current.right + 'px';
    pip.style.bottom = pipPosRef.current.bottom + 'px';
    pip.style.left = 'auto';
    pip.style.top = 'auto';
    pip.style.transform = 'none';

    let isDragging = false;
    let startMouseX = 0, startMouseY = 0;
    let startRight = pipPosRef.current.right;
    let startBottom = pipPosRef.current.bottom;

    const onDown = (e: MouseEvent) => {
      isDragging = true;
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      const rect = pip.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      startBottom = window.innerHeight - rect.bottom;
      e.preventDefault();
    };
    const onMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      const rect = pip.getBoundingClientRect();
      const newRight = Math.max(8, Math.min(window.innerWidth - rect.width - 8, startRight - dx));
      const newBottom = Math.max(8, Math.min(window.innerHeight - rect.height - 8, startBottom - dy));
      pip.style.right = newRight + 'px';
      pip.style.bottom = newBottom + 'px';
      pipPosRef.current = { right: newRight, bottom: newBottom };
    };
    const onUp = () => { isDragging = false; };

    pip.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      pip.removeEventListener('mousedown', onDown);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [stage, splitView]);

  // Reattach user cam stream to whichever video element is mounted
  useEffect(() => {
    if (Platform.OS !== 'web' || stage !== 'incall') return;
    const stream = userCamStreamRef.current;
    if (!stream) return;
    if (userCamRef.current) userCamRef.current.srcObject = stream;
    if (splitVideoRef.current) splitVideoRef.current.srcObject = stream;
  }, [stage, splitView, userCamOff]);

  // Call timer
  useEffect(() => {
    if (stage !== 'incall') return;
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setTimerSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [stage]);

  // Main Daily + ElevenLabs
  useEffect(() => {
    if (Platform.OS !== 'web' || !conversationUrl || isLeaving) return;

    let destroyed = false;
    const elAgent = new ElevenLabsAgent();
    let audioCtx: AudioContext | null = null;
    let micStream: MediaStream | null = null;
    let scriptNode: ScriptProcessorNode | null = null;
    let micSource: MediaStreamAudioSourceNode | null = null;
    let destNode: MediaStreamAudioDestinationNode | null = null;
    let micAnalyser: AnalyserNode | null = null;
    let scheduledUntil = 0;
    let turnChunks: Float32Array[] = [];
    let turnTimer: ReturnType<typeof setTimeout> | null = null;

    // Register transcript callback early so we don't miss any captions.
    // Always store to state — render layer decides whether to display.
    elAgent.onTranscript((text, _isFinal, speaker) => {
      if (!text || !text.trim()) return;
      const id = ++captionIdRef.current;
      setCaptions((prev) => {
        const next = [...prev, { id, speaker, text }];
        return next.slice(-4);
      });
      setTimeout(() => {
        setCaptions((prev) => prev.filter((c) => c.id !== id));
      }, 6000);
    });

    const agentId = process.env.EXPO_PUBLIC_ELEVENLABS_AGENT_ID ?? '';

    function downsampleTo16k(buffer: Float32Array, srcRate: number): Float32Array {
      if (srcRate === 16000) return buffer;
      const ratio = srcRate / 16000;
      const newLen = Math.floor(buffer.length / ratio);
      const out = new Float32Array(newLen);
      for (let i = 0; i < newLen; i++) out[i] = buffer[Math.floor(i * ratio)];
      return out;
    }

    function float32ToBase64Pcm16(samples: Float32Array): string {
      const buf = new ArrayBuffer(samples.length * 2);
      const view = new DataView(buf);
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }

    function base64PcmToFloat32(b64: string): Float32Array {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const view = new DataView(bytes.buffer);
      const samples = new Float32Array(bytes.length / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 0x8000;
      return samples;
    }

    // Path B only — Tavus animates and replays audio back to us.
    // User hears through the subscribed Tavus participant audio track
    // (see track-started audio handling below).
    function scheduleChunk(samples: Float32Array) {
      if (!audioCtx || destroyed) return;
      const sr = elAgent.outputSampleRate || 24000;
      const abuf = audioCtx.createBuffer(1, samples.length, sr);
      abuf.copyToChannel(new Float32Array(samples), 0);

      const now = audioCtx.currentTime;
      if (scheduledUntil < now - 1.5) scheduledUntil = now + 0.05;
      const startAt = Math.max(scheduledUntil, now + 0.01);
      scheduledUntil = startAt + abuf.duration;

      if (destNode) {
        const srcB = audioCtx.createBufferSource();
        srcB.buffer = abuf;
        srcB.connect(destNode);
        srcB.start(startAt);
      }
    }

    function resetPlaybackQueue() {
      scheduledUntil = audioCtx?.currentTime ?? 0;
    }

    async function startMicCapture(frame: any) {
      try {
        const micConstraint: any = { echoCancellation: true, noiseSuppression: true, channelCount: 1 };
        if (selectedMicRef.current) {
          micConstraint.deviceId = { exact: selectedMicRef.current };
        }
        micStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraint });
        audioCtx = new AudioContext();
        scheduledUntil = audioCtx.currentTime;
        micSource = audioCtx.createMediaStreamSource(micStream);

        destNode = audioCtx.createMediaStreamDestination();
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
          console.warn('[Daily] Failed to publish custom track:', err);
        }

        scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
        scriptNode.onaudioprocess = (e) => {
          if (destroyed || micMutedRef.current) return;
          const input = e.inputBuffer.getChannelData(0);
          const downsampled = downsampleTo16k(input, audioCtx!.sampleRate);
          const b64 = float32ToBase64Pcm16(downsampled);
          elAgent.sendAudioChunk(b64);
        };

        micSource.connect(scriptNode);
        scriptNode.connect(audioCtx.destination);

        // Voice activity analyser (for "user speaking" indicator)
        micAnalyser = audioCtx.createAnalyser();
        micAnalyser.fftSize = 256;
        micSource.connect(micAnalyser);
        const speakingData = new Uint8Array(micAnalyser.frequencyBinCount);
        const detectSpeaking = () => {
          if (!micAnalyser || destroyed) return;
          micAnalyser.getByteFrequencyData(speakingData);
          let sum = 0;
          for (let i = 0; i < 32; i++) sum += speakingData[i];
          const level = sum / (32 * 255);
          setUserSpeaking(level > 0.08 && !micMutedRef.current);
          speakingRafRef.current = requestAnimationFrame(detectSpeaking);
        };
        speakingRafRef.current = requestAnimationFrame(detectSpeaking);

        console.log('[Audio] Mic capture started at', audioCtx.sampleRate, 'Hz');
      } catch (err) {
        console.error('[Audio] Failed to start mic capture:', err);
      }
    }

    (async () => {
      try {
        const DailyIframe = (await import('@daily-co/daily-js')).default;
        if (destroyed) return;

        const frame = DailyIframe.createCallObject({
          subscribeToTracksAutomatically: false,
        });
        callFrameRef.current = frame;

        frame.on('track-started', (event: any) => {
          if (destroyed) return;
          const p = event?.participant;
          if (!p || p.local) return;
          const container = videoContainerRef.current;
          if (!container) return;

          if (event?.track?.kind === 'video') {
            let videoEl = container.querySelector('video[data-daily]') as HTMLVideoElement | null;
            if (!videoEl) {
              videoEl = document.createElement('video');
              videoEl.setAttribute('data-daily', 'tavus');
              videoEl.autoplay = true;
              videoEl.playsInline = true;
              videoEl.muted = true;
              videoEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
              container.appendChild(videoEl);
            }
            videoEl.srcObject = new MediaStream([event.track]);
            console.log('[Daily] Tavus video track attached');
          }

          if (event?.track?.kind === 'audio') {
            let audioEl = container.querySelector('audio[data-tavus-audio]') as HTMLAudioElement | null;
            if (!audioEl) {
              audioEl = document.createElement('audio');
              audioEl.setAttribute('data-tavus-audio', 'true');
              audioEl.autoplay = true;
              audioEl.style.display = 'none';
              container.appendChild(audioEl);
            }
            audioEl.srcObject = new MediaStream([event.track]);
            if (selectedSpeakerRef.current && (audioEl as any).setSinkId) {
              (audioEl as any).setSinkId(selectedSpeakerRef.current).catch(() => {});
            }
            console.log('[Daily] Tavus audio track attached');
          }
        });

        frame.on('track-stopped', (event: any) => {
          const container = videoContainerRef.current;
          if (!container) return;
          if (event?.track?.kind === 'video') {
            const videoEl = container.querySelector('video[data-daily]');
            if (videoEl) {
              (videoEl as HTMLVideoElement).srcObject = null;
              videoEl.remove();
            }
          }
          if (event?.track?.kind === 'audio') {
            const audioEl = container.querySelector('audio[data-tavus-audio]');
            if (audioEl) {
              (audioEl as HTMLAudioElement).srcObject = null;
              audioEl.remove();
            }
          }
        });

        frame.on('participant-joined', (event: any) => {
          if (destroyed) return;
          const p = event?.participant;
          if (!p || p.local) return;
          try {
            frame.updateParticipant(p.session_id, {
              setSubscribedTracks: { audio: true, video: true },
            });
          } catch {}
        });

        frame.on('joined-meeting', () => {
          if (destroyed) return;
          setStage('incall');
          console.log('[Daily] Joined meeting — starting ElevenLabs bridge');

          try {
            const participants = frame.participants();
            for (const [id, p] of Object.entries(participants) as [string, any][]) {
              if (p.local) continue;
              frame.updateParticipant(id, {
                setSubscribedTracks: { audio: true, video: true },
              });
            }
          } catch {}

          if (!agentId) {
            console.warn('[ElevenLabs] No EXPO_PUBLIC_ELEVENLABS_AGENT_ID set');
            return;
          }

          elAgent.onAudioOutput((base64Audio) => {
            if (destroyed) return;
            const samples = base64PcmToFloat32(base64Audio);
            scheduleChunk(samples);
            turnChunks.push(samples);
            if (turnTimer) clearTimeout(turnTimer);
            turnTimer = setTimeout(() => {
              if (turnChunks.length === 0 || !callFrameRef.current) {
                turnChunks = [];
                return;
              }
              const sr = elAgent.outputSampleRate || 24000;
              const totalLen = turnChunks.reduce((s, c) => s + c.length, 0);
              const combined = new Float32Array(totalLen);
              let offset = 0;
              for (const c of turnChunks) { combined.set(c, offset); offset += c.length; }
              const pcm = new ArrayBuffer(combined.length * 2);
              const view = new DataView(pcm);
              for (let i = 0; i < combined.length; i++) {
                const s = Math.max(-1, Math.min(1, combined[i]));
                view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
              }
              const bytes = new Uint8Array(pcm);
              let bin = '';
              for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
              const b64 = btoa(bin);
              try {
                callFrameRef.current.sendAppMessage({
                  message_type: 'conversation',
                  event_type: 'conversation.echo',
                  conversation_id: conversationId ?? '',
                  properties: {
                    modality: 'audio',
                    audio: b64,
                    sample_rate: sr,
                    done: 'true',
                  },
                }, '*');
                console.log('[Tavus Echo] Sent, duration:', (totalLen / sr).toFixed(2) + 's');
              } catch (e) {
                console.warn('[Tavus Echo] Failed:', e);
              }
              turnChunks = [];
            }, 800);
          });

          elAgent.onInterruption(() => {
            console.log('[ElevenLabs] Interruption');
            if (turnTimer) { clearTimeout(turnTimer); turnTimer = null; }
            turnChunks = [];
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
        });

        frame.on('left-meeting', () => { if (!destroyed) handleLeave(); });
        frame.on('error', () => { if (!destroyed) handleLeave(); });
      } catch (err) {
        console.error('[Daily] Failed to create call object:', err);
      }
    })();

    return () => {
      destroyed = true;
      elAgent.disconnect();

      if (speakingRafRef.current) { cancelAnimationFrame(speakingRafRef.current); speakingRafRef.current = 0; }
      if (micAnalyser) { try { micAnalyser.disconnect(); } catch {} micAnalyser = null; }

      if (scriptNode) { scriptNode.disconnect(); scriptNode = null; }
      if (micSource) { micSource.disconnect(); micSource = null; }
      if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
      if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
      if (destNode) { destNode.disconnect(); destNode = null; }

      scheduledUntil = 0;
      if (turnTimer) { clearTimeout(turnTimer); turnTimer = null; }
      turnChunks = [];

      const container = videoContainerRef.current;
      if (container) {
        const v = container.querySelector('video[data-daily]');
        if (v) { (v as HTMLVideoElement).srcObject = null; v.remove(); }
      }

      if (callFrameRef.current) {
        try { callFrameRef.current.destroy(); } catch {}
        callFrameRef.current = null;
      }
    };
  }, [conversationUrl, isLeaving, handleLeave, conversationId]);

  const handleJoinClick = useCallback(() => {
    if (!callFrameRef.current || !conversationUrl) return;
    if (preJoinCamStreamRef.current) {
      preJoinCamStreamRef.current.getTracks().forEach((t) => t.stop());
      preJoinCamStreamRef.current = null;
    }
    if (preJoinMicStreamRef.current) {
      preJoinMicStreamRef.current.getTracks().forEach((t) => t.stop());
      preJoinMicStreamRef.current = null;
    }
    if (preJoinCtxRef.current) {
      preJoinCtxRef.current.close().catch(() => {});
      preJoinCtxRef.current = null;
    }
    // Carry over pre-join toggles into the call
    micMutedRef.current = preJoinMicMuted;
    setMicMuted(preJoinMicMuted);
    setUserCamOff(preJoinCamOff);
    setStage('connecting');
    try {
      callFrameRef.current.join({ url: conversationUrl });
    } catch (err) {
      console.error('[Daily] join failed:', err);
    }
  }, [conversationUrl, preJoinMicMuted, preJoinCamOff]);

  const toggleMic = useCallback(() => {
    const next = !micMutedRef.current;
    micMutedRef.current = next;
    setMicMuted(next);
  }, []);

  const toggleCamera = useCallback(() => {
    setUserCamOff((prev) => !prev);
  }, []);

  const onSelectCamera = useCallback((id: string) => {
    setSelectedCamera(id);
  }, []);

  const onSelectMic = useCallback((id: string) => {
    setSelectedMic(id);
    selectedMicRef.current = id;
  }, []);

  const onSelectSpeaker = useCallback((id: string) => {
    setSelectedSpeaker(id);
    selectedSpeakerRef.current = id;
    // Apply to existing Tavus audio element
    const container = videoContainerRef.current;
    if (container) {
      const audioEl = container.querySelector('audio[data-tavus-audio]') as HTMLAudioElement | null;
      if (audioEl && (audioEl as any).setSinkId) {
        (audioEl as any).setSinkId(id).catch(() => {});
      }
    }
  }, []);

  const toggleSettings = useCallback(() => setShowSettings((p) => !p), []);
  const toggleSplitView = useCallback(() => setSplitView((p) => !p), []);
  const toggleCaptions = useCallback(() => setCaptionsOn((p) => !p), []);
  const togglePreJoinMic = useCallback(() => setPreJoinMicMuted((p) => !p), []);
  const togglePreJoinCam = useCallback(() => setPreJoinCamOff((p) => !p), []);

  const handleBack = useCallback(() => {
    // Stop pre-join streams before navigating
    if (preJoinCamStreamRef.current) {
      preJoinCamStreamRef.current.getTracks().forEach((t) => t.stop());
      preJoinCamStreamRef.current = null;
    }
    if (preJoinMicStreamRef.current) {
      preJoinMicStreamRef.current.getTracks().forEach((t) => t.stop());
      preJoinMicStreamRef.current = null;
    }
    if (preJoinCtxRef.current) {
      preJoinCtxRef.current.close().catch(() => {});
      preJoinCtxRef.current = null;
    }
    router.replace('/');
  }, [router]);

  // ───── render ─────

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

  const timerText = `${Math.floor(timerSec / 60)}:${(timerSec % 60).toString().padStart(2, '0')}`;

  if (Platform.OS === 'web') {
    const theme = {
      bg: colors.background,
      card: isDark ? 'rgba(30,41,59,0.6)' : 'rgba(255,255,255,0.8)',
      border: colors.cardBorder,
      textPrimary: colors.textPrimary,
      textSecondary: colors.textSecondary,
      textMuted: colors.textMuted,
      accent: colors.accent,
      accentDark: colors.accentDark,
      danger: colors.danger,
      inputBg: isDark ? '#1e293b' : '#ffffff',
    };

    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: stage === 'incall' ? '#000' : theme.bg,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      } as any}>
        {/* Tavus video container — always mounted so track-started can attach */}
        <div
          ref={videoContainerRef as any}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: stage === 'incall' && splitView ? '50%' : 0,
            bottom: 0,
            background: '#000',
            display: stage === 'incall' ? 'block' : 'none',
            transition: 'right 0.3s ease',
          } as any}
        />

        {/* Floating back button (top-left of viewport) — pre-join only */}
        {stage === 'prejoin' && (
          <div
            onClick={handleBack}
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 20,
              background: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.8)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: theme.textPrimary,
              cursor: 'pointer',
              userSelect: 'none',
              fontSize: 14,
              fontWeight: 500,
              zIndex: 100,
            } as any}
          >
            <Ionicons name="arrow-back" size={18} color={theme.textPrimary} />
            <span>Back</span>
          </div>
        )}

        {/* ───────── PRE-JOIN ───────── */}
        {stage === 'prejoin' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'stretch',
            padding: 24,
            paddingTop: 64,
            gap: 24,
            overflow: 'hidden',
            boxSizing: 'border-box',
          } as any}>
            {/* LEFT: camera preview fills column */}
            <div style={{
              flex: '0 0 55%',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minWidth: 0,
              minHeight: 0,
            } as any}>
              <div style={{
                flex: 1,
                minHeight: 0,
                maxHeight: '65vh',
                borderRadius: 16,
                overflow: 'hidden',
                background: '#0b1220',
                position: 'relative',
                border: `1px solid ${theme.border}`,
              } as any}>
                  <video
                    ref={cameraPreviewRef as any}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)',
                      display: camReady ? 'block' : 'none',
                    } as any}
                  />
                  {!camReady && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      gap: 12,
                    } as any}>
                      <Ionicons name="videocam-off-outline" size={48} color={theme.textMuted} />
                      <span style={{ color: theme.textMuted, fontSize: 14 } as any}>
                        Camera is off
                      </span>
                    </div>
                  )}
                  <div style={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    color: 'white',
                    fontSize: 12,
                    background: 'rgba(0,0,0,0.5)',
                    padding: '4px 10px',
                    borderRadius: 8,
                    backdropFilter: 'blur(8px)',
                  } as any}>You</div>

                  {/* Mic mute overlay (bottom-left) */}
                  <div
                    onClick={togglePreJoinMic}
                    title="Mute mic before joining"
                    style={{
                      position: 'absolute',
                      bottom: 12,
                      left: 12,
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: preJoinMicMuted ? '#ef4444' : 'rgba(0,0,0,0.55)',
                      backdropFilter: 'blur(8px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      userSelect: 'none',
                    } as any}
                  >
                    <Ionicons name={preJoinMicMuted ? 'mic-off' : 'mic'} size={18} color="white" />
                  </div>

                  {/* Camera off overlay (bottom-right) */}
                  <div
                    onClick={togglePreJoinCam}
                    title="Turn off camera before joining"
                    style={{
                      position: 'absolute',
                      bottom: 12,
                      right: 12,
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: preJoinCamOff ? '#ef4444' : 'rgba(0,0,0,0.55)',
                      backdropFilter: 'blur(8px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      userSelect: 'none',
                    } as any}
                  >
                    <Ionicons name={preJoinCamOff ? 'videocam-off' : 'videocam'} size={18} color="white" />
                  </div>
                </div>

              {/* Device pickers row (camera + mic) */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 } as any}>
                <select
                  className="connxn-select"
                  value={selectedCamera}
                  onChange={(e) => onSelectCamera(e.target.value)}
                  style={{
                    flex: 1,
                    height: 36,
                    padding: '0 12px',
                    borderRadius: 10,
                    background: theme.inputBg,
                    color: theme.textPrimary,
                    border: `1px solid ${theme.border}`,
                    fontSize: 13,
                    cursor: 'pointer',
                    minWidth: 0,
                  } as any}
                >
                  {cameras.length === 0 && <option value="">Default camera</option>}
                  {cameras.map((c) => (
                    <option key={c.deviceId} value={c.deviceId}>
                      {c.label || `Camera (${c.deviceId.slice(0, 6)})`}
                    </option>
                  ))}
                </select>
                <select
                  className="connxn-select"
                  value={selectedMic}
                  onChange={(e) => onSelectMic(e.target.value)}
                  style={{
                    flex: 1,
                    height: 36,
                    padding: '0 12px',
                    borderRadius: 10,
                    background: theme.inputBg,
                    color: theme.textPrimary,
                    border: `1px solid ${theme.border}`,
                    fontSize: 13,
                    cursor: 'pointer',
                    minWidth: 0,
                  } as any}
                >
                  {mics.length === 0 && <option value="">Default mic</option>}
                  {mics.map((m) => (
                    <option key={m.deviceId} value={m.deviceId}>
                      {m.label || `Mic (${m.deviceId.slice(0, 6)})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* RIGHT: brand + join (vertically centered) */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 16,
              textAlign: 'center',
              minWidth: 0,
            } as any}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentDark})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
              } as any}>✨</div>
              <div>
                <div style={{ color: theme.textPrimary, fontSize: 22, fontWeight: 700 } as any}>
                  Ready to join?
                </div>
                <div style={{ color: theme.textSecondary, fontSize: 14, marginTop: 4 } as any}>
                  {CREATOR_NAME} · AI Video Call
                </div>
              </div>

              {/* Mic level meter */}
              <div style={{ width: '100%', maxWidth: 360 } as any}>
                <div style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 6, textAlign: 'center' } as any}>
                  Microphone level
                </div>
                <div style={{
                  width: '100%',
                  height: 8,
                  background: theme.inputBg,
                  borderRadius: 4,
                  overflow: 'hidden',
                  border: `1px solid ${theme.border}`,
                } as any}>
                  <div
                    ref={micLevelRef as any}
                    style={{
                      height: '100%',
                      width: '0%',
                      background: `linear-gradient(90deg, ${theme.accent}, ${theme.accentDark})`,
                      transition: 'width 0.1s ease',
                    } as any}
                  />
                </div>
              </div>

              {/* Device status */}
              <div style={{ display: 'flex', gap: 16 } as any}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: camReady ? theme.accent : theme.danger, fontSize: 12,
                } as any}>
                  <Ionicons
                    name={camReady ? 'videocam' : 'videocam-off'}
                    size={14}
                    color={camReady ? theme.accent : theme.danger}
                  />
                  <span>{camReady ? 'Camera ready' : 'Camera blocked'}</span>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: micReady ? theme.accent : theme.danger, fontSize: 12,
                } as any}>
                  <Ionicons
                    name={micReady ? 'mic' : 'mic-off'}
                    size={14}
                    color={micReady ? theme.accent : theme.danger}
                  />
                  <span>{micReady ? 'Mic ready' : 'Mic blocked'}</span>
                </div>
              </div>

              <button
                onClick={handleJoinClick}
                style={{
                  width: '100%',
                  maxWidth: 360,
                  height: 52,
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 14,
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#fff',
                  background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentDark})`,
                  boxShadow: `0 8px 24px ${isDark ? 'rgba(0,212,170,0.3)' : 'rgba(0,196,154,0.25)'}`,
                } as any}
              >
                Join Now
              </button>
              <div style={{ color: theme.textMuted, fontSize: 11, textAlign: 'center' } as any}>
                You'll join as a guest · Mic and camera only used during the call
              </div>
            </div>
          </div>
        )}

        {/* ───────── CONNECTING ───────── */}
        {stage === 'connecting' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: theme.bg,
            gap: 16,
          } as any}>
            <div style={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentDark})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
              animation: 'connxn-ring-pulse 2s ease infinite',
            } as any}>✨</div>
            <div style={{ color: theme.textPrimary, fontSize: 22, fontWeight: 700 } as any}>
              Connecting...
            </div>
            <div style={{ color: theme.textSecondary, fontSize: 14 } as any}>
              Setting up your call
            </div>
            <div style={{
              width: 32,
              height: 32,
              border: `3px solid ${theme.border}`,
              borderTopColor: theme.accent,
              borderRadius: '50%',
              animation: 'connxn-spin 0.8s linear infinite',
              marginTop: 8,
            } as any} />
          </div>
        )}

        {/* ───────── IN-CALL ───────── */}
        {stage === 'incall' && (
          <>
            {/* User camera — PiP (normal) or full right pane (split view) */}
            {splitView ? (
              <div style={{
                position: 'absolute',
                top: 56,
                right: 0,
                width: '50%',
                bottom: 96,
                background: '#0b1220',
                zIndex: 4,
                overflow: 'hidden',
                transition: 'opacity 0.3s ease',
              } as any}>
                {!userCamOff ? (
                  <video
                    ref={splitVideoRef as any}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)',
                    } as any}
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  } as any}>
                    <Ionicons name="person" size={72} color="#475569" />
                  </div>
                )}
                <div style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 12,
                  color: 'white',
                  fontSize: 12,
                  background: 'rgba(0,0,0,0.55)',
                  padding: '4px 10px',
                  borderRadius: 8,
                  fontWeight: 600,
                } as any}>You</div>
              </div>
            ) : (
              <div
                ref={pipRef as any}
                style={{
                  position: 'absolute',
                  right: 16,
                  bottom: 112,
                  width: 180,
                  height: 101,
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: '#1e293b',
                  border: userSpeaking && !micMuted
                    ? '2px solid #22c55e'
                    : '2px solid rgba(255,255,255,0.2)',
                  transition: 'border-color 0.1s ease',
                  cursor: 'move',
                  zIndex: 5,
                  userSelect: 'none',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                } as any}
              >
                {!userCamOff && (
                  <video
                    ref={userCamRef as any}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)',
                    } as any}
                  />
                )}
                {userCamOff && (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  } as any}>
                    <Ionicons name="person" size={36} color="#94a3b8" />
                  </div>
                )}
                <div style={{
                  position: 'absolute',
                  bottom: 6,
                  left: 8,
                  color: 'white',
                  fontSize: 10,
                  background: 'rgba(0,0,0,0.55)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontWeight: 600,
                } as any}>You</div>
              </div>
            )}

            {/* Top bar */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 20px',
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              zIndex: 10,
            } as any}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 } as any}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentDark})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                } as any}>✨</div>
                <div>
                  <div style={{
                    color: 'white',
                    fontSize: 14,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  } as any}>
                    {CREATOR_NAME}
                    <span style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: colors.accent,
                      background: 'rgba(0,212,170,0.15)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      letterSpacing: 0.5,
                    } as any}>AI</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 } as any}>
                <div style={{
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                } as any}>{timerText}</div>
                <div
                  onClick={toggleSplitView}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  } as any}
                  title={splitView ? 'Full screen' : 'Split view'}
                >
                  <Ionicons
                    name={splitView ? 'expand' : 'grid'}
                    size={18}
                    color="white"
                  />
                </div>
              </div>
            </div>

            {/* Settings panel (overlay above controls) */}
            {showSettings && (
              <div style={{
                position: 'absolute',
                bottom: 112,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'min(380px, calc(100% - 32px))',
                background: 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 20,
                border: '1px solid rgba(255,255,255,0.1)',
                padding: 20,
                zIndex: 15,
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              } as any}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                } as any}>
                  <span style={{ color: 'white', fontSize: 16, fontWeight: 700 } as any}>
                    Call Settings
                  </span>
                  <div
                    onClick={toggleSettings}
                    style={{ cursor: 'pointer', padding: 4 } as any}
                  >
                    <Ionicons name="close" size={20} color="white" />
                  </div>
                </div>

                <div style={{ marginBottom: 14 } as any}>
                  <label style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 12,
                    display: 'block',
                    marginBottom: 6,
                  } as any}>Microphone</label>
                  <select
                    className="connxn-select"
                    value={selectedMic}
                    onChange={(e) => onSelectMic(e.target.value)}
                    style={{
                      width: '100%',
                      height: 40,
                      padding: '0 12px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.08)',
                      color: 'white',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: 13,
                      cursor: 'pointer',
                    } as any}
                  >
                    {mics.length === 0 && <option value="">Default mic</option>}
                    {mics.map((m) => (
                      <option key={m.deviceId} value={m.deviceId} style={{ color: 'black' } as any}>
                        {m.label || `Mic (${m.deviceId.slice(0, 6)})`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 12,
                    display: 'block',
                    marginBottom: 6,
                  } as any}>Speaker</label>
                  <select
                    className="connxn-select"
                    value={selectedSpeaker}
                    onChange={(e) => onSelectSpeaker(e.target.value)}
                    style={{
                      width: '100%',
                      height: 40,
                      padding: '0 12px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.08)',
                      color: 'white',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: 13,
                      cursor: 'pointer',
                    } as any}
                  >
                    {speakers.length === 0 && <option value="">Default speaker</option>}
                    {speakers.map((s) => (
                      <option key={s.deviceId} value={s.deviceId} style={{ color: 'black' } as any}>
                        {s.label || `Speaker (${s.deviceId.slice(0, 6)})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Bottom controls */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 96,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 20,
              padding: '0 16px',
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              zIndex: 10,
            } as any}>
              <CtrlButton
                onClick={toggleMic}
                active={!micMuted}
                icon={micMuted ? 'mic-off' : 'mic'}
                label={micMuted ? 'Unmute' : 'Mic'}
                danger={micMuted}
                speaking={userSpeaking && !micMuted}
              />
              <CtrlButton
                onClick={toggleCamera}
                active={!userCamOff}
                icon={userCamOff ? 'videocam-off' : 'videocam'}
                label="Camera"
                danger={userCamOff}
              />
              <CtrlButton
                onClick={handleLeave}
                active
                icon="call"
                label="End"
                size={64}
                bg={colors.danger}
              />
              <CtrlButton
                onClick={toggleCaptions}
                active={captionsOn}
                icon="chatbubble-ellipses"
                label="CC"
                bg={captionsOn ? '#fff' : 'rgba(255,255,255,0.15)'}
                iconColor={captionsOn ? '#0f172a' : 'white'}
              />
              <CtrlButton
                onClick={toggleSplitView}
                active
                icon={splitView ? 'expand-outline' : 'grid-outline'}
                label={splitView ? 'Full' : 'Split'}
              />
              <CtrlButton
                onClick={toggleSettings}
                active
                icon="settings-outline"
                label="Settings"
              />
            </div>

            {/* Caption overlay */}
            {captionsOn && captions.length > 0 && (
              <div style={{
                position: 'absolute',
                bottom: 112,
                left: 0,
                right: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                alignItems: 'center',
                padding: '0 48px',
                pointerEvents: 'none',
                zIndex: 9,
              } as any}>
                {captions.map((c) => (
                  <div
                    key={c.id}
                    className="connxn-caption"
                    style={{
                      background: 'rgba(0,0,0,0.75)',
                      borderRadius: 8,
                      padding: '6px 12px',
                      maxWidth: 600,
                      fontSize: 15,
                      lineHeight: 1.4,
                      color: 'white',
                    } as any}
                  >
                    <span style={{
                      color: c.speaker === 'user' ? '#22c55e' : '#818cf8',
                      fontWeight: 600,
                    } as any}>
                      {c.speaker === 'user' ? 'You: ' : 'AI: '}
                    </span>
                    <span>{c.text}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Native (WebView)
  return (
    <View style={styles.root}>
      {!isLeaving && (
        <WebView
          source={{
            html: buildCallPageHtml({
              conversationUrl: conversationUrl!,
              elevenLabsAgentId: process.env.EXPO_PUBLIC_ELEVENLABS_AGENT_ID ?? '',
              conversationId: conversationId ?? '',
              isDarkMode: isDark,
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
          onError={(e: any) => console.warn('[WebView]', e.nativeEvent?.description)}
        />
      )}
    </View>
  );
}

// Web-only button component
function CtrlButton(props: {
  onClick: () => void;
  active: boolean;
  icon: any;
  label: string;
  size?: number;
  bg?: string;
  iconColor?: string;
  danger?: boolean;
  disabled?: boolean;
  speaking?: boolean;
}) {
  const size = props.size ?? 56;
  const bg = props.bg
    ?? (props.danger ? '#ef4444' : 'rgba(255,255,255,0.15)');
  const iconColor = props.iconColor ?? 'white';
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      opacity: props.disabled ? 0.4 : 1,
      cursor: props.disabled ? 'not-allowed' : 'pointer',
      userSelect: 'none',
    } as any}>
      <div
        className={`connxn-btn-press${props.speaking ? ' connxn-speaking' : ''}`}
        onClick={props.disabled ? undefined : props.onClick}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.1s',
          backdropFilter: 'blur(10px)',
        } as any}
      >
        <Ionicons name={props.icon} size={size * 0.42} color={iconColor} />
      </div>
      <span style={{
        color: 'rgba(255,255,255,0.75)',
        fontSize: 11,
        fontWeight: 500,
      } as any}>{props.label}</span>
    </div>
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
