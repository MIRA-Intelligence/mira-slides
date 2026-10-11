#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// bento/type: what each copy for someone else may carry.
//   node scripts/test-type-copies.ts
//
// Every outward copy is built by the kernel's `projectForCopy` with type's
// field-class map (type/src/docclass.ts). This rig runs EVERY outward builder
// type has against two sources:
//
//   FULL    carries a whole earlier draft (revisions), an internal comment
//           thread, a real signature, a real owner key, and a field this build
//           does not declare. Each carries a MARKER string a leak would show.
//   BARE    carries none of the history at all (the absent-field lesson: a rule
//           can quietly skip a field the fixture never had, so every rule is
//           also run against a source that LACKS the field).
//
// The FULL fixture is built through type's own constructors — newThread /
// writeThreads, canon's sign, mintCollab — and then through parseDoc, so it is
// the shape the app actually holds. Before any "the copy does not carry X"
// check, the rig asserts the SOURCE does carry X: a fixture that silently
// lost its comment would make every "no comment in the copy" check pass for
// free, which is how a rig ends up certifying a leak.
//
// Builders (type has exactly these three; there is no duplicate or template
// copy, and print renders HTML without embedding the document):
//   readerCopy   share.ts   tier 'reader'
//   inviteCopy   share.ts   tier 'invite', with and without history
//   docForExport model.ts   tier 'copyJSON' — Copy document JSON AND mail merge

import { register } from 'node:module'
register('./lib/ts-resolve-hooks.mjs', import.meta.url)

const { readerCopy, inviteCopy } = await import('../type/src/share.ts')
const { emptyDoc, parseDoc, docForExport } = await import('../type/src/model.ts')
const { mergeDoc } = await import('../type/src/merge.ts')
const { newThread, writeThreads } = await import('../type/src/comments.ts')
const { sign, newKey } = await import('../type/src/canon.ts')
const { TYPE_FIELDS, HISTORY_CLASS } = await import('../type/src/docclass.ts')
const { mintCollab } = await import('../kernel/src/sync/online.ts')
import type { TypeDoc } from '../type/src/model.ts'

let checks = 0, failures = 0
const ok = (c: boolean, m: string) => { checks++; if (!c) { failures++; console.log(`  FAIL  ${m}`) } else console.log(`  ok    ${m}`) }
const H = (s: string) => console.log(`\n=== ${s} ===`)

const DRAFT = 'DELETED-DRAFT-WORDING-30-DAYS'
const NOTE = 'INTERNAL-COMMENT-WE-CAN-GO-TO-90'
const FUTURE = 'UNDECLARED-FUTURE-FIELD-VALUE'

async function full(): Promise<{ doc: TypeDoc; ownerPriv: string }> {
  const collab = await mintCollab()
  const d = { ...emptyDoc(), title: 'Services Agreement', collab } as TypeDoc
  d.body = [{ id: 'p1', kind: 'para', text: 'Payment is due within 60 days.' }]
  d.revisions = [{ id: 'rev1', at: '2026-10-01T00:00:00.000Z', label: 'Revision 1',
                   body: [{ id: 'p1', kind: 'para', text: DRAFT }] }]
  writeThreads(d, [newThread(d.body[0], 0, 7, 'Bob', NOTE)])
  d.signatures = [await sign(d, await newKey(), { name: 'Alice', prev: null })]
  ;(d as Record<string, unknown>).futureField = FUTURE
  const r = parseDoc(JSON.stringify(d))
  if (!r.ok) throw new Error('FULL fixture did not parse')
  return { doc: r.doc, ownerPriv: collab.ownerPriv as string }
}

async function bare(): Promise<{ doc: TypeDoc; ownerPriv: string }> {
  const collab = await mintCollab()
  const raw = { ...emptyDoc(), collab } as Record<string, unknown>
  raw.body = [{ id: 'p1', kind: 'para', text: 'Payment is due within 60 days.' }]
  delete raw.revisions; delete raw.signatures; delete raw.comments
  const r = parseDoc(JSON.stringify(raw))
  if (!r.ok) throw new Error('BARE fixture did not parse')
  return { doc: r.doc, ownerPriv: collab.ownerPriv as string }
}

const has = (o: unknown, s: string) => JSON.stringify(o).includes(s)
const carriesHistory = (o: TypeDoc) =>
  (o.revisions?.length ?? 0) > 0 || (o.signatures?.length ?? 0) > 0 || o.comments !== undefined

H('the FULL fixture really carries everything a leak would show')
const F = await full()
ok(has(F.doc, DRAFT), 'the source holds a whole earlier draft in revisions')
ok(has(F.doc, NOTE), 'the source holds an internal comment thread (it survived parseDoc)')
ok(F.doc.signatures.length === 1, 'the source holds a real signature')
ok(has(F.doc, FUTURE), 'the source holds a field this build does not declare')
ok(typeof (F.doc.collab as { ownerPriv?: string }).ownerPriv === 'string', 'the source holds a real owner private key')

