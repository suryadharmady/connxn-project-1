const API_BASE = 'https://tavusapi.com/v2';
const API_KEY = process.env.EXPO_PUBLIC_TAVUS_API_KEY ?? '';
const PERSONA_ID = process.env.EXPO_PUBLIC_PERSONA_ID ?? '';
const REPLICA_ID = process.env.EXPO_PUBLIC_REPLICA_ID ?? '';

// Test persona with ElevenLabs TTS (pre-configured on Tavus side)
const TEST_PERSONA_ID = process.env.EXPO_PUBLIC_TAVUS_TEST_PERSONA_ID ?? '';

export interface ConversationResponse {
  conversation_id: string;
  conversation_name: string;
  conversation_url: string;
  status: 'active' | 'ended';
  created_at: string;
}

export async function createConversation(customGreeting?: string): Promise<ConversationResponse> {
  const activePersona = TEST_PERSONA_ID || PERSONA_ID;
  if (TEST_PERSONA_ID) {
    console.log('[Tavus] Using test persona (ElevenLabs voice):', TEST_PERSONA_ID);
  }

  const body: Record<string, any> = {
    persona_id: activePersona,
    replica_id: REPLICA_ID,
    conversation_name: 'Support Session',
    properties: {
      max_call_duration: 1800,
      enable_closed_captions: true,
    },
  };
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
