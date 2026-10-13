import pool from "../lib/pgInit.js";
import { validate } from "uuid";
const RATE_LIMIT = Number.parseInt(process.env.RATE_LIMIT ?? "10", 10);
const MAX_LIMIT = 100;
if (!Number.isInteger(RATE_LIMIT) || RATE_LIMIT <= 0) {
    throw new Error("Invalid RATE_LIMIT");
}
const parseNonNegativeInt = (value, fallback) => {
    if (typeof value === "undefined")
        return fallback;
    if (typeof value !== "string" || !/^\d+$/.test(value))
        return null;
    const n = Number.parseInt(value, 10);
    return Number.isSafeInteger(n) ? n : null;
};
export const getAllCategories = async (req, res) => {
    try {
        const user_id = req.auth.id;
        const limit = parseNonNegativeInt(req.query.limit, RATE_LIMIT);
        const offset = parseNonNegativeInt(req.query.offset, 0);
        if (limit === null || offset === null || limit < 1) {
            return res.status(400).json({
                msg: "limit must be a positive integer and offset a non-negative integer."
            });
        }
        const query = `
            SELECT cat_id, cat_name, cat_desc, created_at, updated_at
            FROM categories
            WHERE user_id = $1 AND deleted_at IS NULL
            ORDER BY created_at DESC, cat_id
            LIMIT $2 OFFSET $3;
        `;
        const result = await pool.query(query, [user_id, Math.min(limit, MAX_LIMIT), offset]);
        return res.json({
            msg: "ok",
            result: result.rows
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            msg: "Internal Server Error."
        });
    }
};
export const getSpecificCategory = async (req, res) => {
    try {
        const user_id = req.auth.id;
        const cat_id = req.params.cat_id;
        if (!validate(cat_id)) {
            return res.status(400).json({
                msg: "Invalid Category ID."
            });
        }
        const query = "SELECT * FROM categories WHERE user_id = $1 AND cat_id = $2 AND deleted_at IS NULL LIMIT $3";
        const result = await pool.query(query, [user_id, cat_id, RATE_LIMIT]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                msg: "No categories found."
            });
        }
        return res.json({
            msg: "ok",
            result: result.rows
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            msg: "Internal Server Error."
        });
    }
};
export const createCategoryController = async (req, res) => {
    try {
        const user_id = req.auth.id;
        const raw_name = req.body.name;
        const raw_desc = req.body.desc;
        if (typeof raw_name !== "string") {
            return res.status(400).json({
                msg: "name should be string"
            });
        }
        if (typeof raw_desc !== "undefined" && typeof raw_desc !== "string") {
            return res.status(400).json({
                msg: "desc should be string"
            });
        }
        const name = raw_name.trim();
        const desc = raw_desc?.trim();
        if (name === "") {
            return res.status(400).json({
                msg: "Name can not be empty string."
            });
        }
        const query = "INSERT INTO categories(cat_name, cat_desc, user_id) VALUES ($1, $2, $3) RETURNING *;";
        const result = await pool.query(query, [name, desc, user_id]);
        return res.json({
            msg: "ok",
            result: result.rows
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            msg: "Internal Server Error."
        });
    }
};
export const updateCategoryController = async (req, res) => {
    try {
        const user_id = req.auth.id;
        const cat_id = req.body.cat_id;
        const raw_name = req.body.name;
        const raw_desc = req.body.desc;
        if (!validate(cat_id)) {
            return res.status(400).json({
                msg: "Invalid Category ID."
            });
        }
        if (typeof raw_name !== "undefined" && typeof raw_name !== "string") {
            return res.status(400).json({
                msg: "Name should be string"
            });
        }
        if (typeof raw_desc !== "undefined" && typeof raw_desc !== "string") {
            return res.status(400).json({
                msg: "Desc should be string"
            });
        }
        const name = raw_name?.trim();
        const desc = raw_desc?.trim();
        if (name === "") {
            return res.status(400).json({
                msg: "Name can not be empty string."
            });
        }
        let updateQuery = [];
        let updateValues = [];
        if (typeof name !== "undefined") {
            updateQuery.push(`cat_name = $${updateQuery.length + 1}`);
            updateValues.push(name);
        }
        if (typeof desc !== "undefined") {
            updateQuery.push(`cat_desc = $${updateQuery.length + 1}`);
            updateValues.push(desc);
        }
        if (updateQuery.length === 0) {
            return res.status(400).json({
                msg: "No fields provided for update."
            });
        }
        updateValues.push(user_id);
        updateValues.push(cat_id);
        const query = `UPDATE categories SET ${updateQuery.join(', ')}, updated_at = now() WHERE user_id = $${updateValues.length - 1} AND cat_id = $${updateValues.length} AND deleted_at IS NULL RETURNING *`;
        const result = await pool.query(query, updateValues);
        if (result.rows.length === 0) {
            return res.status(404).json({
                msg: "No categories found."
            });
        }
        return res.json({
            msg: "ok",
            result: result.rows
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            msg: "Internal Server Error."
        });
    }
};
export const deleteCategoryController = async (req, res) => {
    try {
        const user_id = req.auth.id;
        const cat_id = req.body.cat_id;
        if (!validate(cat_id)) {
            return res.status(400).json({
                msg: "Invalid Category ID"
            });
        }
        const query = "UPDATE categories SET updated_at = now(), deleted_at = now() WHERE user_id = $1 AND cat_id = $2 AND deleted_at IS NULL RETURNING *;";
        const result = await pool.query(query, [user_id, cat_id]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                msg: "No categories found."
            });
        }
        return res.json({
            msg: "ok",
            result: result.rows
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            msg: "Internal Server Error"
        });
    }
};
const escapeLike = (str) => str.replace(/[\\%_]/g, "\\$&");
export const searchCategoryController = async (req, res) => {
    try {
        const user_id = req.auth.id;
        const name = typeof req.query.name === "string" ? req.query.name.trim() : undefined;
        const desc = typeof req.query.desc === "string" ? req.query.desc.trim() : undefined;
        if (!name && !desc) {
            return res.status(400).json({
                msg: "Provide at least one of 'name' or 'desc' to search"
            });
        }
        const conditions = ["user_id = $1", "deleted_at IS NULL"];
        const values = [user_id];
        if (name) {
            values.push(`%${escapeLike(name)}%`);
            conditions.push(`cat_name ILIKE $${values.length}`);
        }
        if (desc) {
            values.push(`%${escapeLike(desc)}%`);
            conditions.push(`cat_desc ILIKE $${values.length}`);
        }
        const query = `
            SELECT cat_id, cat_name, cat_desc, created_at, updated_at
            FROM categories
            WHERE ${conditions.join(" AND ")}
            ORDER BY cat_name ASC
        `;
        const result = await pool.query(query, values);
        return res.json({
            msg: "ok",
            result: result.rows
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            msg: "Internal Server Error"
        });
    }
};
