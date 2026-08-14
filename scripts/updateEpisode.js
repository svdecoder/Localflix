import mysql from "mysql2";
import dbConfig from "./dbConfig.js";

function truncate(input, maxLength) {
  return String(input ?? "").slice(0, maxLength);
}

export default async function updateEpisode(identifier, fields) {
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
      const description = truncate(fields.description, 255);
      const date = truncate(fields.date, 10);
      const episode = truncate(fields.episode, 10);
      const season = truncate(fields.season, 10);

      const sql =
        "UPDATE episodes SET title = ?, description = ?, date = ?, episode = ?, season = ? WHERE identifier = ?";
      con.query(
        sql,
        [title, description, date || null, episode || null, season || null, identifier],
        (err, result) => {
          con.end();
          if (err) return reject(err);
          resolve(result);
        }
      );
    });
  });
}