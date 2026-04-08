/**
 * TavusInterface — WEB (pure iframe approach)
 *
 * All Daily.co / CVI SDK imports have been removed.
 * The call screen now uses a raw <iframe> to embed the conversation URL,
 * which eliminates the "import.meta" bundling error entirely.
 *
 * This file only provides stub exports so that _layout.tsx and hair-check.tsx
 * resolve without errors.
 */
import React from 'react';

/* CVIProvider: simple pass-through — no Daily context needed with iframe approach */
export function CVIProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/* useMeetingState: not used with iframe approach */
export function useMeetingState(): string | null {
  return null;
}

/* Conversation: not used — call.tsx renders an <iframe> directly */
export function Conversation(_props: {
  conversationUrl: string;
  onLeave: () => void;
}) {
  return null;
}

/* HairCheck: not used — hair-check.tsx renders its own UI on all platforms */
export function HairCheck(_props: {
  isJoinBtnLoading?: boolean;
  onJoin: () => void;
  onCancel?: () => void;
}) {
  return null;
}
