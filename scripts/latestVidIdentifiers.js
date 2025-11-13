import mysql from "mysql2";
import path from "path"; 
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export default async function vidIdentifiers (numberOfVid) {
    function getIdentifiers (numberOfVid) {
        const tableName = "movie"
        const videoToDisplay = numberOfVid
        let con = mysql.createConnection({
            host:process.env.HOST,
            user: "localflix",
            password: process.env.MYSQL_PASSWORD,
            database: process.env.DATABASE
        });
        return new Promise ((resolve, reject) => {
            con.connect(function (err) {
                if (err) {
                    console.log(`connection to the database failed: ${err}`)
                    reject(err)
                }
                let sql = `SELECT identifier, title, tags FROM ${tableName} ORDER BY id DESC LIMIT ${videoToDisplay};`
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
            })
        })
    }
    var mysqlIdentifierResponse = await getIdentifiers(numberOfVid)
    var movieData = []
    for (const elements in mysqlIdentifierResponse) {
        movieData.push(mysqlIdentifierResponse[elements])
    }
    return movieData
};