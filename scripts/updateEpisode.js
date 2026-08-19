import { createConnection } from "./dbConnection.js";

function truncate(input, maxLength) {
  return String(input ?? "").slice(0, maxLength);
}

// Column config: how to sanitize/truncate each field when it's present.
const COLUMNS = {
  title: (v) => truncate(v, 255),
  description: (v) => truncate(v, 255),
  date: (v) => truncate(v, 10) || null,
  episode: (v) => truncate(v, 10) || null,
  season: (v) => truncate(v, 10) || null,
};

export default async function updateEpisode(identifier, fields) {
  const con = createConnection();

  return new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) {
        con.end();
        return reject(err);
      }

      // Only build SET clauses for fields that were actually included in the
      // request — mirrors the same fix already applied in updateMovie.js.
      // Previously every column was overwritten unconditionally, so a caller
      // sending only `{ title: "..." }` would silently blank out
      // description/date/episode/season.
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
      const sql = `UPDATE episodes SET ${setClauses.join(", ")} WHERE identifier = ?`;
      con.query(sql, values, (err, result) => {
        con.end();
        if (err) return reject(err);
        resolve(result);
      });
    });
  });
}