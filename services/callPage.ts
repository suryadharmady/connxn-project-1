/**
 * Self-contained HTML page for the native WebView call screen.
 * Custom pre-join + in-call UI (no Daily Prebuilt UI).
 * Uses createCallObject so sendAppMessage echo events reach Tavus for lip-sync.
 */
export function buildCallPageHtml(params: {
  conversationUrl: string;
  elevenLabsAgentId: string;
  conversationId: string;
  isDarkMode: boolean;
}): string {
  const { conversationUrl, elevenLabsAgentId, conversationId, isDarkMode } = params;
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <style>
    /* ─ Theme (light/dark from React Native) ─ */
    :root {
      --bg: ${isDarkMode ? '#0F172A' : '#F8FAFC'};
      --card: ${isDarkMode ? 'rgba(30,41,59,0.7)' : 'rgba(255,255,255,0.9)'};
      --card-border: ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
      --accent: ${isDarkMode ? '#00D4AA' : '#00C49A'};
      --accent-dark: ${isDarkMode ? '#00B894' : '#00A67E'};
      --danger: ${isDarkMode ? '#F87171' : '#EF4444'};
      --text-primary: ${isDarkMode ? '#F1F5F9' : '#0F172A'};
      --text-secondary: ${isDarkMode ? '#94A3B8' : '#64748B'};
      --text-muted: ${isDarkMode ? '#64748B' : '#94A3B8'};
      --input-bg: ${isDarkMode ? '#1e293b' : '#FFFFFF'};
      --preview-bg: ${isDarkMode ? '#0b1220' : '#e5e7eb'};
    }
    * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    body { background:var(--bg); width:100vw; height:100vh; overflow:hidden;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      color:var(--text-primary);
    }

    /* ─ Pre-join ─ */
    #prejoin {
      display:flex; flex-direction:column;
      justify-content:center; align-items:center;
      height:100vh; padding:24px; gap:20px;
      padding-top:max(24px, env(safe-area-inset-top));
      padding-bottom:max(24px, env(safe-area-inset-bottom));
    }
    .brand {
      display:flex; flex-direction:column; align-items:center; gap:8px;
    }
    .brand-avatar {
      width:64px; height:64px; border-radius:50%;
      background:linear-gradient(135deg, var(--accent), var(--accent-dark));
      display:flex; align-items:center; justify-content:center;
      font-size:28px;
    }
    .brand-title { color:var(--text-primary); font-size:20px; font-weight:700; }
    .brand-sub { color:var(--text-secondary); font-size:13px; }

    #camera-preview-wrap {
      width:100%; max-width:420px; aspect-ratio:16/9;
      border-radius:20px; overflow:hidden;
      background:var(--preview-bg);
      border:1px solid var(--card-border);
      position:relative;
    }
    #camera-preview {
      width:100%; height:100%; object-fit:cover;
      transform:scaleX(-1); display:block;
    }
    #camera-off-placeholder {
      position:absolute; inset:0; display:none;
      align-items:center; justify-content:center; flex-direction:column; gap:12px;
    }
    #camera-off-placeholder svg { opacity:0.4; }
    #camera-off-placeholder span { color:var(--text-muted); font-size:13px; }
    #camera-preview-label {
      position:absolute; bottom:10px; left:12px;
      color:white; font-size:12px; font-weight:500;
      background:rgba(0,0,0,0.5); padding:4px 10px; border-radius:8px;
      backdrop-filter:blur(8px);
    }
    #flip-cam-btn {
      position:absolute; top:10px; right:10px;
      width:36px; height:36px; border-radius:50%;
      background:rgba(0,0,0,0.5); border:none;
      display:flex; align-items:center; justify-content:center;
      backdrop-filter:blur(8px); cursor:pointer;
    }
    #flip-cam-btn svg { width:18px; height:18px; fill:none;
      stroke:white; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }

    .mic-meter-wrap { width:100%; max-width:420px; }
    .mic-meter-label { color:var(--text-secondary); font-size:12px; margin-bottom:6px; }
    .mic-meter {
      width:100%; height:8px; background:var(--input-bg); border-radius:4px;
      overflow:hidden; border:1px solid var(--card-border);
    }
    .mic-meter-fill {
      height:100%; width:0%;
      background:linear-gradient(90deg, var(--accent), var(--accent-dark));
      transition:width 0.1s ease;
    }

    .device-status { display:flex; gap:14px; }
    .device-item { display:flex; align-items:center; gap:6px;
      color:var(--text-muted); font-size:12px; }
    .device-item.ok { color:var(--accent); }
    .device-item.blocked { color:var(--danger); }
    .device-item svg { width:14px; height:14px; fill:none;
      stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }

    #join-btn {
      width:100%; max-width:420px; height:54px; border:none; cursor:pointer;
      border-radius:14px; font-size:16px; font-weight:700; color:white;
      background:linear-gradient(135deg, var(--accent), var(--accent-dark));
      box-shadow:0 8px 24px rgba(0,212,170,0.3);
    }
    #join-btn:disabled { opacity:0.5; cursor:not-allowed; }
    .join-note { color:var(--text-muted); font-size:11px; text-align:center; }

    /* ─ Connecting ─ */
    #connecting {
      display:none;
      flex-direction:column; align-items:center; justify-content:center;
      height:100vh; gap:16px; background:var(--bg);
    }
    .pulse-avatar {
      width:96px; height:96px; border-radius:50%;
      background:linear-gradient(135deg, var(--accent), var(--accent-dark));
      display:flex; align-items:center; justify-content:center;
      font-size:40px;
      animation:ring-pulse 2s ease infinite;
    }
    @keyframes ring-pulse {
      0% { box-shadow: 0 0 0 0 rgba(0,212,170,0.6); }
      70% { box-shadow: 0 0 0 28px rgba(0,212,170,0); }
      100% { box-shadow: 0 0 0 0 rgba(0,212,170,0); }
    }
    .conn-title { color:var(--text-primary); font-size:22px; font-weight:700; }
    .conn-sub { color:var(--text-secondary); font-size:14px; }
    .spinner {
      width:28px; height:28px; border:3px solid rgba(255,255,255,0.1);
      border-top-color:var(--accent); border-radius:50%;
      animation:spin 0.8s linear infinite; margin-top:8px;
    }
    @keyframes spin { to { transform:rotate(360deg); } }

    /* ─ In-call ─ */
    #incall {
      display:none; position:relative; width:100vw; height:100vh; background:#000;
    }
    #tavus-video {
      position:absolute; inset:0; width:100%; height:100%;
      object-fit:cover; display:block;
    }

    /* User PiP camera */
    #user-pip {
      position:absolute; right:16px;
      bottom:calc(120px + env(safe-area-inset-bottom));
      width:120px; height:68px;
      border-radius:14px; overflow:hidden;
      background:#1e293b;
      border:2px solid rgba(255,255,255,0.2);
      z-index:5; touch-action:none;
      box-shadow:0 8px 20px rgba(0,0,0,0.5);
    }
    #user-pip video {
      width:100%; height:100%; object-fit:cover;
      transform:scaleX(-1);
    }
    #user-pip-off {
      position:absolute; inset:0; display:none;
      align-items:center; justify-content:center;
    }
    #user-pip-off svg { opacity:0.5; }
    #user-pip-label {
      position:absolute; bottom:4px; left:6px;
      color:white; font-size:9px; font-weight:600;
      background:rgba(0,0,0,0.55); padding:2px 5px; border-radius:4px;
    }

    /* Top bar */
    #call-topbar {
      position:absolute; top:0; left:0; right:0;
      height:56px;
      display:flex; justify-content:space-between; align-items:center;
      padding:0 16px;
      padding-top:max(0px, env(safe-area-inset-top));
      background:rgba(0,0,0,0.4);
      backdrop-filter:blur(12px);
      -webkit-backdrop-filter:blur(12px);
      z-index:10;
    }
    .tb-left { display:flex; align-items:center; gap:10px; }
    .tb-avatar {
      width:32px; height:32px; border-radius:50%;
      background:linear-gradient(135deg, var(--accent), var(--accent-dark));
      display:flex; align-items:center; justify-content:center;
      font-size:16px;
    }
    .tb-name {
      color:white; font-size:14px; font-weight:600;
      display:flex; align-items:center; gap:6px;
    }
    .ai-badge {
      font-size:9px; font-weight:800;
      color:var(--accent); background:rgba(0,212,170,0.15);
      padding:2px 6px; border-radius:4px; letter-spacing:0.5px;
    }
    #call-timer {
      color:white; font-size:14px; font-weight:600;
      font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    /* Bottom controls */
    #call-controls {
      position:absolute; bottom:0; left:0; right:0;
      height:96px;
      display:flex; justify-content:center; align-items:flex-start; gap:16px;
      padding:12px 12px;
      padding-bottom:max(12px, env(safe-area-inset-bottom));
      background:rgba(0,0,0,0.6);
      backdrop-filter:blur(16px);
      -webkit-backdrop-filter:blur(16px);
      z-index:10;
    }
    .swipe-hint {
      position:absolute; top:6px; left:50%; transform:translateX(-50%);
      width:32px; height:3px; border-radius:2px;
      background:rgba(255,255,255,0.25);
    }
    .ctrl-col {
      display:flex; flex-direction:column; align-items:center; gap:4px;
    }
    .ctrl-btn {
      width:52px; height:52px; border-radius:50%; border:none; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      background:rgba(255,255,255,0.15);
      backdrop-filter:blur(10px);
      transition:transform 0.1s;
      flex-shrink:0;
    }
    .ctrl-btn:active { transform:scale(0.92); }
    .ctrl-btn.muted { background:rgba(248,113,113,0.9); }
    .ctrl-btn.leave { width:60px; height:60px; background:#F87171; }
    .ctrl-btn.disabled { opacity:0.4; }
    .ctrl-btn svg { width:22px; height:22px; fill:none;
      stroke:white; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    .ctrl-btn.leave svg { width:26px; height:26px; }
    .ctrl-label {
      color:rgba(255,255,255,0.75); font-size:10px; font-weight:500;
    }

    /* View toggle button in top bar */
    #view-toggle-btn {
      width:36px; height:36px; border-radius:8px; border:none;
      background:rgba(255,255,255,0.1); cursor:pointer;
      display:flex; align-items:center; justify-content:center;
    }
    #view-toggle-btn svg { width:18px; height:18px; fill:none;
      stroke:white; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }

    /* Split view layout */
    #incall.split #tavus-video {
      width:100%; height:50%; top:0; inset:auto;
      transition:height 0.3s ease, width 0.3s ease;
    }
    #incall.split #user-pane {
      display:block; position:absolute; left:0; right:0;
      top:50%; bottom:96px;
      background:#0b1220; overflow:hidden; z-index:4;
    }
    #incall.split #user-pip { display:none; }
    #user-pane { display:none; }
    #user-pane video { width:100%; height:100%; object-fit:cover; transform:scaleX(-1); }
    #user-pane-label {
      position:absolute; bottom:12px; left:12px;
      color:white; font-size:12px; background:rgba(0,0,0,0.55);
      padding:4px 10px; border-radius:8px; font-weight:600;
    }

    /* Settings bottom sheet */
    #settings-sheet {
      position:absolute; left:0; right:0; bottom:0;
      max-height:70vh; overflow-y:auto;
      background:rgba(15,23,42,0.96);
      backdrop-filter:blur(20px);
      -webkit-backdrop-filter:blur(20px);
      border-top-left-radius:24px; border-top-right-radius:24px;
      border-top:1px solid rgba(255,255,255,0.1);
      padding:20px;
      padding-bottom:max(20px, env(safe-area-inset-bottom));
      transform:translateY(100%); transition:transform 0.3s ease;
      z-index:20;
    }
    #settings-sheet.open { transform:translateY(0); }
    .sheet-header {
      display:flex; justify-content:space-between; align-items:center;
      margin-bottom:16px;
    }
    .sheet-title { color:white; font-size:18px; font-weight:700; }
    .sheet-close {
      width:32px; height:32px; border-radius:50%; border:none;
      background:rgba(255,255,255,0.1); cursor:pointer;
      display:flex; align-items:center; justify-content:center;
    }
    .sheet-close svg { width:18px; height:18px; fill:none;
      stroke:white; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    .sheet-section { margin-bottom:16px; }
    .sheet-section label {
      color:rgba(255,255,255,0.7); font-size:12px;
      display:block; margin-bottom:6px;
    }
    .sheet-select {
      width:100%; height:40px; padding:0 12px; border-radius:10px;
      background:rgba(255,255,255,0.08); color:white;
      border:1px solid rgba(255,255,255,0.1); font-size:13px;
    }
    .sheet-note {
      color:rgba(255,255,255,0.5); font-size:11px; margin-top:4px;
    }
    #settings-backdrop {
      position:absolute; inset:0; background:rgba(0,0,0,0.5);
      display:none; z-index:19;
    }
    #settings-backdrop.open { display:block; }
  </style>
