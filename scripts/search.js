import mysql from "mysql2";
import { fileURLToPath } from "url";
import path from "path"; 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, '../data/mysql/.env') });

export default async function search (request, specifications) {
    let con = mysql.createConnection({
        host:process.env.HOST,
        user: "localflix",
        password: process.env.MYSQL_PASSWORD,
        database: process.env.DATABASE
    });
    return new Promise ((resolve, reject) => {
        con.connect(function (err) {
            if (err) {
                console.log(`There was an error while connecting to the database: ${err}`)
                reject (err);
            }
            let sql = (`SELECT title, author, description, release_date, tags, identifier, created_at FROM movie WHERE ${specifications} LIKE '%${request}%' UNION SELECT title, author, description, release_date, tags, identifier, created_at FROM series WHERE ${specifications} LIKE '%${request}%';`);
            con.query(
                sql,
                function (err, result) {
                    con.end(); 
                    if (err) {
                        console.log(`there is a problem with the database: ${err}`)
                        reject(err)
                    } else {
                        resolve(result)
                    }
                }
            )
        });
    })};
