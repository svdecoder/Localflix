import { createConnection } from "./dbConnection.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const con = createConnection();

    // Prevent unhandled 'error' events (e.g. ECONNREFUSED) after end()
    con.on("error", (err) => {
      reject(err);
    });

    con.connect((err) => {
      if (err) {
        try { con.end(); } catch (_) {}
        return reject(err);
      }
      con.query(sql, params, (err, rows) => {
        try { con.end(); } catch (_) {}
        if (err) return reject(err);
        resolve(rows);
      });
    });
  });
}

export default async function getStats() {
  const [movieCount, serieCount, episodeCount, totalLength, movieTagRows, serieTagRows, recentMovies, recentSeries, episodeLength] = await Promise.all([
    query("SELECT COUNT(*) AS count FROM movie"),
    query("SELECT COUNT(*) AS count FROM series"),
    query("SELECT COUNT(*) AS count FROM episodes"),
    query("SELECT COALESCE(SUM(length_minutes), 0) AS total FROM movie"),
    query("SELECT tags FROM movie WHERE tags IS NOT NULL AND tags != ''"),
    query("SELECT tags FROM series WHERE tags IS NOT NULL AND tags != ''"),
    query("SELECT COUNT(*) AS count FROM movie WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"),
    query("SELECT COUNT(*) AS count FROM series WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"),
    query("SELECT COALESCE(SUM(length_minutes), 0) AS total FROM episodes"),
  ]);

  // Count individual unique tags (comma-separated) across both movies and series
  const tagSet = new Set();
  for (const row of [...movieTagRows, ...serieTagRows]) {
    const rawTags = row.tags || "";
    for (const tag of rawTags.split(",")) {
      const trimmed = String(tag).trim();
      if (trimmed) tagSet.add(trimmed);
    }
  }

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

  // MySQL SUM/COUNT return strings/BigInt — coerce to numbers to avoid string concatenation
  const movieMinutes = Number(totalLength[0]?.total) || 0;
  const episodeMinutes = Number(episodeLength[0]?.total) || 0;
  const totalWatchMinutes = movieMinutes + episodeMinutes;

  const nMovieCount = Number(movieCount[0]?.count) || 0;
  const nSerieCount = Number(serieCount[0]?.count) || 0;
  const nEpisodeCount = Number(episodeCount[0]?.count) || 0;

  return {
    counts: {
      movies: nMovieCount,
      series: nSerieCount,
      episodes: nEpisodeCount,
      totalVideos: nMovieCount + nEpisodeCount,
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
      totalWatchHours: +(totalWatchMinutes / 60).toFixed(1),
      uniqueTags: tagSet.size,
      newMoviesThisWeek: Number(recentMovies[0]?.count) || 0,
      newSeriesThisWeek: Number(recentSeries[0]?.count) || 0,
    },
  };
}