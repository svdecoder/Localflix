import fs from "fs/promises";
import mysql from "mysql2";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dbConfig from "./dbConfig.js";

function inputSanitize(input) {
  return String(input).replace(/[^A-Za-z0-9._\- ]+/g, "");
}

export default async function addSerie(req) {
  const title = inputSanitize(req.body.title);
  const folderPath = path.join(__dirname, "..", "data", "serie", title);

  // Create serie folder
  await fs.mkdir(folderPath, { recursive: true });
  console.log("Folder created:", folderPath);

  // Handle thumbnail
  if (req.file) {
    const filename = inputSanitize(req.file.filename);
    const srcPath = path.join(__dirname, "..", "data", "uploads", filename);
    const destPath = path.join(__dirname, "..", "data", "thumbnail", `${title}.jpg`.replace(/\s+/g, ""));
    try {
      await fs.copyFile(srcPath, destPath);
      await fs.unlink(srcPath);
      console.log("Thumbnail renamed to:", destPath);
    } catch (err) {
      console.error("Error renaming thumbnail:", err);
    }
  }

  // Database insertion
  await databaseAdd(req);
}

async function databaseAdd(req) {
  const title = inputSanitize(req.body.title);
  const description = inputSanitize(req.body.description);
  const releaseDate = inputSanitize(req.body.releaseDate);
  const author = inputSanitize(req.body.author);
  const tags = inputSanitize(req.body.tags);
  const NoS = inputSanitize(req.body.NoS);

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
      const sql =
        "INSERT INTO series (title, description, author, release_date, tags, number_of_seasons, identifier) VALUES (?, ?, ?, ?, ?, ?, ?)";
      con.query(sql, [title, description, author, releaseDate, tags, NoS, title], (err, result) => {
        con.end();
        if (err) return reject(err);
        console.log("Serie inserted successfully!");
        resolve(result);
      });
    });
  });
}