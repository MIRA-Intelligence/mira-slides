#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Whole-document restore: applyRestore (kernel/src/docfields.ts).
//
//   node scripts/test-restore.ts
//
// The class-driven generalisation of keepLiveIdentity for undo/redo, version
// restore and crash recovery. A field's behaviour is decided per field from its
// class, with per-field overrides, and the RESTORE DIRECTION matters:
//   - 'back'    (undo/redo, version restore): going back in time — a 'live' field
//               keeps the live value, so identity and history don't roll back.
//   - 'recover' (crash recovery): the incoming snapshot is a NEWER copy of THIS
//               document — a 'live' history field is reconciled with it (a
//               revision made just before the crash must survive).
// Overrides: type's comments are class 'history' (copy reasons) but must be
// undoable/restorable, so they are keepLive 'follows'. Recover hooks: a field
// may bind one (newestListWins for an UNSIGNED list); a signed list uses the
// default (follow incoming), or a tie can pair a signature with history it never
// signed.
//
// Mutations (edit kernel/src/docfields.ts, re-run — each reds a row):
//   - applyRestore, make a 'live' field follow on 'back'   : identity/history roll back
//   - applyRestore, drop the recover history reconciliation : a newer revision is lost on recover
//   - applyRestore, drop "absent never wipes on recover"    : a missing key wipes live
//   - newestListWins, tie `>` → `>=`                        : a trim is lost (tie takes incoming)

import { applyRestore, defaultKeepLive, newestListWins } from '../kernel/src/docfields.ts'
import type { RestoreRules } from '../kernel/src/docfields.ts'
import type { FieldClass } from '../kernel/src/docfields.ts'

let failures = 0, checks = 0
const ok = (c: boolean, m: string) => { checks++; if (!c) { failures++; console.log(`  FAIL  ${m}`) } else console.log(`  ok    ${m}`) }
const H = (s: string) => console.log(`\n=== ${s} ===`)
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
type Rec = Record<string, unknown>

const CLASSES: Record<string, FieldClass> = {
  title: 'content', body: 'content',
  docId: 'identity', collab: 'capability', readonly: 'mode', template: 'mode',
  revisions: 'history', trail: 'history', comments: 'history',
}
// comments: history class (copy), but restorable/undoable → keepLive 'follows'
const RULES: RestoreRules = { classes: CLASSES, keepLive: { comments: 'follows' } }

const live = (): Rec => ({
  title: 'live title', body: 'live body',
  docId: 'LIVE-ID', collab: { key: 'LIVE' }, readonly: false, template: false,
  revisions: [{ id: 'r1', at: '2026-01-01' }, { id: 'r2', at: '2026-02-01' }],
  comments: { t1: 'live' }, mystery: 'live-x',
})
const incoming = (over: Rec = {}): Rec => ({
  title: 'incoming title', body: 'incoming body',
  docId: 'OLD-ID', collab: { key: 'OLD' }, readonly: true, template: true,
  revisions: [{ id: 'r1', at: '2026-01-01' }],
  comments: { t1: 'incoming' }, mystery: 'incoming-x', ...over,
})

H('defaultKeepLive: content/unknown follow; identity/mode/capability/history live')
{
  ok(defaultKeepLive('content') === 'follows', 'content follows')
  ok(defaultKeepLive(undefined) === 'follows', 'an unknown field follows')
  ok(defaultKeepLive('identity') === 'live' && defaultKeepLive('capability') === 'live', 'identity + capability live')
  ok(defaultKeepLive('mode') === 'live' && defaultKeepLive('history') === 'live', 'mode + history live')
}

