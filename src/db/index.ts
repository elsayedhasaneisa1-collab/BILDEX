import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const globalForDb = globalThis as typeof globalThis & { __buildexPostgresqlPool?: Pool };
const poolMax = Math.max(1, Math.min(5, Number(process.env.PG_POOL_MAX) || 1));

export const pool = globalForDb.__buildexPostgresqlPool ?? new Pool({
  connectionString: databaseUrl,
  max: poolMax,
  min: 0,
  idleTimeoutMillis: Math.max(5000, Math.min(30000, Number(process.env.PG_IDLE_TIMEOUT_MS) || 10000)),
  connectionTimeoutMillis: Math.max(3000, Math.min(15000, Number(process.env.PG_CONNECT_TIMEOUT_MS) || 8000)),
  allowExitOnIdle: process.env.NODE_ENV !== "production",
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  maxUses: 7500,
  statement_timeout: 15000,
  query_timeout: 20000,
  application_name: "buildex-web",
});

globalForDb.__buildexPostgresqlPool = pool;

pool.on("error", (error) => {
  console.error("BUILDEX PostgreSQL idle client error", error.message);
});

export const db = drizzle(pool, { schema });
