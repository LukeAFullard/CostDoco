# Phase 6 — Open Questions Resolved

**Goal:** lock in decisions for the eight open questions raised in `PROJECT_PLAN.md` §8, and carry the consequences through to the phases already written.

**Depends on:** Phases 0–5 exist as context; several steps below amend those documents directly rather than adding new features.

## Decisions

### 1. Hosting: same domain, subpath — not subdomain
Confirmed: `timedoco.com/costs` (a subpath), not a subdomain (`costs.timedoco.com`). This distinction matters: a subpath is the *same origin* as `timedoco.com` (same scheme + host + port), while a subdomain is a *different* origin. Same-origin means IndexedDB, localStorage, etc. on `timedoco.com/costs` and `timedoco.com/` are technically reachable from each other's scripts — this is what makes a future direct-access Bridge possible (see §6 below), rather than the file-based hand-off originally assumed.

Action items:
- Vite config: set `base: '/costs/'` so built asset URLs resolve correctly under the subpath.
- PWA manifest + service worker: scope both to `/costs/`, not `/`, so CostDoco's service worker doesn't attempt to control the whole origin (and vice versa for TimeDoco's).
- Give CostDoco's manifest a distinct `name`/`short_name`/icon set from TimeDoco's, so the two are distinguishable once both are installed from the same domain.
- IndexedDB database name: use a distinct, namespaced name (e.g. `costdoco-db`) as a matter of convention — same-origin doesn't force a collision, but distinct names remove any ambiguity now, before any direct-access Bridge is built.
- Flag as an infra/deployment task, not just app code: whatever serves `timedoco.com` needs to route `/costs/*` to CostDoco's build output. Not scoped further here — deployment platform isn't decided yet.

### 2. liteparse-wasm version: pin `wasm-v2.14.0`
Confirmed current as of 25 Aug 2026. Relevant changes since the `wasm-v2.8.1` baseline used in Phase 0: memory optimisation during rasterization/OCR (helps with large phone-camera photos), and a fix removing O(n²) behaviour around bounding-box handling (helps the Phase 2 correction UI on receipts with dense text). Also introduces worker pools — worth using so OCR runs off the main thread, keeping the crop/correction UI responsive during recognition.

Action: update the version pin in `docs/implementation/00-foundation.md` step 6 and `PROJECT_PLAN.md` §5 from `>= wasm-v2.8.1` to `wasm-v2.14.0`.

### 3. Receipt number vs. tax number: one built-in field + user-defined custom fields
Ship one built-in field (`receiptNumber`). Do not hard-code a second `vendorTaxNumber` field. Instead, build a generic custom-fields mechanism, matching TimeDoco's pattern: a `settings`-level list of user-defined field labels, and a `customFields: Record<string, string>` bag on each receipt. A user who needs to track vendor tax numbers adds "Vendor Tax Number" as a custom field once, and it becomes available on every receipt from then on.

Action: amend `01-data-model-and-manual-entry.md` — remove the hard-coded `vendorTaxNumber` field, add `customFields`, add a step for managing custom-field definitions.

### 4. Currency: per-receipt, with manual conversion
Each receipt keeps its own `currency` and the original transaction amounts, unchanged and un-converted — that's the source-of-truth figure for that specific document. Alongside it, the user can optionally enter a manually-calculated `convertedAmount` in their own reporting/home currency. No live exchange-rate lookups (no network dependency, no rate-history complexity). Reports must sum `convertedAmount` where present and keep receipts without one in a separate, clearly-labelled un-converted subtotal — never silently combine mixed currencies into one number.

Action: amend `01-data-model-and-manual-entry.md` (add `convertedAmount` field, add a `homeCurrency` setting) and `03-reporting-export-backup.md` (CSV/PDF totals logic).

### 5. Encryption: not recoverable, and it must say so unmissably
Confirms Phase 4 Part A's existing recommendation. Strengthen the enable-encryption flow specifically: require the user to type a short confirmation phrase (e.g. "I understand this cannot be recovered"), not just tick a checkbox, before encryption is turned on. A checkbox is too easy to dismiss without reading.

Action: amend `04-security-and-bridge.md` step 1 with this explicit confirmation-phrase requirement.

### 6. Bridge: same domain confirmed, but build it last
Same-domain hosting (§1) makes a direct-access Bridge realistic later, but it is explicitly not being designed yet — features first, Bridge mechanism to be decided once Phases 0–6 are stable in practice. Pull Bridge work out of Phase 4 entirely; it becomes its own final phase, deliberately left unscoped for now.

Action: remove the Bridge section from `04-security-and-bridge.md` (encryption stands alone as Phase 4). Add a placeholder **Phase 7 — Suite Bridge** to the roadmap, unscoped until Phases 0–6 are done and the same-domain hosting is confirmed in production.

### 7. CSV export: generic, for now
Confirmed — Phase 3's generic column set stands. Named templates for specific accounting tools (Xero, QuickBooks, etc.) become a future enhancement, not a v1 requirement.

Action: swap this in as a new Phase 5 stretch candidate, replacing the now-resolved currency item (see §4 above).

### 8. Categorisation: "Uncategorized" is a valid state
Confirmed — a receipt can be saved with no group. Implementation choice: don't seed a literal "Uncategorized" group record in the database (it could be renamed or deleted by the user, which would break the fallback). Instead, treat `groupId: undefined` as "Uncategorized" purely at the UI/reporting layer — list and filter views show an "Uncategorized" bucket for any receipt without a group, with no real group record backing it.

Action: matches what Phase 1 already built (group is optional) — no schema change, just confirms the UI should render the undefined case as a labelled bucket rather than a blank.

## Definition of Done
- `PROJECT_PLAN.md` §8 shows all eight questions resolved, with the roadmap reflecting Phase 6 and the new Phase 4 / Phase 7 split.
- `00-foundation.md`, `01-data-model-and-manual-entry.md`, `03-reporting-export-backup.md`, `04-security-and-bridge.md`, and `05-stretch-enhancements.md` are updated to match — no earlier document should still describe the pre-Phase-6 assumptions (old version pin, hard-coded tax-number field, unresolved currency handling, or a Phase 4 that includes Bridge export).
