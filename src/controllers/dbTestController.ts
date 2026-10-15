import { Request, Response } from "express";
import pool from "../lib/pgInit.js";

export const testDatabaseConnection = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        NOW() AS server_time,
        current_database() AS database_name,
        current_user AS database_user,
        version() AS postgres_version
    `);

    res.status(200).json({
      success: true,
      message: "Connected to PostgreSQL successfully!",
      database: result.rows[0],
    });
  } catch (error) {
    console.error("Neon DB connection error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to connect to PostgreSQL.",
      error:
        error instanceof Error
          ? error.message
          : "Unknown database error",
    });
  }
};