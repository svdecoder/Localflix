import ffmpeg from "fluent-ffmpeg";

/**
 * Probe a video file and return its audio tracks, subtitle tracks, and video info.
 * @param {string} filePath - Absolute path to the video file
 * @returns {Promise<{audio: Array<{index: number, codec: string, language: string, channels: number}>, subtitles: Array<{index: number, language: string, codec: string}>, video: Array<{index: number, codec: string, width: number, height: number}>}>}
 */
export function getVideoTracks(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);

      const streams = metadata.streams || [];
      const audio = [];
      const subtitles = [];
      const video = [];

      for (const stream of streams) {
        if (stream.codec_type === "audio") {
          audio.push({
            index: stream.index,
            codec: stream.codec_name || "unknown",
            language: stream.tags?.language || "und",
            channels: stream.channels || 2,
            title: stream.tags?.title || `Audio #${stream.index}`,
          });
        } else if (stream.codec_type === "subtitle") {
          subtitles.push({
            index: stream.index,
            language: stream.tags?.language || "und",
            codec: stream.codec_name || "unknown",
            title: stream.tags?.title || `Subtitle #${stream.index}`,
          });
        } else if (stream.codec_type === "video") {
          video.push({
            index: stream.index,
            codec: stream.codec_name || "unknown",
            width: stream.width || 0,
            height: stream.height || 0,
          });
        }
      }

      resolve({ audio, subtitles, video });
    });
  });
}

/**
 * Get video duration in seconds
 * @param {string} filePath
 * @returns {Promise<number>}
 */
export function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}