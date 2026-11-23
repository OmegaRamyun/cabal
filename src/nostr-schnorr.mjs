// V41 — minimal BIP-340 Schnorr signatures over secp256k1, vendored as a
// single source file (no npm dependency, no network, no build step).
//
// Attribution / provenance:
//  - Algorithm: BIP-340 (Pieter Wuille, Jonas Nick, Tim Ruffing), reference
//    pseudocode — https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
//    (BIP text is BSD-2-Clause). Curve constants are the SEC 2 secp256k1
//    parameters.
//  - Written from the BIP's reference algorithm for this repo, using BigInt
//    and Jacobian coordinates, in the style of noble-secp256k1 (MIT, Paul
//    Miller). No noble source is copied. This is NOT a line-for-line copy of
//    an audited library: its correctness rests on the BIP-340 official test
//    vectors + an independent pubkey cross-check in tests/v41-nostr-sync.test.mjs.
//  - Hashing: WebCrypto SHA-256 (async). Randomness: crypto.getRandomValues.
//
// Honest limits: BigInt arithmetic is NOT constant-time. In a browser tab
// holding the user's own key that signs for the user's own events, there is no
// remote timing oracle; do not reuse this file on a server that signs for
// strangers.

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
export const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

const mod = (a, m = P) => { const r = a % m; return r >= 0n ? r : r + m; };

function powmod(b, e, m) {
  let r = 1n; b = mod(b, m);
  while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; }
  return r;
}
const invmod = (a, m = P) => powmod(a, m - 2n, m); // m is prime in both uses

