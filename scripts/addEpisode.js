import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import mysql from "mysql2";
import path from "path"; 
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, '../data/mysql/.env') });


export default async function addEpisodeHandler(req) {
    function videoHandler(req) {
        return new Promise((resolve, reject) => {
            const file = req.file;
            const serie = req.body.serieID;
            const episodePath = path.join(__dirname, "../data/serie", serie);
            const thumbnailPath = path.join(__dirname, "../data/thumbnail", serie);
            const uploadedFilePath = file.path;
            const episodeUploadName = file.filename;
            const newEpisode = path.join(episodePath, `${episodeUploadName}.mp4`);
            const newEpisodeThumbnail = path.join(thumbnailPath, `${episodeUploadName}.jpg`);
            if (!fs.existsSync(episodePath)) fs.mkdirSync(episodePath, { recursive: true });
            if (!fs.existsSync(thumbnailPath)) fs.mkdirSync(thumbnailPath, { recursive: true });
            console.log("Thumbnail will be saved at:", newEpisodeThumbnail);
            ffmpeg(uploadedFilePath)
                .outputOptions([
                    "-c:v libx264",
                    "-c:a aac",
                    "-movflags +faststart"
                ])
                .save(newEpisode)
                .on("end", () => {
                    console.log("Video converted to mp4:", newEpisode);
                    ffmpeg(newEpisode)
                        .outputOptions([
                            "-ss 00:00:20",
                            "-vframes 1",
                            "-q:v 3",
                            "-vf scale=300:-1"
                        ])
                        .save(newEpisodeThumbnail)
                        .on("end", () => {
                            console.log("Thumbnail has been generated successfully!");

                            try {
                                fs.unlinkSync(uploadedFilePath);
                                console.log("Original uploaded file removed:", uploadedFilePath);
                            } catch (err) {
                                console.log("File removal failed:", err);
                            }

                            resolve();
                        })
                        .on("error", (err) => {
                            console.log("Thumbnail generation failed:", err.message);
                            reject(err);
                        });
                })
                .on("error", (err) => {
                    console.log("Video conversion failed:", err.message);
                    reject(err);
                });
        });
    }

    function dataBaseAdd(req) {
        return new Promise((resolve, reject) => {
            const tableName = "episodes";
            const title = req.body.title;
            const serie = req.body.serieID;
            const date = req.body.releaseDate;
            const episodeName = req.file.filename;
            const description = req.body.description;
            const episode = req.body.episod;
            const season = req.body.season;
            const newEpisode = "data/serie/" + `${serie}/`+ req.file.filename + ".mp4";
            ffmpeg.ffprobe(newEpisode, (err, metadata) => {
                if (err) {
                    console.log(`Error when getting duration: ${err}`);
                    return reject(err);
                }
                const durationSeconds = metadata.format.duration;
                const lengthMinutes = Math.round(durationSeconds / 60);
                const con = mysql.createConnection({
                    host:process.env.HOST,
                    user: "localflix",
                    password: process.env.MYSQL_PASSWORD,
                    database: process.env.DATABASE
                });
                con.connect(function (err) {
                    if (err) {
                        console.log("Database connection failed:", err);
                       return reject(err);
                    }
                    console.log("Connected to the database");
                    let sql = `INSERT INTO ${tableName} (title, identifier, description, length_minutes, episode, season, serie_id, date) VALUES ('${title}', '${episodeName}', '${description}', '${lengthMinutes}', '${episode}', '${season}', '${serie}', '${date}')`;
                    con.query(
                        sql,
                        function (err, result) {
                            con.end(); 
                            if (err) {
                                console.log("Database insert error:", err);
                                return reject(err);}
                            console.log("Movie inserted successfully!");
                            resolve(result);
                        }
                    );
                });
            });
        });
    }
    await videoHandler(req);
    dataBaseAdd(req);
};
