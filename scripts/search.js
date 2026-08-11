import mysql from "mysql2";
import { fileURLToPath } from "url";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dbConfig from "./dbConfig.js";

function inputSanitize(input) {
  return String(input).replace(/[^A-Za-z0-9._\- ]+/g, "");
}

// Whitelist of allowed column names to prevent SQL injection
const ALLOWED_COLUMNS = ["author", "title", "tags", "description"];

export default async function search(request, specification) {
  request = inputSanitize(request);
  specification = inputSanitize(specification);

  // Validate specification is an allowed column name
  if (!ALLOWED_COLUMNS.includes(specification)) {
    throw new Error(`Invalid search specification: ${specification}`);
  }

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
      // Use parameterized query for the search value, column name is whitelisted
      const sql = `SELECT title, author, description, release_date, tags, identifier, created_at, type FROM movie WHERE \`${specification}\` LIKE ? UNION SELECT title, author, description, release_date, tags, identifier, created_at, type FROM series WHERE \`${specification}\` LIKE ?`;
      const likePattern = `%${request}%`;
      con.query(sql, [likePattern, likePattern], (err, result) => {
        con.end();
        if (err) return reject(err);
        resolve(result);
      });
    });
  });
}