H('a VIEW-ONLY copy carries no history (tier reader)')
{
  const r = readerCopy(F.doc)
  ok(!has(r, DRAFT), 'no earlier draft — the wording negotiated away stays here')
  ok(!has(r, NOTE), 'no internal comment')
  ok(!r.signatures?.length, 'no signatures: one covering history the copy lacks would read "changed" forever')
  for (const k of HISTORY_CLASS) ok(!(k in r), `${k} is absent as a FIELD, not merely emptied`)
  ok(!has(r, FUTURE), 'an undeclared field does not ride along')
  ok(r.readonly === true, 'the copy is read-only (set by the tier, not by the source)')
  ok(!('ownerPriv' in (r.collab as object)), 'and holds no owner key')
  ok(r.collab?.role === 'reader' && r.collab?.on === true, 'and is a live reader')
  ok(r.body[0].text === F.doc.body[0].text && r.title === F.doc.title, 'while the document itself is intact')
}
{
  const B = await bare()
  const r = readerCopy(B.doc)
  ok(r.readonly === true, 'BARE: still read-only — the mode is a property of the tier, not of the source')
  ok(!carriesHistory(r), 'BARE: invents no history')
  ok(r.body[0].text === B.doc.body[0].text, 'BARE: content intact')
}

H('Copy document JSON carries no history and no credentials (tier copyJSON)')
{
  const j = docForExport(F.doc)
  ok(!has(j, DRAFT) && !has(j, NOTE) && !j.signatures?.length, 'no draft, no comment, no signature')
  ok(!('collab' in j), 'no collaboration block at all')
  ok(!has(j, FUTURE), 'no undeclared field')
  ok(j.body[0].text === F.doc.body[0].text && j.docId === F.doc.docId, 'content and identity intact')
  const B = await bare()
  ok(!carriesHistory(docForExport(B.doc)), 'BARE: invents no history')
}

H('mail merge: every letter is a new document with no history (copyJSON + a fresh identity)')
{
  const a = mergeDoc(F.doc, { Name: 'Ada' }, ['Name'], 'list.bento.html')
  const b = mergeDoc(F.doc, { Name: 'Grace' }, ['Name'], 'list.bento.html')
  ok(a.docId !== b.docId, 'two letters have distinct docIds')
  ok(a.docId !== F.doc.docId && b.docId !== F.doc.docId, 'neither reuses the source document\'s identity')
  for (const [n, m] of [['first', a], ['second', b]] as const) {
    ok(!has(m, DRAFT) && !has(m, NOTE), `the ${n} letter carries no draft and no comment`)
    ok(!m.signatures.length && !m.revisions.length, `the ${n} letter carries no signatures and no revisions`)
    ok(!('collab' in m), `the ${n} letter carries no collaboration block`)
  }
  const B = await bare()
  ok(!carriesHistory(mergeDoc(B.doc, { Name: 'X' }, ['Name'], 's')), 'BARE: invents no history')
}

H('an INVITE keeps history by default, and leaves it out when asked (tier invite)')
{
  const keep = await inviteCopy(F.doc, F.ownerPriv)
  ok(has(keep, DRAFT) && has(keep, NOTE) && keep.signatures.length === 1,
    'by default the invitee gets the history — the kernel\'s invite rule')
  ok(!('ownerPriv' in (keep.collab as object)), 'but never the owner key')
  ok(keep.collab?.on === true, 'and joins live')
  ok(!has(keep, FUTURE), 'an undeclared field stays behind even here — an invite is a file for someone else')
  ok(keep.readonly !== true, 'an editor copy is not read-only')

  const out = await inviteCopy(F.doc, F.ownerPriv, { withHistory: false })
  for (const k of HISTORY_CLASS) ok(!(k in out), `"Leave version history out" drops ${k}`)
  ok(!has(out, DRAFT) && !has(out, NOTE), 'so the earlier draft and the comment are gone')
  ok(out.body[0].text === F.doc.body[0].text, 'and the document itself is untouched')
  ok(out.collab?.on === true && !!(out.collab as { invite?: unknown }).invite, 'still a working invite')

  const B = await bare()
  ok(!carriesHistory(await inviteCopy(B.doc, B.ownerPriv)), 'BARE: invents no history')
}

H('the class map is the single source')
{
  ok(TYPE_FIELDS.revisions === 'history' && TYPE_FIELDS.comments === 'history' &&
     TYPE_FIELDS.signatures === 'history', 'revisions, comments and signatures are history')
  ok([...HISTORY_CLASS].sort().join() === 'comments,revisions,signatures',
    'the invite opt-out list is DERIVED from the map, not hand-listed')
}

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures) process.exit(1)
