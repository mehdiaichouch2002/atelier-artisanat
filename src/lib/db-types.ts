import type postgres from "postgres";

/** A transaction (or connection) handle. Services take this so they can run in any context. */
export type Tx = postgres.TransactionSql<Record<string, never>> | postgres.Sql<Record<string, never>>;
