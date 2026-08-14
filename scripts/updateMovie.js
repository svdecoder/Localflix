import mysql from "mysql2";
import dbConfig from "./dbConfig.js";

function truncate(input, maxLength) {
  return String(input ?? "").slice(0, maxLength);
}

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

      const title = truncate(fields.title, 255);
      const author = truncate(fields.author, 255);
      const description = truncate(fields.description, 1000);
      const releaseDate = truncate(fields.release_date, 10);
      const tags = truncate(String(fields.tags ?? "").replace(/[^A-Za-z0-9._\- ,]+/g, ""), 255);

      const sql =
        "UPDATE movie SET title = ?, author = ?, description = ?, release_date = ?, tags = ? WHERE identifier = ?";
      con.query(
        sql,
        [title, author, description, releaseDate || null, tags, identifier],
        (err, result) => {
          con.end();
          if (err) return reject(err);
          resolve(result);
        }
      );
    });
  });
}