</head>
<body>

<!-- ─ PRE-JOIN ─ -->
<div id="prejoin">
  <div class="brand">
    <div class="brand-avatar">&#x2728;</div>
    <div class="brand-title">Ready to join?</div>
    <div class="brand-sub">AI Creator · AI Video Call</div>
  </div>

  <div id="camera-preview-wrap">
    <video id="camera-preview" autoplay playsinline muted></video>
    <div id="camera-off-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="1.5">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h4a2 2 0 012 2v9.34"/>
      </svg>
      <span>Camera is off</span>
    </div>
    <button id="flip-cam-btn" title="Flip camera">
      <svg viewBox="0 0 24 24">
        <polyline points="23 4 23 10 17 10"/>
        <polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
      </svg>
    </button>
    <div id="camera-preview-label">You</div>
  </div>

  <div class="mic-meter-wrap">
    <div class="mic-meter-label">Microphone level</div>
    <div class="mic-meter">
      <div class="mic-meter-fill" id="mic-meter-fill"></div>
    </div>
  </div>

  <div class="device-status">
    <div class="device-item" id="cam-status">
      <svg viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
      <span>Camera</span>
    </div>
    <div class="device-item" id="mic-status">
      <svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
      <span>Microphone</span>
    </div>
  </div>

  <button id="join-btn" disabled>Checking devices...</button>
  <p class="join-note">You'll join as a guest · Mic and camera only used during the call</p>
