import mysql from "mysql2";
import path from "path"; 
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, '../data/mysql/.env') });

function inputSanitize(input) {
    return String(input).replace(/[^A-Za-z0-9._\- ]+/g, '');
}

export default async function getDataEpisode(identifier) {
    identifier = inputSanitize(identifier)
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
            let sql = (`SELECT * FROM episodes WHERE identifier = '${identifier}'`);
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
