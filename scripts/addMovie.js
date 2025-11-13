import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import mysql from "mysql2";
import path from "path"; 
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, '../.env') });


export default async function addMovieHandler(req) {
    function videoHandler (req) {
        return new Promise((resolve, reject) => {
        var file = req.file
        const moviePath = "data/movies/"
        var movieUploadName = file.filename
        const thumbnailPath = "data/thumbnail/"
        var filePath = file.path
        var newMovie = moviePath + movieUploadName + '.mp4'
        ffmpeg(filePath) 
        .outputOptions([
           '-c:v libx264',
            '-c:a aac',
            '-movflags +faststart'
        ])
        .save(newMovie)
        .on('end', (newMovie) => {
            console.log("Video converted to mp4: " + newMovie);
            ffmpeg(moviePath + movieUploadName + '.mp4') 
            .outputOptions ([
                '-ss 00:00:20',
                '-vframes 1',
                '-q:v 3',
                '-vf scale=300:-1'
            ])
            .save(thumbnailPath + movieUploadName +'.jpg')
            .on('end', () => {
                console.log('Thumbnail has been generated successfully!');
                    try {
                        fs.unlinkSync(filePath);
                        console.log("File removed:", filePath);
                    } catch (err) {
                        console.log(`file not removed: ${err}`)
                    }
            })
            .on('error', (err) => {
                console.log(`Thumbnail doesn't generated: ${err.message}`)
            })
        })
        .on('error', (err) => {
            console.log(`Video didn't convert to mp4:  ${err.message}`)
        })
        .on('end', () => {
            resolve();
        })
    })};
    function dataBaseAdd(req) {
        return new Promise((resolve, reject) => {
            const tableName = "movie";
            const title = req.body.title;
            const movieName = req.file.filename;
            const description = req.body.description;
            const releaseDate = req.body.releaseDate;
            const author = req.body.author;
            const tags = req.body.tags;
            const newMovie = "data/movies/" + req.file.filename + ".mp4";
            ffmpeg.ffprobe(newMovie, (err, metadata) => {
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
                    let sql = `INSERT INTO ${tableName} (title, identifier, description, author, length_minutes, release_date, tags) VALUES ('${title}', '${movieName}', '${description}', '${author}', '${lengthMinutes}', '${releaseDate}', '${tags}')`;
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
