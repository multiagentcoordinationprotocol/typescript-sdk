# Changelog

All notable changes to `macp-sdk-typescript` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `MacpStream.sendSubscribe(sessionId, afterSequence?)` — subscribe-only stream
  frame (RFC-MACP-0006-A1). The runtime replays accepted envelopes from the
  cursor before switching to live broadcast, so non-initiator agents observe
  `SessionStart` and earlier mode envelopes regardless of join order.
- `GrpcTransportAdapter` now sends a subscribe frame automatically on start so
  `Participant`-based agents pick up history without bespoke wiring.
- Unit coverage for `MacpStream.sendSubscribe` (default cursor, custom cursor,
  closed-stream rejection, write-error propagation, sequential resubscribe) and
  `GrpcTransportAdapter` (subscribe ordering, empty-stream subscribe, auth
  pass-through to `openStream`).
- Integration tests for late-subscriber replay and future-cursor skip
  (`tests/integration/runtime.test.ts`).
- Warn-once migration hint when the deprecated `HandoffSession.sendContext()`
  alias is invoked. Scheduled for removal in `0.4.0`; use `addContext()`.
- `docs/api/sessions.md` now documents the identity-guard contract.
- `docs/guides/architecture.md` rewritten to reflect the three-layer design
  (transport / session helpers / agent framework).

### Changed
- Integration tests updated to match the proto field renames that landed in
  `@multiagentcoordinationprotocol/proto@0.1.x`: `Evaluation.analysis` →
  `reason`, `Proposal.description` → `summary`, `TaskRequest.assignee` →
  `requestedAssignee` (Task accept/update/complete/fail/reject now carry an
  `assignee` field), `TaskUpdate.progress` is required, `HandoffContext.data`
  → `context` (+ `contentType`), `HandoffAccept.acceptedBy` and
  `HandoffDecline.declinedBy` are now required.

### Deprecated
- `HandoffSession.sendContext()` remains available as an alias but emits a
  one-shot `console.warn`. Use `HandoffSession.addContext()` instead.

## [0.2.0] — 2026-04-15

Direct-agent authentication (RFC-MACP-0004 §4) hardening. The SDK can now
represent and enforce the authenticated sender identity client-side, so agents
fail fast on identity bugs instead of discovering them as runtime NACKs. See
[`ui-console/plans/direct-agent-auth.md`](../ui-console/plans/direct-agent-auth.md)
for the cross-repo plan.

### Added
- `MacpIdentityMismatchError` (exported from the package root). Raised when an
  explicit `sender` passed to any mode helper or to
  `client.sendSignal`/`client.sendProgress` conflicts with
  `auth.expectedSender`.
- `Auth.bearer(token, { expectedSender })` — structured second argument that
  binds the authenticated identity. The legacy string form
  (`Auth.bearer(token, 'alice')`) still works and preserves pre-0.2 behaviour
  (no guard).
- `AuthConfig.expectedSender` field.
- `assertSenderMatchesIdentity(auth, sender)` exported helper.
- `allowInsecure?: boolean` option on `MacpClient` — required when
  `secure: false` is passed; constructor throws otherwise (RFC-MACP-0006 §3).
- Agent runner (`fromBootstrap`) now honours a bootstrap `allow_insecure`
  flag and binds `expectedSender` to `participant_id` when `auth_token` is
  present.
- `HandoffSession.addContext()` as the canonical name for the
  `HandoffContext` message.
- Public `newSessionId()` export — already re-exported via `envelope.ts` but
  now pinned by a test so it stays visible at the package root.
- Integration test block *Direct-agent auth (pre-allocated sessionId + Bearer)*
  that exercises the full initiator loop (SessionStart → stream → Proposal) and
  a second Bearer client for non-initiator Evaluate + Vote.
- `tests/integration/README.md` documenting the runtime + env-var matrix for
  the new test block.

### Changed
- `MacpClient.secure` now defaults to `true`. Insecure connections require
  `secure: false` *and* `allowInsecure: true` at construction time.
- All example smokes (`examples/*.ts`) pass `allowInsecure: true` alongside
  `secure: false` so local dev continues to work against
  `MACP_ALLOW_INSECURE=1` runtimes.
- `clientVersion` default bumped to `'0.2.0'`.
- `authSender(auth)` now prefers `expectedSender` over `senderHint` /
  `agentId` when resolving the envelope sender fallback.

### Deprecated
- `HandoffSession.sendContext()` renamed to `addContext()`. The old name
  remains as a backwards-compatible alias.

## [0.1.0] — 2026-02-?? (historical)

Initial release. `MacpClient`, five mode-session helpers
(`DecisionSession`, `ProposalSession`, `TaskSession`, `HandoffSession`,
`QuorumSession`), local projections per mode, duplex streaming, policy
builders, and the `Participant`/`Dispatcher`/`Strategies` agent framework.
