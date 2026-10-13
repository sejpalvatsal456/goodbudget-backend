import jwt from "jsonwebtoken";
import pool from "../lib/pgInit.js";
export const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ msg: "Authorization header missing or malformed" });
        }
        const token = authHeader.slice("Bearer ".length).trim();
        if (!token) {
            return res.status(401).json({ msg: "Authorization header missing or malformed" });
        }
        if (!process.env.JWT_ACCESS_SECRET) {
            throw new Error("JWT_ACCESS_SECRET is not configured");
        }
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
                algorithms: ["HS256"],
            });
        }
        catch (err) {
            if (err instanceof jwt.TokenExpiredError) {
                return res.status(401).json({ msg: "Token expired" });
            }
            return res.status(401).json({ msg: "Invalid token" });
        }
        if (!decoded?.user_id) {
            return res.status(401).json({ msg: "Invalid token payload" });
        }
        // Confirm the user still exists (handles deleted/deactivated accounts
        // whose old tokens haven't expired yet)
        const result = await pool.query("SELECT user_id FROM users WHERE user_id = $1", [decoded.user_id]);
        if (result.rows.length === 0) {
            return res.status(401).json({ msg: "User no longer exists" });
        }
        req.auth = { id: result.rows[0].user_id };
        next();
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ msg: "Internal Server Error" });
    }
};
