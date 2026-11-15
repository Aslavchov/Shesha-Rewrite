/**
 * Instance ids (ADR 0003): `c_` plus ten random base-32 characters. Stable,
 * never reused, never shown to people.
 */

/** Crockford's base-32 alphabet in lower case: no i, l, o or u, so no look-alikes and few words. */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"
const LENGTH = 10

/** A source of whole numbers from 0 up to, not including, `below`. */
export type RandomIndex = (below: number) => number

/** Random numbers from the browser's cryptographic source. */
export const cryptoRandom: RandomIndex = (below) => {
  // 32 divides 2^32, so taking the remainder keeps every index equally likely.
  const [value] = crypto.getRandomValues(new Uint32Array(1))
  return value % below
}

/** A new id that is not in `taken`. */
export function createId(taken: ReadonlySet<string>, random: RandomIndex = cryptoRandom): string {
  for (;;) {
    let id = "c_"
    for (let index = 0; index < LENGTH; index++) id += ALPHABET[random(ALPHABET.length)]
    if (!taken.has(id)) return id
  }
}
