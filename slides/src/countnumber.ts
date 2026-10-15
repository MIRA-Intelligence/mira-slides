// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
//
// Reading and writing an AUTHORED number for the count-up (present.ts
// runCountUp). Pure, so scripts/test-slides-countup-number.ts pins the rules
// — the maintainer's 2026-10-15 ruling on #584: a single dot is a decimal
// point (`12.500` is twelve point five); only a well-formed group pattern
// with two or more separators (`1.250.000`) is thousands.

/**
 * How a number was WRITTEN, so the count-up can put it back the same way.
 *
 * The number must settle exactly as the author typed it. Routing through
 * `Intl.NumberFormat(navigator.language)` is the tempting fix and the wrong
 * one: slide content is authored, so the same deck would read `1,234.5` for
 * one viewer and `1.234,5` for another. Locale follows the viewer for CHROME
 * only (`PLATFORM.md` §3).
 */
export interface NumberShape {
  value: number
  decimals: number
  group: string   // separator between thousands, '' if the author used none
  point: string   // decimal separator, '' if the number is an integer
}

/**
 * Read an authored number. Separators are genuinely ambiguous, so the rules
 * are stated rather than guessed:
 *
 * - BOTH `.` and `,` present → the LAST one is the decimal point, the other
 *   groups. `1,234.5` → 1234.5, `1.234,5` → 1234.5.
 * - Only `,` → grouping if there are several (`1,234,567`), or if a single one
 *   is followed by exactly three digits (`1,234`). Otherwise a decimal comma
 *   (`1,23`, `1,2345`).
 * - Only `.` → a decimal point, with one exception. A single dot reads as a
 *   decimal point, always: a deck writing `1.234` means
 *   one-point-two-three-four, and reading it as grouping would break every
 *   three-decimal number to fix a rarer case. The exception is a well-formed
 *   group pattern, `-?\d{1,3}(\.\d{3}){2,}`, which needs at least two
 *   separators and three digits in every group after the first, with an
 *   optional leading minus: `1.250.000` and `-1.250.000` cannot be a decimal
 *   point under any convention, so they group and settle as the author typed
 *   them rather than as `1250.000`. Anything else with two or more dots,
 *   like `1.2.3` or `192.168.1.1`, stays on the decimal path, because reading
 *   those as groups would rewrite version strings and addresses into numbers
 *   that look legitimate.
 */
export function readNumber(raw: string): NumberShape {
  const dots = (raw.match(/\./g) ?? []).length
  const commas = (raw.match(/,/g) ?? []).length
  let point = ''
  if (dots && commas) point = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? '.' : ','
  else if (commas) point = commas > 1 || /,\d{3}$/.test(raw) ? '' : ','
  // Two or more dots group, but only when the token is a well-formed group pattern.
  // `dots > 1` alone is too broad: it would read `1.2.3` as 123 and
  // `192.168.1.1` as 19.216.811, which is a version string and an address
  // being rewritten into plausible-looking numbers. Requiring three-digit
  // groups after the first keeps those on the documented decimal path.
  else if (dots) point = /^-?\d{1,3}(\.\d{3}){2,}$/.test(raw) ? '' : '.'
  const group = point === '.' ? (commas ? ',' : '')
    : point === ',' ? (dots ? '.' : '')
      : (commas ? ',' : dots ? '.' : '')
  const cut = point ? raw.lastIndexOf(point) : -1
  const whole = (cut >= 0 ? raw.slice(0, cut) : raw).replace(/[.,]/g, '')
  const frac = cut >= 0 ? raw.slice(cut + 1) : ''
  return { value: Number(frac ? `${whole}.${frac}` : whole), decimals: frac.length, group, point }
}

/** Put a number back in the author's own convention. */
export function writeNumber(value: number, shape: NumberShape): string {
  const fixed = value.toFixed(shape.decimals)
  const dot = fixed.indexOf('.')
  let whole = dot >= 0 ? fixed.slice(0, dot) : fixed
  const frac = dot >= 0 ? fixed.slice(dot + 1) : ''
  if (shape.group) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, shape.group)
  return frac ? whole + shape.point + frac : whole
}
