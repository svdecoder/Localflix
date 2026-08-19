import { createConnection } from "./dbConnection.js";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function inputSanitize(input) {
  return String(input).replace(/[^A-Za-z0-9._\- ]+/g, "");
}

export default async function getDataEpisode(identifier) {
  identifier = inputSanitize(identifier);
  const con = createConnection();
  return new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) {
        con.end();
        return reject(err);
      }
      const sql = "SELECT * FROM episodes WHERE identifier = ?";
      con.query(sql, [identifier], (err, result) => {
        con.end();
        if (err) return reject(err);
        resolve(result);
      });
    });
  });
}