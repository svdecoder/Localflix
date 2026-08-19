import { createConnection } from "./dbConnection.js";

export default async function getCatalogue() {
  const con = createConnection();

  return new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) {
        con.end();
        return reject(err);
      }
      const sql = `SELECT title, identifier, description, author, length_minutes, release_date, tags, created_at, type
                   FROM movie
                   ORDER BY created_at DESC`;
      con.query(sql, (err, result) => {
        con.end();
        if (err) return reject(err);
        resolve(result);
      });
    });
  });
}