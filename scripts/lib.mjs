// Shared helpers for the maintenance scripts (Node, no TypeScript build needed).
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

/** Same format as src/lib/auth/password.ts */
export async function hashPassword(password) {
  const N = 2 ** 15, r = 8, p = 1;
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export const pgTypes = {
  bigint: { to: 20, from: [20], serialize: (x) => String(x), parse: (x) => Number(x) },
  date: { to: 1082, from: [1082], serialize: (x) => x, parse: (x) => x },
};