// ---- hex / bytes -----------------------------------------------------------
export function bytesToHex(b) {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}
export function hexToBytes(h) {
  if (typeof h !== "string" || h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error("bad hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
const bytesToInt = (b) => (b.length ? BigInt("0x" + bytesToHex(b)) : 0n);
const intTo32 = (n) => hexToBytes(n.toString(16).padStart(64, "0"));
function concat(...arrs) {
  const out = new Uint8Array(arrs.reduce((a, x) => a + x.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

export async function sha256(data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}
async function taggedHash(tag, ...msgs) {
  const t = await sha256(tag);
  return sha256(concat(t, t, ...msgs));
}

// ---- curve (Jacobian, a = 0) ----------------------------------------------
// A point is [X, Y, Z] (affine x = X/Z², y = Y/Z³) or null for infinity.
const G = [GX, GY, 1n];

function dbl(p) {
  if (!p) return null;
  const [X, Y, Z] = p;
  if (Y === 0n) return null;
  const Y2 = mod(Y * Y);
  const S = mod(4n * X * Y2);
  const M = mod(3n * X * X);
  const X3 = mod(M * M - 2n * S);
  const Y3 = mod(M * (S - X3) - 8n * Y2 * Y2);
  const Z3 = mod(2n * Y * Z);
  return [X3, Y3, Z3];
}
function add(p, q) {
  if (!p) return q;
  if (!q) return p;
  const [X1, Y1, Z1] = p, [X2, Y2, Z2] = q;
  const Z1s = mod(Z1 * Z1), Z2s = mod(Z2 * Z2);
  const U1 = mod(X1 * Z2s), U2 = mod(X2 * Z1s);
  const S1 = mod(Y1 * Z2s * Z2), S2 = mod(Y2 * Z1s * Z1);
  if (U1 === U2) return S1 === S2 ? dbl(p) : null;
  const H = mod(U2 - U1), R = mod(S2 - S1);
  const H2 = mod(H * H), H3 = mod(H2 * H), V = mod(U1 * H2);
  const X3 = mod(R * R - H3 - 2n * V);
  const Y3 = mod(R * (V - X3) - S1 * H3);
  const Z3 = mod(H * Z1 * Z2);
  return [X3, Y3, Z3];
}
function mul(p, k) {
  let r = null, a = p;
  while (k > 0n) { if (k & 1n) r = add(r, a); a = dbl(a); k >>= 1n; }
  return r;
}
function toAffine(p) {
  if (!p) return null;
  const zi = invmod(p[2]);
  const zi2 = mod(zi * zi);
  return [mod(p[0] * zi2), mod(p[1] * zi2 * zi)];
}
function liftX(x) {
  if (x >= P) throw new Error("x out of range");
  const c = mod(x * x * x + 7n);
  const y = powmod(c, (P + 1n) / 4n, P);
  if (mod(y * y) !== c) throw new Error("x is not on the curve");
  return [x, y & 1n ? P - y : y, 1n]; // even-y representative
}

// ---- BIP-340 API (hex in / hex out) ---------------------------------------
function parseSecret(skHex) {
  const d = bytesToInt(hexToBytes(skHex));
  if (skHex.length !== 64 || d < 1n || d >= N) throw new Error("secret key out of range");
  return d;
}

/** 32-byte secret key (hex) -> x-only public key (hex). */
export function getPublicKey(skHex) {
  const [x] = toAffine(mul(G, parseSecret(skHex)));
  return bytesToHex(intTo32(x));
}

/** True when `skHex` is a valid secp256k1 scalar in [1, n-1]. */
export function isValidSecretKey(skHex) {
  try { parseSecret(skHex); return true; } catch { return false; }
}

/** Fresh random secret key (hex), uniformly in [1, n-1]. */
export function generateSecretKey() {
  for (;;) {
    const b = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const hex = bytesToHex(b);
    if (isValidSecretKey(hex)) return hex;
  }
}

/**
 * sign(msgHex, skHex, auxHex?) -> 64-byte signature (hex).
 * `auxHex` is 32 bytes of aux randomness; random when omitted (BIP-340
 * recommends fresh randomness). Pass a fixed value only for test vectors.
 */
export async function sign(msgHex, skHex, auxHex) {
  const m = hexToBytes(msgHex);
  const d0 = parseSecret(skHex);
  const [px, py] = toAffine(mul(G, d0));
  const d = py & 1n ? N - d0 : d0;
  const aux = auxHex ? hexToBytes(auxHex) : globalThis.crypto.getRandomValues(new Uint8Array(32));
  if (aux.length !== 32) throw new Error("aux must be 32 bytes");
  const pBytes = intTo32(px);
  const maskBytes = await taggedHash("BIP0340/aux", aux);
  const dBytes = intTo32(d);
  const t = dBytes.map((b, i) => b ^ maskBytes[i]);
  const rand = await taggedHash("BIP0340/nonce", t, pBytes, m);
  const k0 = mod(bytesToInt(rand), N);
  if (k0 === 0n) throw new Error("nonce is zero; retry");
  const [rx, ry] = toAffine(mul(G, k0));
  const k = ry & 1n ? N - k0 : k0;
  const rBytes = intTo32(rx);
  const e = mod(bytesToInt(await taggedHash("BIP0340/challenge", rBytes, pBytes, m)), N);
  const s = mod(k + e * d, N);
  return bytesToHex(concat(rBytes, intTo32(s)));
}

/** verify(sigHex, msgHex, pubkeyHex) -> boolean. Never throws. */
export async function verify(sigHex, msgHex, pkHex) {
  try {
    const sig = hexToBytes(sigHex), m = hexToBytes(msgHex), pk = hexToBytes(pkHex);
    if (sig.length !== 64 || pk.length !== 32) return false;
    const pt = liftX(bytesToInt(pk));
    const r = bytesToInt(sig.slice(0, 32)), s = bytesToInt(sig.slice(32));
    if (r >= P || s >= N) return false;
    const e = mod(bytesToInt(await taggedHash("BIP0340/challenge", sig.slice(0, 32), pk, m)), N);
    const R = toAffine(add(mul(G, s), mul(pt, N - e)));
    return !!R && !(R[1] & 1n) && R[0] === r;
  } catch {
    return false;
  }
}
