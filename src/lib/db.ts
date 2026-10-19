import "server-only";
import postgres from "postgres";

export type Sql = postgres.Sql<Record<string, never>>;
export type { Tx } from "./db-types";
import type { Tx } from "./db-types";

function createClient(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: process.env.DATABASE_SSL === "true" ? "require" : false,
    prepare: process.env.DATABASE_PREPARE !== "false",
    onnotice: () => {},
    types: {
      // bigint centimes -> number (amounts stay far below Number.MAX_SAFE_INTEGER; checked by DB constraints)
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      // DATE stays a "YYYY-MM-DD" string: business dates have no time zone.
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  }) as unknown as Sql;
}

const globalForDb = globalThis as unknown as { __atelierSql?: Sql };

export function db(): Sql {
  if (!globalForDb.__atelierSql) globalForDb.__atelierSql = createClient();
  return globalForDb.__atelierSql;
}

/**
 * Runs `fn` in a transaction where Row Level Security sees `userId` as the acting user.
 * Every data access of a signed-in user goes through here.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    return fn(tx as unknown as Tx);
  }) as Promise<T>;
}

export { pgCode, pgConstraint } from "./db-errors";
