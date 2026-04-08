# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always read `.claude/skills/SUPERPOWERS.md` at the start of every session and follow its instructions.

## Project Overview

Expo React Native app for AI-powered video calls using the Tavus Conversational Video Interface (CVI). Runs on Web, iOS, and Android from a single codebase. The app creates Tavus conversations via their API, then renders the video call using Daily.co's WebRTC infrastructure — directly on web via the Daily SDK, and through a WebView on native platforms.

## Commands

```bash
npx expo start          # Start dev server (press w for web, a for Android, i for iOS)
npx expo start --web    # Web only
npx expo start --android
npx expo start --ios
npx expo lint           # ESLint
npx tsc --noEmit        # Type-check without emitting
npx expo export --platform web  # Production web build → dist/
```

## Architecture

### Platform-Split Pattern

The critical architectural pattern: files named `Component.tsx` are the **native (iOS/Android)** implementation, while `Component.web.tsx` is the **web** implementation. Metro/webpack automatically resolves the correct file per platform.

Key split files:
- `components/TavusInterface.tsx` — Native stubs (returns null for Conversation/HairCheck since native uses WebView)
- `components/TavusInterface.web.tsx` — Web implementation wrapping Daily.co SDK (`@daily-co/daily-react`)
- `hooks/use-color-scheme.ts` / `hooks/use-color-scheme.web.ts` — Platform-specific color scheme detection

**Why this matters:** `@daily-co/daily-react` and browser APIs (`MediaStream`, `navigator.mediaDevices`) must never be imported in the native bundle — they crash because these browser APIs don't exist on native. All Daily.co imports are isolated in `.web.tsx` files.

### Call Flow

1. **Home (`app/index.tsx`)** → User taps Start Call
2. **API call** → `services/tavusApi.ts` creates a Tavus conversation, returns `conversation_url` (a Daily.co room URL)
3. **Call screen (`app/call.tsx`)** → On web: renders via CVI components + Daily SDK. On native: loads `conversation_url` in a WebView with injected JS to hide Daily's default UI
4. **End** → `app/call-ended.tsx` shows duration, auto-redirects home after 5s

### CVI Components (`components/cvi/`)

These are the Custom Video Interface components that wrap Daily.co's React SDK for the web platform only. They provide the video grid, device selection, audio visualization, and call controls. They use CSS Modules for styling. These components are only imported by `TavusInterface.web.tsx`.

### Theming

- `contexts/ThemeContext.tsx` — React Context providing `useTheme()` with `colors`, `isDark`, `toggleTheme()`, `setMode('light'|'dark'|'system')`
- `constants/theme.ts` — `LightColors` and `DarkColors` palettes plus `Spacing`, `FontSize`, `BorderRadius` design tokens
- All screens/components use `useTheme()` for dynamic colors; `BlurView` from `expo-blur` for glassmorphism effects

### Routing

Expo Router file-based routing in `app/`. Four screens in a Stack navigator with fade transitions. Route params pass `conversationId` and `conversationUrl` to the call screen, and `duration` to call-ended.

## Environment Variables

Defined in `.env` (never commit). Prefixed with `EXPO_PUBLIC_` so they're accessible in client code:

```
EXPO_PUBLIC_TAVUS_API_KEY=...
EXPO_PUBLIC_PERSONA_ID=...
EXPO_PUBLIC_REPLICA_ID=...
```

## Key Constraints

- **Localhost exception:** Web permission checks for `navigator.mediaDevices` are bypassed on localhost since HTTPS is not available during development. This logic exists in both `app/index.tsx` and `components/TavusInterface.web.tsx`.
- **Metro + jotai:** `metro.config.js` forces CJS resolution for jotai to avoid `import.meta` errors. Don't change `resolverMainFields` without testing.
- **Native camera/mic:** On native, permissions must be requested via `expo-camera` and `expo-av` before navigating to the WebView call screen, because the WebView permission prompt is unreliable.
- **New Architecture** and **React Compiler** are both enabled (`app.json` experiments).
- Path alias `@/*` maps to project root (configured in tsconfig.json).

API credentials are in `.env` — never commit this file.
