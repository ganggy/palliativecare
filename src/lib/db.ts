import mysql, { type Pool } from "mysql2/promise";

type DbTarget = "hos" | "palliative";

const poolCache = new Map<DbTarget, Pool>();

function readConfig(target: DbTarget) {
  const prefix = target === "hos" ? "HOS" : "PALLIATIVE";
  const host = process.env[`${prefix}_DB_HOST`] ?? process.env.DB_HOST;
  const user = process.env[`${prefix}_DB_USER`] ?? process.env.DB_USER;
  const password = process.env[`${prefix}_DB_PASSWORD`] ?? process.env.DB_PASSWORD;
  const database = process.env[`${prefix}_DB_NAME`] ?? (target === "hos" ? "hos" : "palliative");

  if (!host || !user || password === undefined) {
    return null;
  }

  return { host, user, password, database };
}

export function isDbConfigured(target: DbTarget): boolean {
  return readConfig(target) !== null;
}

export function getPool(target: DbTarget): Pool {
  const cached = poolCache.get(target);
  if (cached) return cached;

  const config = readConfig(target);
  if (!config) {
    throw new Error(`Database config for ${target} is incomplete`);
  }

  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 8,
    namedPlaceholders: true,
    charset: "utf8mb4",
    timezone: "+07:00",
    dateStrings: true,
    supportBigNumbers: true,
    multipleStatements: false,
  });

  pool.on("connection", (connection) => {
    void connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
  });

  poolCache.set(target, pool);
  return pool;
}
