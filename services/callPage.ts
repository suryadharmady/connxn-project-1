/**
 * Builds a self-contained HTML page for the native (iOS/Android) call screen.
 *
 * Loads @daily-co/daily-js from CDN, joins the Daily room, connects the
 * ElevenLabs Agent WebSocket, and plays audio via audioCtx.destination
 * (Path A only — clean, no WebRTC routing).
 *
 * Lip-sync animation is not supported on mobile for now.
 */
export function buildCallPageHtml(params: {
  conversationUrl: string;
  elevenLabsAgentId: string;
  conversationId: string;
}): string {
  const { conversationUrl, elevenLabsAgentId, conversationId } = params;
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; width: 100vw; height: 100vh; overflow: hidden; }
    #callContainer { width: 100%; height: 100%; }
    #status { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
      color: white; background: rgba(0,0,0,0.6); padding: 4px 12px;
      border-radius: 12px; font-family: sans-serif; font-size: 13px; z-index: 999; }
  </style>
</head>
<body>
  <div id="callContainer"></div>
  <div id="status">Connecting...</div>
  <script src="https://unpkg.com/@daily-co/daily-js"></script>
  <script>
  (function() {
    var CONVERSATION_URL = ${JSON.stringify(conversationUrl)};
    var AGENT_ID = ${JSON.stringify(elevenLabsAgentId)};
    var CONVERSATION_ID = ${JSON.stringify(conversationId)};

    var audioCtx = null;
    var scheduledUntil = 0;
    var ws = null;
    var frame = null;

    function setStatus(text) {
      var el = document.getElementById('status');
      if (el) el.textContent = text;
    }
    function postToRN(msg) {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
    }

    // ── Audio helpers ──
    function downsample(buffer, srcRate) {
      if (srcRate === 16000) return buffer;
      var ratio = srcRate / 16000;
      var newLen = Math.floor(buffer.length / ratio);
      var out = new Float32Array(newLen);
      for (var i = 0; i < newLen; i++) out[i] = buffer[Math.floor(i * ratio)];
      return out;
    }
    function float32ToB64Pcm(samples) {
      var buf = new ArrayBuffer(samples.length * 2);
      var view = new DataView(buf);
      for (var i = 0; i < samples.length; i++) {
        var s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }
      var bytes = new Uint8Array(buf);
      var bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }
    function b64PcmToFloat32(b64) {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var view = new DataView(bytes.buffer);
      var out = new Float32Array(bytes.length / 2);
      for (var i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
      return out;
    }

    // Path A only: direct to speaker, gapless scheduling at 24kHz
    function scheduleAudio(samples, sr) {
      if (!audioCtx) return;
      var sampleRate = sr || 24000;
      var abuf = audioCtx.createBuffer(1, samples.length, sampleRate);
      abuf.copyToChannel(new Float32Array(samples), 0);
      var now = audioCtx.currentTime;
      if (scheduledUntil < now - 1.5) scheduledUntil = now + 0.05;
      var startAt = Math.max(scheduledUntil, now + 0.01);
      scheduledUntil = startAt + abuf.duration;

      var src = audioCtx.createBufferSource();
      src.buffer = abuf;
      src.connect(audioCtx.destination);
      src.start(startAt);
    }

    // ── ElevenLabs Agent ──
    function connectAgent() {
      if (!AGENT_ID) { setStatus('No agent ID'); return; }
      setStatus('Connecting agent...');
      ws = new WebSocket('wss://api.elevenlabs.io/v1/convai/conversation?agent_id=' + AGENT_ID);
      ws.onopen = function() {
        console.log('[EL] WS connected');
        ws.send(JSON.stringify({ type: 'conversation_initiation_client_data' }));
        startMic();
      };
      ws.onmessage = function(e) {
        try {
          var msg = JSON.parse(e.data);
          if (msg.type === 'audio' && msg.audio_event && msg.audio_event.audio_base_64) {
            var samples = b64PcmToFloat32(msg.audio_event.audio_base_64);
            scheduleAudio(samples, 24000);
          }
          if (msg.type === 'interruption') {
            scheduledUntil = audioCtx ? audioCtx.currentTime : 0;
          }
          if (msg.type === 'ping' && msg.ping_event) {
            ws.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event.event_id }));
          }
        } catch(err) { console.warn('[EL] msg error', err); }
      };
      ws.onclose = function() { console.log('[EL] WS closed'); };
      ws.onerror = function(err) { console.warn('[EL] WS error', err); };
    }

    function startMic() {
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
      }).then(function(stream) {
        var nativeSR = stream.getAudioTracks()[0].getSettings().sampleRate || 48000;
        audioCtx = new AudioContext({ sampleRate: nativeSR });
        scheduledUntil = audioCtx.currentTime;

        var micSource = audioCtx.createMediaStreamSource(stream);
        var scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
        scriptNode.onaudioprocess = function(e) {
          var input = e.inputBuffer.getChannelData(0);
          var down = downsample(input, audioCtx.sampleRate);
          var b64 = float32ToB64Pcm(down);
          if (ws && ws.readyState === 1) ws.send(JSON.stringify({ user_audio_chunk: b64 }));
        };
        micSource.connect(scriptNode);
        var silenceGain = audioCtx.createGain();
        silenceGain.gain.value = 0;
        scriptNode.connect(silenceGain);
        silenceGain.connect(audioCtx.destination);

        postToRN('mic-active');
        setStatus('');
        console.log('[EL] Mic started at ' + audioCtx.sampleRate + 'Hz');
      }).catch(function(err) {
        console.warn('[EL] Mic error', err);
        setStatus('Mic error: ' + err.message);
      });
    }

    // ── Daily.co ──
    window.addEventListener('load', function() {
      if (!window.Daily) {
        setStatus('Failed to load Daily SDK');
        return;
      }

      frame = window.Daily.createFrame(
        document.getElementById('callContainer'),
        {
          iframeStyle: { width: '100%', height: '100%', border: 'none' },
          showLeaveButton: true,
          showFullscreenButton: false,
        }
      );

      frame.on('joined-meeting', function() {
        setStatus('Joined — connecting agent...');
        connectAgent();
      });

      frame.on('left-meeting', function() { postToRN('call-ended'); });
      frame.on('error', function() { postToRN('call-ended'); });

      frame.join({ url: CONVERSATION_URL });
    });
  })();
  </script>
</body>
</html>`;
}
