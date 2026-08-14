import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, "..", "config", "ffmpegPresets.json");

const DEFAULT_CONFIG = {
  presets: {
    "480p": { scale: "854:480", videoBitrate: "1000k", maxrate: "1200k", bufsize: "2000k" },
    "720p": { scale: "1280:720", videoBitrate: "2500k", maxrate: "3000k", bufsize: "5000k" },
    "1080p": { scale: "1920:1080", videoBitrate: "5000k", maxrate: "6000k", bufsize: "10000k" },
    "1440p": { scale: "2560:1440", videoBitrate: "8000k", maxrate: "10000k", bufsize: "16000k" },
    "original": null
  },
  encoding: {
    preset: "fast",
    crf: "23",
    pix_fmt: "yuv420p",
    movflags: "+faststart",
    audioCodec: "aac",
    audioChannels: "2",
    subtitleCodec: "mov_text"
  }
};

export function getFfmpegConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch (err) {
    console.error("Error reading ffmpeg config:", err);
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

export function getQualityPresets() {
  return getFfmpegConfig().presets || DEFAULT_CONFIG.presets;
}

export function getEncodingSettings() {
  return getFfmpegConfig().encoding || DEFAULT_CONFIG.encoding;
}