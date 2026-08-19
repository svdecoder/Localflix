import { createConnection } from "./dbConnection.js";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function inputSanitize(input) {
  return String(input).replace(/[^A-Za-z0-9._\- ]+/g, "");
}

export default async function vidIdentifiers(numberOfVid) {
  numberOfVid = parseInt(inputSanitize(numberOfVid), 10);
  if (isNaN(numberOfVid) || numberOfVid < 1) numberOfVid = 5;

  const con = createConnection();

  const mysqlIdentifierResponse = await new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) {
        con.end();
        return reject(err);
      }
      const sql = `(SELECT identifier AS id, title, tags, type, created_at FROM series ORDER BY created_at DESC LIMIT ?)
UNION ALL
(SELECT identifier AS id, title, tags, type, created_at FROM movie ORDER BY created_at DESC LIMIT ?)
ORDER BY created_at DESC`;
      con.query(sql, [numberOfVid, numberOfVid], (err, result) => {
        con.end();
        if (err) return reject(err);
        resolve(result);
      });
    });
  });

  const data = [[], []];
  for (let i = 0; i < mysqlIdentifierResponse.length; i++) {
    if (mysqlIdentifierResponse[i].type === "serie") {
      data[0].push(mysqlIdentifierResponse[i]);
    } else {
      data[1].push(mysqlIdentifierResponse[i]);
    }
  }
  return data;
}