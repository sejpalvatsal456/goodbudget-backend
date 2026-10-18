import { Request, Response } from "express";
import pool from "../lib/pgInit.js";

export const testDatabaseConnection = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT * FROM users;
    `);

    res.status(200).json({
      success: true,
      database: result.rows,
    });
  } catch (error) {
    console.error("Neon DB connection error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to connect to PostgreSQL.",
      error: error instanceof Error ? error.message : "Unknown database error",
    });
  }
};
