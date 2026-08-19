// Shared MySQL connection factory.
//
// WHY THIS EXISTS: mysql2's Connection is an EventEmitter, and it emits an
// 'error' event whenever the connection dies unexpectedly (idle timeout,
// network blip, MySQL restart, etc.) — not just when a query fails. Node's
// EventEmitter has a special rule for the 'error' event specifically: if
// there is no listener attached, the error is *thrown*, which crashes the
// entire process (not just the current request). Every script in this app
// used to call mysql.createConnection({...}) directly with no .on("error")
// listener, so any transient DB hiccup — completely unrelated to whatever
// request happened to be running — could take down the whole server. This
// was observed in production: "Can't add new command when connection is in
// closed state" crashed the app repeatedly during large uploads.
//
// The fix is simple but needs to happen on every connection: attach a
// listener that logs the error instead of letting it throw. This helper is
// the single place that does that, so every script gets it automatically
// instead of needing to remember it 16 times.

import mysql from "mysql2";
import dbConfig from "./dbConfig.js";

/**
 * Create a MySQL connection configured the same way every script in this
 * app already did (root user, dbConfig host/password/database), but with a
 * safety-net 'error' listener attached immediately so a dead connection
 * logs and gets cleaned up instead of crashing the whole process.
 *
 * Usage is a drop-in replacement for the old `mysql.createConnection({...})`
 * pattern — callers still call `.connect()`, run queries, and `.end()` it
 * themselves exactly as before.
 */
export function createConnection() {
  const con = mysql.createConnection({
    host: dbConfig.host,
    user: "root",
    password: dbConfig.password,
    database: dbConfig.database,
  });

  con.on("error", (err) => {
    console.error("[DB] Connection error (non-fatal to the app):", err.message);
  });

  return con;
}

export default createConnection;
