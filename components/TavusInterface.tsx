/**
 * TavusInterface — NATIVE fallback (iOS / Android)
 *
 * Provides stub implementations so imports from '@/components/TavusInterface'
 * resolve without pulling in @daily-co/daily-react or any browser-only code.
 */
import React from 'react';

/* CVIProvider: simple pass-through on native (no Daily context needed) */
export function CVIProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/* useMeetingState: always returns null on native */
export function useMeetingState(): string | null {
  return null;
}

/* Conversation / HairCheck should never be rendered on native — the app
   uses WebView instead.  Exporting typed stubs avoids import errors. */
export function Conversation(_props: {
  conversationUrl: string;
  onLeave: () => void;
}) {
  return null;
}

export function HairCheck(_props: {
  isJoinBtnLoading?: boolean;
  onJoin: () => void;
  onCancel?: () => void;
}) {
  return null;
}
