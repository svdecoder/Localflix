import mysql from "mysql2";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../data/mysql/.env") });

function inputSanitize(input) {
  return String(input).replace(/[^A-Za-z0-9._\- ]+/g, "");
}

export default async function getDataEpisodes(title, season) {
  title = inputSanitize(title);
  season = inputSanitize(season);
  const con = mysql.createConnection({
    host: process.env.HOST,
    user: "root",
    password: process.env.MYSQL_PASSWORD,
    database: process.env.DATABASE,
  });
  return new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) {
        con.end();
        return reject(err);
      }
      const sql = "SELECT * FROM episodes WHERE serie_id = ? AND season = ?";
      con.query(sql, [title, season], (err, result) => {
        con.end();
        if (err) return reject(err);
        resolve(result);
      });
    });
  });
}