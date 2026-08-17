import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USAGE = `
Standalone maintenance CLI — NOT called by the running app (server.js) or
any UI action. Run manually from the command line if you need to re-mux an
existing file, e.g. after fixing a subtitle-mapping bug or adding SRTs to
something uploaded before that feature existed.

Usage:
  node scripts/reprocessSubtitles.js <input.mp4> [srtFiles...]

Examples:
  # Re-mux an already-processed movie, ensuring embedded text subtitles
  # are converted to mov_text (the format the browser can render):
  node scripts/reprocessSubtitles.js data/movies/someid.mp4

  # Re-mux and prepend external .srt subtitle tracks:
  node scripts/reprocessSubtitles.js data/movies/someid.mp4 sub_en.srt sub_fr.srt

The script replaces the original file with a properly-muxed version.
Text subtitle streams (subrip/ass/ssa/mov_text/webvtt, etc.) are converted to
mov_text so the HTML5 <track> element can render them.
Bitmap subtitle streams (e.g. hdmv_pgs_subtitle) cannot be displayed by
browsers and are skipped.
`;

// Codecs that can be converted to mov_text
const TEXT_SUB_CODECS = new Set([
  "subrip", "srt", "ass", "ssa", "mov_text", "webvtt", "text",
  "sami", "jacosub", "microdvd", "mpl2", "pjs", "realtext", "stl",
  "subviewer", "subviewer1", "vplayer", "dvb_subtitle",
]);

async function probe(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata);
    });
  });
}

function run(ffmpegCmd) {
  return new Promise((resolve, reject) => {
    ffmpegCmd
      .on("stderr", (line) => {
        // fluent-ffmpeg emits ffmpeg logs on stderr; print only errors
        if (/error|invalid|not found/i.test(line)) {
          console.error(`  [ffmpeg] ${line.trim()}`);
        }
      })
      .on("end", () => resolve())
      .on("error", (err) => reject(err));
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log(USAGE);
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  const srtFiles = args.slice(1).map((p) => path.resolve(p));

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  for (const srt of srtFiles) {
    if (!fs.existsSync(srt)) {
      console.error(`SRT file not found: ${srt}`);
      process.exit(1);
    }
  }

  console.log(`Probing: ${inputPath}`);
  const metadata = await probe(inputPath);

  const streams = metadata.streams || [];
  const videoStreams = streams.filter((s) => s.codec_type === "video");
  const audioStreams = streams.filter((s) => s.codec_type === "audio");
  const subStreams = streams.filter((s) => s.codec_type === "subtitle");

  if (videoStreams.length === 0) {
    console.error("No video stream found in input file.");
    process.exit(1);
  }

  const textSubs = subStreams.filter((s) =>
    TEXT_SUB_CODECS.has(s.codec_name)
  );
  const bitmapSubs = subStreams.filter(
    (s) => !TEXT_SUB_CODECS.has(s.codec_name)
  );

  console.log(
    `Found: ${videoStreams.length} video, ${audioStreams.length} audio, ` +
      `${textSubs.length} text subtitle(s), ${bitmapSubs.length} bitmap subtitle(s).`
  );

  if (bitmapSubs.length > 0) {
    console.warn(
      `Skipping ${bitmapSubs.length} bitmap subtitle stream(s) — browsers cannot render them.`
    );
  }

  if (textSubs.length === 0 && srtFiles.length === 0) {
    console.warn(
      "No text subtitle streams and no external SRT files provided — nothing to re-process."
    );
    process.exit(0);
  }

  const outputPath = `${inputPath}.reprocessed.mp4`;

  const cmd = ffmpeg();

  // Map the original file as input 0
  cmd.input(inputPath);

  // Add external SRT files as additional inputs
  for (const srt of srtFiles) {
    cmd.input(srt);
  }

  const mapOpts = [];

  // Map all video streams (copy codec — no re-encode)
  videoStreams.forEach((_v, i) => mapOpts.push("-map", `0:v:${i}`));

  // Map all audio streams (copy codec — no re-encode)
  audioStreams.forEach((_a, i) => mapOpts.push("-map", `0:a:${i}`));

  // Map text subtitle streams from the input, converting to mov_text.
  // IMPORTANT: ffmpeg's `-map 0:s:N` addresses the Nth subtitle stream
  // OVERALL (any codec), not the Nth *text* subtitle stream. This used to
  // count only text subs seen so far, which mis-mapped streams whenever a
  // bitmap subtitle appeared before a text one in the file (e.g. subtitle
  // order [bitmap, text] would map the text sub as index 0, grabbing the
  // bitmap stream instead). Using the position within subStreams — which
  // includes every subtitle stream, text and bitmap alike — matches what
  // ffmpeg actually expects. Same fix already applied in ffmpegJob.js.
  subStreams.forEach((sub, relIdx) => {
    if (!TEXT_SUB_CODECS.has(sub.codec_name)) return;
    mapOpts.push("-map", `0:s:${relIdx}`);
  });

  // Map external SRT inputs as additional subtitle streams
  for (let i = 0; i < srtFiles.length; i++) {
    mapOpts.push("-map", `${1 + i}:0`);
    const label = path.basename(srtFiles[i], path.extname(srtFiles[i]));
    mapOpts.push(`-metadata:s:s:${textSubs.length + i}`, `title=${label}`);
  }

  const outputOpts = [
    ...mapOpts,
    "-c:v", "copy",
    "-c:a", "copy",
    "-c:s", "mov_text",
    "-movflags", "+faststart",
  ];

  console.log(`Re-muxing to: ${outputPath}`);
  console.log(`Args: ${outputOpts.join(" ")}`);

  await run(cmd.outputOptions(outputOpts).save(outputPath));

  // Replace the original file
  const backupPath = `${inputPath}.bak`;
  fs.renameSync(inputPath, backupPath);
  fs.renameSync(outputPath, inputPath);
  fs.unlinkSync(backupPath);

  console.log(`Done. Original file replaced: ${inputPath}`);

  // Verify output
  const verify = await probe(inputPath);
  const finalSubs = (verify.streams || []).filter(
    (s) => s.codec_type === "subtitle"
  );
  console.log(`Verification: ${finalSubs.length} subtitle stream(s) in output.`);
}

main().catch((err) => {
  console.error("Re-processing failed:", err.message);
  process.exit(1);
});