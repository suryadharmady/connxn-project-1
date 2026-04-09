const API_BASE = 'https://tavusapi.com/v2';
const API_KEY = process.env.EXPO_PUBLIC_TAVUS_API_KEY ?? '';
const REPLICA_ID = process.env.EXPO_PUBLIC_REPLICA_ID ?? '';

// Echo-mode persona: pipeline_mode="echo" disables Tavus's own STT/LLM/TTS.
// The replica only animates when we send conversation.echo events with audio.
// Created via POST /v2/personas { persona_name, pipeline_mode: "echo" }
const ECHO_PERSONA_ID = process.env.EXPO_PUBLIC_TAVUS_ECHO_PERSONA_ID ?? '';

export interface ConversationResponse {
  conversation_id: string;
  conversation_name: string;
  conversation_url: string;
  status: 'active' | 'ended';
  created_at: string;
}

export async function createConversation(customGreeting?: string): Promise<ConversationResponse> {
  // Echo / passthrough mode: pipeline_mode="echo" on the persona disables
  // Tavus's own STT/LLM/TTS pipeline. The replica sits idle and only
  // animates when we send conversation.echo events with audio data.
  // All conversation logic is handled by the ElevenLabs Agent externally.

  if (!ECHO_PERSONA_ID) {
    console.warn('[Tavus] No EXPO_PUBLIC_TAVUS_ECHO_PERSONA_ID set — replica will run its own pipeline!');
  }
  console.log('[Tavus] Creating echo-mode conversation with persona:', ECHO_PERSONA_ID || '(none)');

  const body: Record<string, any> = {
    replica_id: REPLICA_ID,
    conversation_name: 'Support Session',
    properties: {
      max_call_duration: 1800,
      enable_closed_captions: true,
    },
  };

  // Attach the echo persona to disable Tavus STT/LLM/TTS
  if (ECHO_PERSONA_ID) {
    body.persona_id = ECHO_PERSONA_ID;
  }
  if (customGreeting && customGreeting.trim().length > 0) {
    body.custom_greeting = customGreeting.trim();
  }

  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `API error ${res.status}`);
  }

  return res.json();
}

export async function endConversation(conversationId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/end`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `API error ${res.status}`);
  }
}

export async function getConversation(conversationId: string): Promise<ConversationResponse> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}`, {
    method: 'GET',
    headers: {
      'x-api-key': API_KEY,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `API error ${res.status}`);
  }

  return res.json();
}
