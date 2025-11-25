import fs from "fs/promises";
import mysql from "mysql2";
import path from "path"; 
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, '../data/mysql/.env') });


export default async function addSerie(req) {
    console.log(req.body)
    const title = req.body.title;
    const folderPath = path.join(__dirname, "../data/serie", title);
    try {
        await fs.mkdir(folderPath, { recursive: true });
        console.log("Folder created:", folderPath);
    } catch (err) {
        console.error("Error creating folder:", err);
        throw err;
    }
    function thumbnailHandling(req) {
        let filename = req.file.filename
        let title = req.body.title
        fs.rename(`data/thumbnail/${filename}`, `data/thumbnail/${title}.jpg`, (err) => {
            if (err) throw err;
            console.log('file renamed')
        });
    }
    function dataBaseAdd(req) {
        return new Promise((resolve, reject) => {
            const title = req.body.title;
            const description = req.body.description;
            const releaseDate = req.body.releaseDate;
            const author = req.body.author;
            const tags = req.body.tags;
            const NoS = req.body.NoS;
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
                    let sql = `INSERT INTO series (title, description, author, release_date, tags, number_of_seasons, identifier) VALUES ('${title}', '${description}', '${author}', '${releaseDate}', '${tags}', '${NoS}', '${title}')`;
                    con.query(
                        sql,
                        function (err, result) {
                            con.end(); 
                            if (err) {
                                console.log("Database insert error:", err);
                                return reject(err);}
                            console.log("Serie inserted successfully!");
                            resolve(result);
                        }
                    );
                });
            });
    }
    thumbnailHandling(req);
    dataBaseAdd(req);
};
