import { Pool } from "pg";
import dotenv from 'dotenv';


dotenv.config();



const connectionString = process.env.DATABASE_URI;
console.log(connectionString)

if (!connectionString) {
  throw new Error("DATABASE_URI is missing. Check your .env file.");
}

const pool = new Pool({
  connectionString,
  max: 5,
});

export default pool;