</div>

<!-- ─ CONNECTING ─ -->
<div id="connecting">
  <div class="pulse-avatar">&#x2728;</div>
  <div class="conn-title">Connecting...</div>
  <div class="conn-sub">Setting up your call</div>
  <div class="spinner"></div>
</div>

<!-- ─ IN-CALL ─ -->
<div id="incall">
  <video id="tavus-video" autoplay playsinline muted></video>

  <!-- User camera (PiP in normal view, full pane in split view) -->
  <div id="user-pip">
    <video id="user-pip-video" autoplay playsinline muted></video>
    <div id="user-pip-off">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8">
        <circle cx="12" cy="8" r="4"/>
        <path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
      </svg>
    </div>
    <div id="user-pip-label">You</div>
  </div>

  <!-- User pane (split view only) -->
  <div id="user-pane">
    <video id="user-pane-video" autoplay playsinline muted></video>
    <div id="user-pane-label">You</div>
  </div>

  <div id="call-topbar">
    <div class="tb-left">
      <div class="tb-avatar">&#x2728;</div>
      <div class="tb-name">AI Creator <span class="ai-badge">AI</span></div>
    </div>
    <div style="display:flex; align-items:center; gap:12px">
      <div id="call-timer">0:00</div>
      <button id="view-toggle-btn" title="Toggle view">
        <svg id="view-toggle-icon" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
        </svg>
      </button>
    </div>
  </div>

  <div id="call-controls">
    <div class="swipe-hint"></div>

    <div class="ctrl-col">
      <button class="ctrl-btn" id="mic-btn">
        <svg id="mic-icon" viewBox="0 0 24 24">
          <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
          <path d="M19 10v2a7 7 0 01-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>
      <span class="ctrl-label" id="mic-label">Mic</span>
    </div>

    <div class="ctrl-col">
      <button class="ctrl-btn" id="cam-btn">
        <svg id="cam-icon" viewBox="0 0 24 24">
          <polygon points="23 7 16 12 23 17 23 7"/>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>
      </button>
      <span class="ctrl-label">Camera</span>
    </div>

    <div class="ctrl-col">
      <button class="ctrl-btn leave" id="leave-btn">
        <svg viewBox="0 0 24 24">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
        </svg>
      </button>
      <span class="ctrl-label">End</span>
    </div>

    <div class="ctrl-col">
      <button class="ctrl-btn" id="settings-btn">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </button>
      <span class="ctrl-label">Settings</span>
    </div>

    <div class="ctrl-col">
      <button class="ctrl-btn" id="split-btn">
        <svg id="split-btn-icon" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
        </svg>
      </button>
      <span class="ctrl-label" id="split-label">Split</span>
    </div>
  </div>

  <!-- Settings bottom sheet backdrop + sheet -->
  <div id="settings-backdrop"></div>
  <div id="settings-sheet">
    <div class="sheet-header">
      <span class="sheet-title">Call Settings</span>
      <button class="sheet-close" id="settings-close">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="sheet-section">
      <label>Microphone</label>
      <select class="sheet-select" id="mic-select"><option value="">Default mic</option></select>
    </div>
    <div class="sheet-section">
      <label>Camera</label>
      <select class="sheet-select" id="cam-select"><option value="">Default camera</option></select>
      <div class="sheet-note">Tap "Camera" button to toggle on/off</div>
    </div>
    <div class="sheet-section">
      <label>Speaker</label>
      <div class="sheet-select" style="display:flex; align-items:center; color:rgba(255,255,255,0.5)">
        Controlled by device volume
      </div>
      <div class="sheet-note">Use volume buttons to adjust speaker output</div>
    </div>
  </div>
