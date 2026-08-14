import mysql from "mysql2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dbConfig from "./dbConfig.js";

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    const con = mysql.createConnection({
      host: dbConfig.host,
      user: "root",
      password: dbConfig.password,
      database: dbConfig.database,
    });
    con.connect((err) => {
      if (err) { con.end(); return reject(err); }
      con.query(sql, params, (err, rows) => {
        con.end();
        if (err) return reject(err);
        resolve(rows);
      });
    });
  });
}

export default async function wipeData(target) {
  const targets = Array.isArray(target) ? target : [target];
  const results = {};

  // Wipe movies
  if (targets.includes("movies")) {
    // Delete all movie files
    const moviesDir = path.join(__dirname, "..", "data", "movies");
    try {
      const files = fs.readdirSync(moviesDir);
      for (const file of files) {
        if (file.endsWith(".mp4")) {
          fs.unlinkSync(path.join(moviesDir, file));
        }
      }
    } catch (_) {}

    // Delete movie thumbnails (only those matching movie identifiers)
    const thumbnailDir = path.join(__dirname, "..", "data", "thumbnail");
    try {
      const movieRows = await query("SELECT identifier FROM movie");
      for (const row of movieRows) {
        const thumbPath = path.join(thumbnailDir, `${row.identifier}.jpg`);
        try { fs.unlinkSync(thumbPath); } catch (_) {}
      }
    } catch (_) {}

    await query("DELETE FROM movie");
    results.movies = "deleted";
  }

  // Wipe series (and their episodes)
  if (targets.includes("series")) {
    // Delete all serie folders
    const serieDir = path.join(__dirname, "..", "data", "serie");
    try {
      const entries = fs.readdirSync(serieDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          fs.rmSync(path.join(serieDir, entry.name), { recursive: true, force: true });
        } else if (entry.isFile() && entry.name.endsWith(".mp4")) {
          fs.unlinkSync(path.join(serieDir, entry.name));
        }
      }
    } catch (_) {}

    // Delete serie thumbnails
    const thumbnailDir = path.join(__dirname, "..", "data", "thumbnail");
    try {
      const serieRows = await query("SELECT title FROM series");
      for (const row of serieRows) {
        const thumbPath = path.join(thumbnailDir, `${row.title.replace(/\s+/g, "")}.jpg`);
        try { fs.unlinkSync(thumbPath); } catch (_) {}
      }
    } catch (_) {}

    await query("DELETE FROM episodes");
    await query("DELETE FROM series");
    results.series = "deleted";
  }

  // Wipe pending uploads
  if (targets.includes("uploads")) {
    const uploadsDir = path.join(__dirname, "..", "data", "uploads");
    try {
      const entries = fs.readdirSync(uploadsDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(uploadsDir, entry.name);
        if (entry.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
      }
    } catch (_) {}
    results.uploads = "deleted";
  }

  // Wipe everything
  if (targets.includes("all")) {
    const moviesDir = path.join(__dirname, "..", "data", "movies");
    const serieDir = path.join(__dirname, "..", "data", "serie");
    const thumbnailDir = path.join(__dirname, "..", "data", "thumbnail");
    const uploadsDir = path.join(__dirname, "..", "data", "uploads");

    // Clear all directories
    for (const dir of [moviesDir, serieDir, thumbnailDir, uploadsDir]) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullPath);
          }
        }
      } catch (_) {}
    }

    await query("DELETE FROM episodes");
    await query("DELETE FROM movie");
    await query("DELETE FROM series");
    results.all = "deleted";
  }

  return results;
}