# 0001 — PWA first, native client later if needed

- **Status:** Accepted
- **Date:** 2026-11-06

## Context
We need an iPhone app and a Mac app. Native iOS requires Swift and an Apple Developer
Program membership ($99/year) for TestFlight, push notifications and builds that don't
expire after 7 days. Account sharing violates Apple's terms. A web app (PWA) installed to
the Home Screen (iOS) or Dock (macOS Safari) supports offline storage and Web Push (iOS 16.4+).

## Decision
Build a **PWA** (React + TypeScript + Vite) served by the Spring Boot backend.
Design the backend API to be client-agnostic so a native SwiftUI app can be added later
without backend changes.

## Consequences
- No Apple fee, one codebase for iPhone, Mac and any browser.
- PWAs cannot register in the iOS share sheet → sharing links (R2) goes through an
  **iOS Shortcut** that POSTs the URL to the API.
- Somewhat less native feel; no widgets/Siri. Revisit if this becomes painful.
