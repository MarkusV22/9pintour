// Krypto-Helfer (nur Web Crypto → läuft auf Workers und Node gleich)

const enc = new TextEncoder();

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function newId(): string {
  return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function b64url(buf: Uint8Array): string {
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---- Passwörter: HMAC-Pepper + PBKDF2-SHA256, Format "pbkdf2-sha256$<iter>$<salt>$<hash>"
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 256;

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < PASSWORD_MIN) return `Das Passwort muss mindestens ${PASSWORD_MIN} Zeichen haben.`;
  if (enc.encode(pw).length > PASSWORD_MAX_BYTES) return "Das Passwort ist zu lang.";
  return null;
}

async function derive(password: string, salt: Uint8Array, iterations: number, pepper: string): Promise<Uint8Array> {
  const pk = await crypto.subtle.importKey("raw", enc.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const peppered = await crypto.subtle.sign("HMAC", pk, enc.encode(password));
  const key = await crypto.subtle.importKey("raw", peppered, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations: number, pepper: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations, pepper);
  return `pbkdf2-sha256$${iterations}$${b64url(salt)}$${b64url(hash)}`;
}

/** Prüft ein Passwort; needsRehash = gespeicherte Rundenzahl kleiner als aktuell konfiguriert */
export async function verifyPassword(
  password: string,
  stored: string,
  currentIterations: number,
  pepper: string,
): Promise<{ ok: boolean; needsRehash: boolean }> {
  const [alg, iterStr, saltStr, hashStr] = stored.split("$");
  const iterations = Number(iterStr);
  if (alg !== "pbkdf2-sha256" || !iterations || !saltStr || !hashStr) return { ok: false, needsRehash: false };
  const hash = await derive(password, fromB64url(saltStr), iterations, pepper);
  const ok = timingSafeEqual(hash, fromB64url(hashStr));
  return { ok, needsRehash: ok && iterations < currentIterations };
}