</div>

<script src="https://unpkg.com/@daily-co/daily-js"></script>
<script>
(function() {
  // ── Forward console to React Native DevTools ──
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

  // ── Audio/agent state ──
  var audioCtx = null;
  var ws = null;
  var frame = null;
  var turnChunks = [];
  var turnTimer = null;
  var micMuted = false;

  // ── UI state ──
  var prejoinEl   = document.getElementById('prejoin');
  var connectEl   = document.getElementById('connecting');
  var incallEl    = document.getElementById('incall');
  var camPreview  = document.getElementById('camera-preview');
  var camOffEl    = document.getElementById('camera-off-placeholder');
  var camStatus   = document.getElementById('cam-status');
  var micStatus   = document.getElementById('mic-status');
  var joinBtn     = document.getElementById('join-btn');
  var flipCamBtn  = document.getElementById('flip-cam-btn');
  var micBtn      = document.getElementById('mic-btn');
  var camBtn      = document.getElementById('cam-btn');
  var leaveBtn    = document.getElementById('leave-btn');
  var timerEl     = document.getElementById('call-timer');
  var tavusVideo  = document.getElementById('tavus-video');
  var userPipEl   = document.getElementById('user-pip');
  var userPipVideo = document.getElementById('user-pip-video');
  var userPipOff  = document.getElementById('user-pip-off');
  var micMeterFill = document.getElementById('mic-meter-fill');

  var preJoinCamStream = null;
  var preJoinMicStream = null;
  var preJoinAnalyser = null;
  var preJoinAnalyserCtx = null;
  var preJoinRaf = 0;
  var facingMode = 'user';
  var userCamStream = null;
  var userCamOff = false;
  var callStartTime = null;
  var timerInterval = null;

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
  // ── ElevenLabs Agent (unchanged) ──
  function connectAgent() {
    console.log('[EL] Connecting agent...');
    if (!AGENT_ID) { console.warn('[EL] No agent ID'); return; }
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
        if (msg.type && msg.type !== 'audio' && msg.type !== 'ping') {
          console.log('[EL] Event:', msg.type);
        }
        if (msg.type === 'audio' && msg.audio_event && msg.audio_event.audio_base_64) {
          // User hears via Tavus echo replay audio track (not direct playback).
          // Accumulate raw base64 chunks for the sendAppMessage echo.
          turnChunks.push(msg.audio_event.audio_base_64);
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
      'frame:', !!frame, 'hasSendAppMessage:', !!(frame && frame.sendAppMessage));
    if (!frame || turnChunks.length === 0) return;
    try {
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
        'samples:', allSamples.length, 'duration:', (allSamples.length / 24000).toFixed(2) + 's');
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
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: nativeSR });

      var micSource = audioCtx.createMediaStreamSource(stream);
      var scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
      scriptNode.onaudioprocess = function(e) {
        if (micMuted) return;
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

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage('mic-active');
      }
      console.log('[EL] Mic started at ' + audioCtx.sampleRate + 'Hz');
    }).catch(function(err) {
      console.warn('[EL] Mic error', err);
    });
  }

  // ── Pre-join camera preview ──
  function startCameraPreview() {
    if (preJoinCamStream) {
      preJoinCamStream.getTracks().forEach(function(t) { t.stop(); });
      preJoinCamStream = null;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode } })
      .then(function(stream) {
        preJoinCamStream = stream;
        camPreview.srcObject = stream;
        camPreview.style.display = 'block';
        camOffEl.style.display = 'none';
        camStatus.className = 'device-item ok';
        camStatus.querySelector('span').textContent = 'Camera ready';
      })
      .catch(function() {
        camPreview.style.display = 'none';
        camOffEl.style.display = 'flex';
        camStatus.className = 'device-item blocked';
        camStatus.querySelector('span').textContent = 'Camera blocked';
      });
  }
  startCameraPreview();

  // Flip camera on pre-join
  flipCamBtn.addEventListener('click', function() {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    startCameraPreview();
  });

  // Pre-join mic analyser
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(function(stream) {
      preJoinMicStream = stream;
      preJoinAnalyserCtx = new AudioContext();
      var src = preJoinAnalyserCtx.createMediaStreamSource(stream);
      preJoinAnalyser = preJoinAnalyserCtx.createAnalyser();
      preJoinAnalyser.fftSize = 256;
      src.connect(preJoinAnalyser);
      micStatus.className = 'device-item ok';
      micStatus.querySelector('span').textContent = 'Mic ready';
      joinBtn.disabled = false;
      joinBtn.textContent = 'Join Now';
      animateMicMeter();
    })
    .catch(function() {
      micStatus.className = 'device-item blocked';
      micStatus.querySelector('span').textContent = 'Mic blocked';
      joinBtn.disabled = false;
      joinBtn.textContent = 'Join Now';
    });

  function animateMicMeter() {
    if (!preJoinAnalyser) return;
    var data = new Uint8Array(preJoinAnalyser.frequencyBinCount);
    function draw() {
      if (!preJoinAnalyser) return;
      preJoinAnalyser.getByteFrequencyData(data);
      var avg = 0;
      for (var i = 0; i < 32; i++) avg += data[i];
      avg = avg / 32;
      var level = Math.min(1, avg / 128);
      if (micMeterFill) micMeterFill.style.width = (level * 100) + '%';
      preJoinRaf = requestAnimationFrame(draw);
    }
    draw();
  }

  function stopPreJoinStreams() {
    if (preJoinRaf) { cancelAnimationFrame(preJoinRaf); preJoinRaf = 0; }
    if (preJoinCamStream) {
      preJoinCamStream.getTracks().forEach(function(t) { t.stop(); });
      preJoinCamStream = null;
    }
    if (preJoinMicStream) {
      preJoinMicStream.getTracks().forEach(function(t) { t.stop(); });
      preJoinMicStream = null;
    }
    if (preJoinAnalyserCtx) {
      preJoinAnalyserCtx.close().catch(function() {});
      preJoinAnalyserCtx = null;
    }
    preJoinAnalyser = null;
  }

  // ── In-call user camera PiP ──
  function startUserCam() {
    if (userCamOff) return;
    if (userCamStream) {
      userCamStream.getTracks().forEach(function(t) { t.stop(); });
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode } })
      .then(function(stream) {
        userCamStream = stream;
        userPipVideo.srcObject = stream;
        userPipVideo.style.display = 'block';
        userPipOff.style.display = 'none';
        var pane = document.getElementById('user-pane-video');
        if (pane) pane.srcObject = stream;
      })
      .catch(function() {
        userCamOff = true;
        userPipVideo.style.display = 'none';
        userPipOff.style.display = 'flex';
        camBtn.className = 'ctrl-btn muted';
      });
  }

  function stopUserCam() {
    if (userCamStream) {
      userCamStream.getTracks().forEach(function(t) { t.stop(); });
      userCamStream = null;
    }
    userPipVideo.srcObject = null;
    userPipVideo.style.display = 'none';
    userPipOff.style.display = 'flex';
    var pane = document.getElementById('user-pane-video');
    if (pane) pane.srcObject = null;
  }

  // Toggle camera button in-call
  camBtn.addEventListener('click', function() {
    userCamOff = !userCamOff;
    if (userCamOff) {
      stopUserCam();
      camBtn.className = 'ctrl-btn muted';
    } else {
      startUserCam();
      camBtn.className = 'ctrl-btn';
    }
  });

  // Touch drag for PiP on mobile
  (function setupPipDrag() {
    if (!userPipEl) return;
    var dragging = false;
    var dragX = 0, dragY = 0, initX = 0, initY = 0;
    userPipEl.addEventListener('touchstart', function(e) {
      dragging = true;
      var t = e.touches[0];
      initX = t.clientX - dragX;
      initY = t.clientY - dragY;
    });
    userPipEl.addEventListener('touchmove', function(e) {
      if (!dragging) return;
      var t = e.touches[0];
      dragX = t.clientX - initX;
      dragY = t.clientY - initY;
      userPipEl.style.transform = 'translate(' + dragX + 'px, ' + dragY + 'px)';
      e.preventDefault();
    }, { passive: false });
    userPipEl.addEventListener('touchend', function() { dragging = false; });
  })();

  // ── JOIN BUTTON ──
  joinBtn.addEventListener('click', function() {
    stopPreJoinStreams();
    prejoinEl.style.display = 'none';
    connectEl.style.display = 'flex';
    joinDaily();
  });

  // ── LEAVE BUTTON ──
  leaveBtn.addEventListener('click', function() {
    if (timerInterval) clearInterval(timerInterval);
    if (userCamStream) { userCamStream.getTracks().forEach(function(t) { t.stop(); }); }
    if (ws) { try { ws.close(); } catch(e) {} }
    if (frame) { try { frame.destroy(); } catch(e) {} }
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage('call-ended');
    }
  });

  // ── MIC TOGGLE ──
  micBtn.addEventListener('click', function() {
    micMuted = !micMuted;
    micBtn.className = micMuted ? 'ctrl-btn muted' : 'ctrl-btn';
    var label = document.getElementById('mic-label');
    if (label) label.textContent = micMuted ? 'Muted' : 'Mic';
  });

  // ── SETTINGS SHEET ──
  var settingsBtn = document.getElementById('settings-btn');
  var settingsSheet = document.getElementById('settings-sheet');
  var settingsBackdrop = document.getElementById('settings-backdrop');
  var settingsClose = document.getElementById('settings-close');
  var micSelect = document.getElementById('mic-select');
  var camSelect = document.getElementById('cam-select');

  function openSettings() {
    settingsSheet.classList.add('open');
    settingsBackdrop.classList.add('open');
    populateDeviceSelects();
  }
  function closeSettings() {
    settingsSheet.classList.remove('open');
    settingsBackdrop.classList.remove('open');
  }
  settingsBtn.addEventListener('click', openSettings);
  settingsClose.addEventListener('click', closeSettings);
  settingsBackdrop.addEventListener('click', closeSettings);

  function populateDeviceSelects() {
    navigator.mediaDevices.enumerateDevices().then(function(devices) {
      var mics = devices.filter(function(d) { return d.kind === 'audioinput'; });
      var cams = devices.filter(function(d) { return d.kind === 'videoinput'; });
      micSelect.innerHTML = '';
      for (var i = 0; i < mics.length; i++) {
        var opt = document.createElement('option');
        opt.value = mics[i].deviceId;
        opt.textContent = mics[i].label || ('Mic (' + mics[i].deviceId.slice(0, 6) + ')');
        micSelect.appendChild(opt);
      }
      camSelect.innerHTML = '';
      for (var j = 0; j < cams.length; j++) {
        var copt = document.createElement('option');
        copt.value = cams[j].deviceId;
        copt.textContent = cams[j].label || ('Camera (' + cams[j].deviceId.slice(0, 6) + ')');
        camSelect.appendChild(copt);
      }
    });
  }

  // ── SPLIT VIEW TOGGLE ──
  var splitView = false;
  var splitBtn = document.getElementById('split-btn');
  var splitLabel = document.getElementById('split-label');
  var viewToggleBtn = document.getElementById('view-toggle-btn');
  var userPaneVideo = document.getElementById('user-pane-video');

  function applySplitView() {
    if (splitView) {
      incallEl.classList.add('split');
      splitLabel.textContent = 'Full';
      // Attach user camera stream to user-pane video (same stream as PiP)
      if (userCamStream) {
        userPaneVideo.srcObject = userCamStream;
      }
    } else {
      incallEl.classList.remove('split');
      splitLabel.textContent = 'Split';
    }
  }
  splitBtn.addEventListener('click', function() {
    splitView = !splitView;
    applySplitView();
  });
  if (viewToggleBtn) {
    viewToggleBtn.addEventListener('click', function() {
      splitView = !splitView;
      applySplitView();
    });
  }

  // ── DAILY (createCallObject for full SDK control) ──
  function joinDaily() {
    if (!window.Daily) {
      console.warn('[Daily] SDK not loaded');
      return;
    }
    frame = window.Daily.createCallObject({
      subscribeToTracksAutomatically: false,
    });
    console.log('[EL] Daily call object created');

    frame.on('track-started', function(event) {
      if (!event || !event.track) return;
      var p = event.participant;
      if (!p || p.local) return;

      if (event.track.kind === 'video') {
        if (tavusVideo) {
          tavusVideo.srcObject = new MediaStream([event.track]);
          console.log('[Daily] Tavus video track attached');
        }
      }

      if (event.track.kind === 'audio') {
        var existing = document.getElementById('tavus-audio-el');
        if (!existing) {
          var audioEl = document.createElement('audio');
          audioEl.id = 'tavus-audio-el';
          audioEl.autoplay = true;
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);
          existing = audioEl;
        }
        existing.srcObject = new MediaStream([event.track]);
        console.log('[Daily] Tavus audio track attached');
      }
    });

    frame.on('track-stopped', function(event) {
      if (!event || !event.track) return;
      if (event.track.kind === 'video') {
        if (tavusVideo) { tavusVideo.srcObject = null; }
      }
      if (event.track.kind === 'audio') {
        var el = document.getElementById('tavus-audio-el');
        if (el) { el.srcObject = null; el.remove(); }
      }
    });

    frame.on('participant-joined', function(event) {
      var p = event && event.participant;
      if (!p || p.local) return;
      try {
        frame.updateParticipant(p.session_id, {
          setSubscribedTracks: { audio: true, video: true },
        });
      } catch(e) {}
    });

    frame.on('joined-meeting', function() {
      console.log('[EL] Daily joined-meeting');
      connectEl.style.display = 'none';
      incallEl.style.display = 'block';
      startUserCam();
      callStartTime = Date.now();
      timerInterval = setInterval(function() {
        var elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        var m = Math.floor(elapsed / 60);
        var s = elapsed % 60;
        timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
      }, 1000);

      try {
        var participants = frame.participants();
        Object.keys(participants).forEach(function(id) {
          if (participants[id].local) return;
          frame.updateParticipant(id, {
            setSubscribedTracks: { audio: true, video: true },
          });
        });
      } catch(e) {}

      connectAgent();
    });

    frame.on('left-meeting', function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage('call-ended');
      }
    });

    frame.on('error', function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage('call-ended');
      }
    });

    console.log('[EL] Joining Daily room...');
    frame.join({ url: CONVERSATION_URL });
  }
})();
</script>
</body>
</html>`;
}