H('back (version restore): content follows; identity/mode/capability + history stay live')
{
  const r = applyRestore(live(), incoming(), 'back', RULES) as Rec
  ok(r.title === 'incoming title', 'content follows the version')
  ok(r.docId === 'LIVE-ID', 'identity stays live (a restore never rolls back docId)')
  ok((r.collab as Rec)?.key === 'LIVE', 'capability stays live')
  ok(r.readonly === false, 'mode stays live')
  ok(eq(r.revisions, live().revisions), 'history (revisions) stays LIVE — a version restore does not discard newer revisions')
  ok((r.comments as Rec)?.t1 === 'incoming', 'comments (keepLive override) FOLLOW the version')
  ok(r.mystery === 'incoming-x', 'an unknown field follows')
}

H('recover (crash): the newer snapshot wins content AND history; identity still live')
{
  const r = applyRestore(live(), incoming(), 'recover', RULES) as Rec
  ok(r.title === 'incoming title', 'content follows the newer snapshot')
  ok(r.docId === 'LIVE-ID', 'identity is still kept live on recover (same document)')
  ok(eq(r.revisions, incoming().revisions), 'history follows the snapshot on recover — a revision made just before the crash survives')
  ok((r.comments as Rec)?.t1 === 'incoming', 'comments follow the snapshot on recover')
}

H('absent never wipes on recover; but a back restore reflects the version exactly')
{
  const inc = incoming(); delete inc.revisions; delete inc.comments; delete inc.mystery
  const r = applyRestore(live(), inc, 'recover', RULES) as Rec
  ok(eq(r.revisions, live().revisions), 'a history field ABSENT from the snapshot keeps the live value (never wiped)')
  ok((r.comments as Rec)?.t1 === 'live', 'a follows field absent on recover keeps live')
  ok(r.mystery === 'live-x', 'an unknown field absent on recover keeps live')
  // version restore is exact: a field the version lacks is dropped
  const inc2 = incoming(); delete inc2.comments
  const r2 = applyRestore(live(), inc2, 'back', RULES) as Rec
  ok(!('comments' in r2), 'on back, a follows field the version lacks is dropped (the version had none)')
}

H('recover hooks: newestListWins (unsigned lists) vs the default (signed-safe)')
{
  const RH: RestoreRules = { classes: CLASSES, recover: { revisions: newestListWins } }
  // snapshot OLDER than live → keep the live list (a skewed older snapshot can't drop days/revisions)
  const older = applyRestore(live(), incoming(), 'recover', RH) as Rec
  ok(eq(older.revisions, live().revisions), 'newestListWins keeps the live list when the snapshot is older')
  // snapshot NEWER → take it
  const incNew = incoming({ revisions: [{ id: 'r1', at: '2026-01-01' }, { id: 'r2', at: '2026-02-01' }, { id: 'r3', at: '2026-03-01' }] })
  ok((applyRestore(live(), incNew, 'recover', RH) as Rec).revisions as unknown[], 'and takes the snapshot when it is newer')
  ok(((applyRestore(live(), incNew, 'recover', RH) as Rec).revisions as unknown[]).length === 3, '…all three revisions')
  // trim + re-sign makes a TIE on the newest `at`. newestListWins keeps live (the
  // untrimmed list), which for a SIGNED list would be wrong — hence the default.
  const liveFull: Rec = { ...live(), revisions: [{ id: 'r1', at: '2026-01-01' }, { id: 'r2', at: '2026-02-01' }, { id: 'r3', at: '2026-03-01' }] }
  const incTrim = incoming({ revisions: [{ id: 'r3', at: '2026-03-01' }] }) // trimmed + re-signed; same newest at
  ok(((applyRestore(liveFull, incTrim, 'recover', RH) as Rec).revisions as unknown[]).length === 3,
    'newestListWins resolves a tie to LIVE (never merges) — which is why a SIGNED list must NOT bind it')
  // the DEFAULT (no hook) follows the snapshot: the self-consistent trimmed+signed unit
  const def = (applyRestore(liveFull, incTrim, 'recover', { classes: CLASSES }) as Rec).revisions as Array<Rec>
  ok(def.length === 1 && def[0].id === 'r3', 'the default follows the snapshot — the self-consistent unit a signed list needs')
}

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures ? 1 : 0)
