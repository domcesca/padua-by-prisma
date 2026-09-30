import "server-only"

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto"

// Password hashing with scrypt (Node's built-in; no native dependency to build on Vercel). The stored form names its
// parameters, so they can be raised later and old hashes still verify: scrypt$N$r$p$salt$hash, base64url.

const PARAMS = { N: 2 ** 15, r: 8, p: 1 }
const KEY_LENGTH = 32
// N·r·128 bytes = 32 MiB at these settings; Node's default ceiling is exactly 32 MiB, so leave headroom.
const MAX_MEM = 64 * 1024 * 1024

export const PASSWORD_MIN = 12
/** Upper bound so a huge "password" can't be used to burn CPU. */
export const PASSWORD_MAX = 200

const derive = (password: string, salt: Buffer, o: { N: number; r: number; p: number }) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...o, maxmem: MAX_MEM } satisfies ScryptOptions, (err, key) => (err ? reject(err) : resolve(key)))
  )

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await derive(password, salt, PARAMS)
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join("$")
}

export async function verifyPassword(password: string, stored: string) {
  const [kind, N, r, p, salt, hash] = stored.split("$")
  if (kind !== "scrypt" || !salt || !hash) return false
  const expected = Buffer.from(hash, "base64url")
  const key = await derive(password, Buffer.from(salt, "base64url"), { N: Number(N), r: Number(r), p: Number(p) })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

/**
 * A hash of nothing in particular, verified against when the email isn't known, so an unknown email takes as long to
 * reject as a wrong password and response time doesn't reveal which emails have accounts.
 */
let decoy: Promise<string> | null = null
export const decoyHash = () => (decoy ??= hashPassword(randomBytes(16).toString("hex")))
