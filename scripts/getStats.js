import mysql from "mysql2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dbConfig from "./dbConfig.js";

function getDirSize(dirPath) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirSize(fullPath);
      } else if (entry.isFile()) {
        total += fs.statSync(fullPath).size;
      }
    }
  } catch (_) {}
  return total;
}

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

export default async function getStats() {
  const [movieCount, serieCount, episodeCount, totalLength, totalTags, recentMovies, recentSeries, episodeLength] = await Promise.all([
    query("SELECT COUNT(*) AS count FROM movie"),
    query("SELECT COUNT(*) AS count FROM series"),
    query("SELECT COUNT(*) AS count FROM episodes"),
    query("SELECT COALESCE(SUM(length_minutes), 0) AS total FROM movie"),
    query("SELECT COUNT(DISTINCT tags) AS count FROM movie WHERE tags IS NOT NULL AND tags != ''"),
    query("SELECT COUNT(*) AS count FROM movie WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"),
    query("SELECT COUNT(*) AS count FROM series WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"),
    query("SELECT COALESCE(SUM(length_minutes), 0) AS total FROM episodes"),
  ]);

  // Disk usage
  const moviesDir = path.join(__dirname, "..", "data", "movies");
  const serieDir = path.join(__dirname, "..", "data", "serie");
  const thumbnailDir = path.join(__dirname, "..", "data", "thumbnail");
  const uploadsDir = path.join(__dirname, "..", "data", "uploads");

  const moviesSize = getDirSize(moviesDir);
  const seriesSize = getDirSize(serieDir);
  const thumbnailsSize = getDirSize(thumbnailDir);
  const uploadsSize = getDirSize(uploadsDir);
  const totalSize = moviesSize + seriesSize + thumbnailsSize + uploadsSize;

  // Pending uploads (files in uploads dir that are not yet processed)
  let pendingCount = 0;
  try {
    const uploadEntries = fs.readdirSync(uploadsDir, { withFileTypes: true });
    for (const entry of uploadEntries) {
      if (entry.isFile()) pendingCount++;
      if (entry.isDirectory()) {
        // Chunk directories contain chunk_ files
        const chunkDir = path.join(uploadsDir, entry.name);
        const files = fs.readdirSync(chunkDir);
        if (files.some(f => f.startsWith("chunk_"))) pendingCount++;
      }
    }
  } catch (_) {}

  const movieMinutes = totalLength[0]?.total || 0;
  const episodeMinutes = episodeLength[0]?.total || 0;
  const totalWatchMinutes = movieMinutes + episodeMinutes;

  return {
    counts: {
      movies: movieCount[0]?.count || 0,
      series: serieCount[0]?.count || 0,
      episodes: episodeCount[0]?.count || 0,
      totalVideos: (movieCount[0]?.count || 0) + (episodeCount[0]?.count || 0),
      pending: pendingCount,
    },
    disk: {
      movies: moviesSize,
      series: seriesSize,
      thumbnails: thumbnailsSize,
      uploads: uploadsSize,
      total: totalSize,
    },
    stats: {
      totalMovieMinutes: movieMinutes,
      totalEpisodeMinutes: episodeMinutes,
      totalWatchMinutes,
      totalWatchHours: Math.round(totalWatchMinutes / 60),
      uniqueTags: totalTags[0]?.count || 0,
      newMoviesThisWeek: recentMovies[0]?.count || 0,
      newSeriesThisWeek: recentSeries[0]?.count || 0,
    },
  };
}