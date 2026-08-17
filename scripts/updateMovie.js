import mysql from "mysql2";
import dbConfig from "./dbConfig.js";

function truncate(input, maxLength) {
  return String(input ?? "").slice(0, maxLength);
}

// Column config: how to sanitize/truncate each field when it's present.
const COLUMNS = {
  title: (v) => truncate(v, 255),
  author: (v) => truncate(v, 255),
  description: (v) => truncate(v, 1000),
  release_date: (v) => truncate(v, 10) || null,
  tags: (v) => truncate(String(v ?? "").replace(/[^A-Za-z0-9._\- ,]+/g, ""), 255),
};

export default async function updateMovie(identifier, fields) {
  const con = mysql.createConnection({
    host: dbConfig.host,
    user: "root",
    password: dbConfig.password,
    database: dbConfig.database,
  });

  return new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) {
        con.end();
        return reject(err);
      }

      // Only build SET clauses for fields that were actually included in the
      // request. Previously every column was overwritten unconditionally —
      // a caller sending only `{ title: "..." }` would silently blank out
      // author/description/release_date/tags. The current frontend always
      // sends the full form, so this wasn't reachable in practice, but the
      // route itself (PUT /api/movie/:id) only required "at least one field"
      // to be present, so this guards against any future partial-update use.
      const setClauses = [];
      const values = [];
      for (const [column, sanitize] of Object.entries(COLUMNS)) {
        if (fields[column] !== undefined) {
          setClauses.push(`${column} = ?`);
          values.push(sanitize(fields[column]));
        }
      }

      if (setClauses.length === 0) {
        con.end();
        return reject(new Error("No fields to update"));
      }

      values.push(identifier);
      const sql = `UPDATE movie SET ${setClauses.join(", ")} WHERE identifier = ?`;
      con.query(sql, values, (err, result) => {
        con.end();
        if (err) return reject(err);
        resolve(result);
      });
    });
  });
}