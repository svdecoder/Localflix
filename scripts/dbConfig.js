// Database configuration — reads from environment variables set by Docker env_file
// Falls back to .env file only when running outside Docker (npm start / node server.js)
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Only load .env file if env vars are not already set (i.e. running outside Docker)
if (!process.env.MYSQL_PASSWORD && !process.env.MYSQL_ROOT_PASSWORD) {
  dotenv.config({ path: path.resolve(__dirname, "../data/mysql/.env") });
}

const dbConfig = {
  host: process.env.HOST || process.env.MYSQL_HOST || "localhost",
  database: process.env.DATABASE || process.env.MYSQL_DATABASE || "localflix",
  password: process.env.MYSQL_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || "",
};

export default dbConfig;