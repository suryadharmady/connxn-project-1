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
    // Forward console to React Native DevTools
    var _origLog = console.log;
    var _origWarn = console.warn;
    console.log = function() {
      _origLog.apply(console, arguments);
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage('LOG:' + Array.prototype.join.call(arguments, ' '));
        }
      } catch(e) {}
    };
    console.warn = function() {
      _origWarn.apply(console, arguments);
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage('WARN:' + Array.prototype.join.call(arguments, ' '));
        }
      } catch(e) {}
    };

    var CONVERSATION_URL = ${JSON.stringify(conversationUrl)};
    var AGENT_ID = ${JSON.stringify(elevenLabsAgentId)};
    var CONVERSATION_ID = ${JSON.stringify(conversationId)};

    var audioCtx = null;
    var ws = null;
    var frame = null;
    var turnChunks = []; // accumulated raw base64 chunks per agent turn
    var turnTimer = null; // 300ms silence timer to trigger echo send

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
    // ── ElevenLabs Agent ──
    // User hears audio only through Tavus echo playback in Daily room.
    function connectAgent() {
      console.log('[EL] Connecting agent...');
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
          console.log('[EL] WS msg type:', msg.type);
          // Log every event type for debugging
          if (msg.type && msg.type !== 'audio' && msg.type !== 'ping') {
            console.log('[EL] Event:', msg.type);
          }
          if (msg.type === 'audio' && msg.audio_event && msg.audio_event.audio_base_64) {
            // Accumulate for Tavus echo lip-sync
            turnChunks.push(msg.audio_event.audio_base_64);
            // Reset 800ms silence timer — fires when audio stops arriving
            if (turnTimer) clearTimeout(turnTimer);
            turnTimer = setTimeout(function() {
              if (turnChunks.length >= 3 && frame) {
                console.log('[EL] Silence timer fired, sending echo, chunks:', turnChunks.length);
                sendTurnEcho();
              }
              turnTimer = null;
            }, 800);
          }
          if (msg.type === 'interruption') {
            console.log('[EL] interruption, clearing', turnChunks.length, 'chunks');
            if (turnTimer) { clearTimeout(turnTimer); turnTimer = null; }
            turnChunks = [];
          }
          if (msg.type === 'ping' && msg.ping_event) {
            ws.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event.event_id }));
          }
        } catch(err) { console.warn('[EL] msg error', err); }
      };
      ws.onclose = function() { console.log('[EL] WS closed'); };
      ws.onerror = function(err) { console.warn('[EL] WS error', err); };
    }

    function sendTurnEcho() {
      console.log('[EL] sendTurnEcho called, chunks:', turnChunks.length,
        'frame:', !!frame, 'frameType:', typeof frame,
        'hasSendAppMessage:', !!(frame && frame.sendAppMessage));
      if (!frame || turnChunks.length === 0) return;
      try {
        // Decode all chunks, concatenate into one PCM buffer
        var allSamples = [];
        for (var i = 0; i < turnChunks.length; i++) {
          var bin = atob(turnChunks[i]);
          var bytes = new Uint8Array(bin.length);
          for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
          var view = new DataView(bytes.buffer);
          for (var k = 0; k < bytes.length / 2; k++) {
            allSamples.push(view.getInt16(k * 2, true));
          }
        }
        // Re-encode as one base64 PCM buffer
        var pcm = new ArrayBuffer(allSamples.length * 2);
        var outView = new DataView(pcm);
        for (var i = 0; i < allSamples.length; i++) {
          outView.setInt16(i * 2, allSamples[i], true);
        }
        var outBytes = new Uint8Array(pcm);
        var outBin = '';
        for (var i = 0; i < outBytes.length; i++) outBin += String.fromCharCode(outBytes[i]);
        var b64 = btoa(outBin);

        var echoMsg = {
          message_type: 'conversation',
          event_type: 'conversation.echo',
          conversation_id: CONVERSATION_ID,
          properties: {
            modality: 'audio',
            audio: b64,
            sample_rate: 24000,
            done: 'true'
          }
        };
        console.log('[EL] Sending sendAppMessage, audio_b64_len:', b64.length,
          'samples:', allSamples.length, 'duration:', (allSamples.length / 24000).toFixed(2) + 's',
          'conversation_id:', CONVERSATION_ID);
        frame.sendAppMessage(echoMsg, '*');
        console.log('[EL] sendAppMessage SUCCESS');
      } catch(err) {
        console.warn('[EL] sendAppMessage FAILED:', err, err && err.message);
      }
      turnChunks = [];
    }

    function startMic() {
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
      }).then(function(stream) {
        var nativeSR = stream.getAudioTracks()[0].getSettings().sampleRate || 48000;
        audioCtx = new AudioContext({ sampleRate: nativeSR });

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
      console.log('[EL] Daily frame created');

      frame.on('joined-meeting', function() {
        console.log('[EL] Daily joined-meeting');
        setStatus('Joined — connecting agent...');

        // Mute Tavus participant audio after a short delay so user
        // only hears Path A (ElevenLabs direct). Path B (echo) drives
        // lip-sync animation only.
        setTimeout(function() {
          var mediaEls = document.querySelectorAll('video, audio');
          for (var i = 0; i < mediaEls.length; i++) {
            mediaEls[i].muted = true;
            mediaEls[i].volume = 0;
          }
          console.log('[EL] Muted', mediaEls.length, 'media elements');
        }, 2000);

        // Observe new media elements and mute them too
        var observer = new MutationObserver(function() {
          var els = document.querySelectorAll(
            'video:not([data-el-muted]), audio:not([data-el-muted])'
          );
          for (var i = 0; i < els.length; i++) {
            els[i].muted = true;
            els[i].volume = 0;
            els[i].setAttribute('data-el-muted', '1');
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        connectAgent();
      });

      frame.on('left-meeting', function() { postToRN('call-ended'); });
      frame.on('error', function() { postToRN('call-ended'); });

      console.log('[EL] Joining Daily room...');
      frame.join({ url: CONVERSATION_URL });
    });
  })();
  </script>
</body>
</html>`;
}
