/**
 * ElevenLabs Conversational AI Agent — WebSocket client
 *
 * Manages the real-time WebSocket connection to an ElevenLabs Agent.
 * Protocol: wss://api.elevenlabs.io/v1/convai/conversation?agent_id=<AGENT_ID>
 *
 * Input  → base64-encoded PCM (16 kHz, 16-bit, mono)
 * Output ← audio events with base64-encoded PCM chunks
 */

const WS_BASE = 'wss://api.elevenlabs.io/v1/convai/conversation';

type AudioOutputCallback = (base64Audio: string, eventId: number) => void;
type AgentResponseCallback = (text: string) => void;
type StatusCallback = () => void;
type TranscriptCallback = (text: string, isFinal: boolean, speaker: 'user' | 'agent') => void;

export class ElevenLabsAgent {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnects = 3;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private agentId = '';
  private apiKey = '';
  private destroyed = false;

  // Output sample rate reported by the server (default 24000 — ElevenLabs standard)
  public outputSampleRate = 24000;

  // Callbacks
  private _onAudioOutput: AudioOutputCallback | null = null;
  private _onAgentResponse: AgentResponseCallback | null = null;
  private _onInterruption: StatusCallback | null = null;
  private _onConnected: StatusCallback | null = null;
  private _onDisconnected: StatusCallback | null = null;
  private _onTranscript: TranscriptCallback | null = null;

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  connect(agentId: string, apiKey?: string): void {
    this.agentId = agentId;
    this.apiKey = apiKey ?? '';
    this.destroyed = false;
    this.reconnectAttempts = 0;
    this._openSocket();
  }

  sendAudioChunk(pcmBase64: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ user_audio_chunk: pcmBase64 }));
  }

  onAudioOutput(cb: AudioOutputCallback): void {
    this._onAudioOutput = cb;
  }

  onAgentResponse(cb: AgentResponseCallback): void {
    this._onAgentResponse = cb;
  }

  onInterruption(cb: StatusCallback): void {
    this._onInterruption = cb;
  }

  onConnected(cb: StatusCallback): void {
    this._onConnected = cb;
  }

  onDisconnected(cb: StatusCallback): void {
    this._onDisconnected = cb;
  }

  onTranscript(cb: TranscriptCallback): void {
    this._onTranscript = cb;
  }

  disconnect(): void {
    this.destroyed = true;
    this._clearTimers();
    if (this.ws) {
      console.log('[ElevenLabs] Disconnecting');
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this._onDisconnected?.();
  }

  /* ------------------------------------------------------------------ */
  /*  Internal                                                           */
  /* ------------------------------------------------------------------ */

  private _openSocket(): void {
    if (this.destroyed) return;

    const url = `${WS_BASE}?agent_id=${this.agentId}`;
    console.log('[ElevenLabs] Opening WebSocket…', url);

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      console.log('[ElevenLabs] WebSocket connected');
      this.reconnectAttempts = 0;

      // Send initiation message (with optional signed URL auth)
      const initMsg: Record<string, any> = {
        type: 'conversation_initiation_client_data',
      };
      // If an API key is provided, include it for auth
      // ElevenLabs signed-url flow may not need this, but include if set
      ws.send(JSON.stringify(initMsg));
      console.log('[ElevenLabs] Sent conversation_initiation_client_data');

      this._startPing();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(typeof event.data === 'string' ? event.data : '');
        this._handleMessage(data);
      } catch (err) {
        console.warn('[ElevenLabs] Failed to parse message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[ElevenLabs] WebSocket error:', err);
    };

    ws.onclose = (event) => {
      console.log('[ElevenLabs] WebSocket closed:', event.code, event.reason);
      this._clearTimers();
      this.ws = null;

      if (!this.destroyed) {
        this._tryReconnect();
      } else {
        this._onDisconnected?.();
      }
    };
  }

  private _handleMessage(data: any): void {
    console.log('[EL Agent] msg type:', data.type);
    switch (data.type) {
      case 'conversation_initiation_metadata': {
        console.log('[ElevenLabs] Got initiation metadata');
        // Extract output format if provided
        const outFmt = data.conversation_initiation_metadata_event?.agent_output_audio_format;
        if (outFmt === 'pcm_24000') {
          this.outputSampleRate = 24000;
        } else if (outFmt === 'pcm_22050') {
          this.outputSampleRate = 22050;
        } else if (outFmt === 'pcm_44100') {
          this.outputSampleRate = 44100;
        } else {
          this.outputSampleRate = 24000;
        }
        console.log('[ElevenLabs] Output sample rate:', this.outputSampleRate);
        this._onConnected?.();
        break;
      }

      case 'audio': {
        const audioB64 = data.audio_event?.audio_base_64;
        const eventId = data.audio_event?.event_id ?? 0;
        if (audioB64) {
          this._onAudioOutput?.(audioB64, eventId);
        }
        break;
      }

      case 'agent_response': {
        const text = data.agent_response_event?.agent_response
          ?? data.response ?? data.text ?? '';
        if (text) {
          console.log('[ElevenLabs] Agent response:', text.slice(0, 80));
          this._onAgentResponse?.(text);
          this._onTranscript?.(text, true, 'agent');
        }
        break;
      }

      case 'agent_response_correction':
      case 'transcript': {
        const text = data.transcript_event?.transcript ?? data.transcript ?? '';
        const speaker: 'user' | 'agent' = data.role === 'user' ? 'user' : 'agent';
        if (text) this._onTranscript?.(text, true, speaker);
        break;
      }

      case 'interruption': {
        console.log('[ElevenLabs] Interruption detected');
        this._onInterruption?.();
        break;
      }

      case 'ping': {
        // Respond to server pings
        if (data.ping_event?.event_id != null) {
          this.ws?.send(JSON.stringify({
            type: 'pong',
            event_id: data.ping_event.event_id,
          }));
        }
        break;
      }

      case 'user_transcript':
      case 'user_transcription': {
        const transcript = data.user_transcription_event?.user_transcript
          ?? data.transcript ?? data.text ?? '';
        if (transcript) {
          console.log('[ElevenLabs] User said:', transcript.slice(0, 80));
          this._onTranscript?.(transcript, true, 'user');
        }
        break;
      }

      default:
        // Log unhandled event types for debugging
        if (data.type) {
          console.log('[ElevenLabs] Event:', data.type);
        }
        break;
    }
  }

  private _startPing(): void {
    // Keep-alive pings every 25 seconds (in case server expects them)
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25_000);
  }

  private _tryReconnect(): void {
    if (this.destroyed || this.reconnectAttempts >= this.maxReconnects) {
      console.log('[ElevenLabs] Max reconnect attempts reached, giving up');
      this._onDisconnected?.();
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);
    console.log(`[ElevenLabs] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnects})`);

    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) {
        this._openSocket();
      }
    }, delay);
  }

  private _clearTimers(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
