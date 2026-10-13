import { validateDate } from "../lib/validations.js";
import { validate } from "uuid";
import pool from "../lib/pgInit.js";
const formatDate = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
};
export const summarizeAllTransaction = async (req, res) => {
    try {
        const start_date = req.query.start_date;
        const end_date = req.query.end_date;
        const user_id = req.auth?.id;
        // Validate that start_date, end_date and user_id are all string
        if (typeof start_date !== "string") {
            return res.status(400).json({
                msg: "start_end should be a stirng"
            });
        }
        if (typeof end_date !== "string") {
            return res.status(400).json({
                msg: "end_end should be a stirng"
            });
        }
        if (typeof user_id !== "string") {
            return res.status(400).json({
                msg: "user_id should be a stirng"
            });
        }
        // Validate the start_date, end_date
        if (!validateDate(start_date)) {
            return res.status(400).json({
                msg: "Start date isn't a valid date"
            });
        }
        if (!validateDate(end_date)) {
            return res.status(400).json({
                msg: "End date isn't a valid date"
            });
        }
        // Validate user_id
        if (!validate(user_id)) {
            return res.status(400).json({
                msg: "Invalid user Id"
            });
        }
        // Check if the user_id exist
        const existedUser = await pool.query("SELECT user_id FROM users WHERE user_id = $1", [user_id]);
        if (existedUser.rows.length === 0) {
            return res.status(404).json({
                msg: "User with this id doesn't exist"
            });
        }
        const query = `
    
    WITH filtered AS (
      SELECT * FROM transactions
      WHERE 
        user_id = $1 AND 
        tran_date BETWEEN $2 AND $3
    )

    SELECT 
      COUNT(*)::int AS total_number_of_transaction,
      COALESCE(SUM(tran_amount), 0)::int AS total_value_of_transaction,
      COUNT(*) FILTER (WHERE tran_type = 'income')::int AS total_number_of_income,
      COUNT(*) FILTER (WHERE tran_type = 'expense')::int AS total_number_of_expense,
      COALESCE(SUM(tran_amount) FILTER (WHERE tran_type = 'income'), 0)::int AS total_value_of_income,
      COALESCE(SUM(tran_amount) FILTER (WHERE tran_type = 'expense'), 0)::int AS total_value_of_expense,
      (
        SELECT to_jsonb(f) FROM filtered f 
        WHERE f.tran_type = 'expense'
        ORDER BY f.tran_amount DESC, f.tran_date DESC LIMIT 1
      ) AS most_expense_transaction,
      (
        SELECT to_jsonb(f) FROM filtered f 
        WHERE f.tran_type = 'income'
        ORDER BY f.tran_amount DESC, f.tran_date DESC LIMIT 1
      ) AS most_income_transaction,
      ( 
        SELECT to_jsonb(f) FROM filtered f 
        WHERE f.tran_type = 'expense'
        ORDER BY f.tran_amount ASC, f.tran_date DESC LIMIT 1
      ) AS least_expense_transaction,
      (
        SELECT to_jsonb(f) FROM filtered f 
        WHERE f.tran_type = 'income'
        ORDER BY f.tran_amount ASC, f.tran_date DESC LIMIT 1
      ) AS least_income_transaction
    FROM filtered f; 
    
    `;
        const result = await pool.query(query, [user_id, start_date, end_date]);
        return res.json({
            msg: "OK",
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
export const summarizeAccountTransaction = async (req, res) => {
    try {
        const start_date = req.query.start_date;
        const end_date = req.query.end_date;
        const acc_id = req.query.acc_id;
        const user_id = req.auth?.id;
        // Validate that start_date, end_date and user_id are all string
        if (typeof start_date !== "string") {
            return res.status(400).json({
                msg: "start_end should be a stirng"
            });
        }
        if (typeof end_date !== "string") {
            return res.status(400).json({
                msg: "end_end should be a stirng"
            });
        }
        if (typeof acc_id !== "string") {
            return res.status(400).json({
                msg: "end_end should be a stirng"
            });
        }
        if (typeof user_id !== "string") {
            return res.status(400).json({
                msg: "user_id should be a stirng"
            });
        }
        // Validate the start_date, end_date
        if (!validateDate(start_date)) {
            return res.status(400).json({
                msg: "Start date isn't a valid date"
            });
        }
        if (!validateDate(end_date)) {
            return res.status(400).json({
                msg: "End date isn't a valid date"
            });
        }
        if (!validate(acc_id)) {
            return res.status(400).json({
                msg: "End date isn't a valid date"
            });
        }
        // Validate user_id
        if (!validate(user_id)) {
            return res.status(400).json({
                msg: "Invalid user Id"
            });
        }
        // Check if the user_id exist
        const existingAccount = await pool.query("SELECT acc_id FROM accounts WHERE user_id = $1 AND acc_id = $2", [user_id, acc_id]);
        if (existingAccount.rows.length === 0) {
            return res.status(404).json({
                msg: "Account with this id doesn't exist"
            });
        }
        const query = `
    
    WITH filtered AS (
      SELECT * FROM transactions
      WHERE 
        user_id = $1 AND acc_id = $2
        tran_date BETWEEN $3 AND $4
    )

    SELECT 
      COUNT(*)::int AS total_number_of_transaction,
      COALESCE(SUM(tran_amount), 0)::int AS total_value_of_transaction,
      COUNT(*) FILTER (WHERE tran_type = 'income')::int AS total_number_of_income,
      COUNT(*) FILTER (WHERE tran_type = 'expense')::int AS total_number_of_expense,
      COALESCE(SUM(tran_amount) FILTER (WHERE tran_type = 'income'), 0)::int AS total_value_of_income,
      COALESCE(SUM(tran_amount) FILTER (WHERE tran_type = 'expense'), 0)::int AS total_value_of_expense,
      (
        SELECT to_jsonb(f) FROM filtered f 
        WHERE f.tran_type = 'expense'
        ORDER BY f.tran_amount DESC, f.tran_date DESC LIMIT 1
      ) AS most_expense_transaction,
      (
        SELECT to_jsonb(f) FROM filtered f 
        WHERE f.tran_type = 'income'
        ORDER BY f.tran_amount DESC, f.tran_date DESC LIMIT 1
      ) AS most_income_transaction,
      ( 
        SELECT to_jsonb(f) FROM filtered f 
        WHERE f.tran_type = 'expense'
        ORDER BY f.tran_amount ASC, f.tran_date DESC LIMIT 1
      ) AS least_expense_transaction,
      (
        SELECT to_jsonb(f) FROM filtered f 
        WHERE f.tran_type = 'income'
        ORDER BY f.tran_amount ASC, f.tran_date DESC LIMIT 1
      ) AS least_income_transaction
    FROM filtered f; 
    
    `;
        const result = await pool.query(query, [user_id, acc_id, start_date, end_date]);
        return res.json({
            msg: "OK",
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
export const summarizeCategoriesTransactionsController = async (req, res) => {
    try {
        const now = new Date();
        const start_date = req.query.start_date ?? formatDate(new Date(now.getFullYear(), 0, 1));
        const end_date = req.query.end_date ?? formatDate(now);
        const cat_id = req.query.cat_id;
        const user_id = req.auth?.id;
        // Validate that start_date, end_date, cat_id and user_id are all strings
        if (typeof start_date !== "string") {
            return res.status(400).json({
                msg: "start_date should be a string"
            });
        }
        if (typeof end_date !== "string") {
            return res.status(400).json({
                msg: "end_date should be a string"
            });
        }
        if (new Date(start_date) > new Date(end_date)) {
            return res.status(400).json({
                msg: "start_date can't be after end_date"
            });
        }
        if (typeof cat_id !== "string") {
            return res.status(400).json({
                msg: "cat_id should be a string"
            });
        }
        if (typeof user_id !== "string") {
            return res.status(400).json({
                msg: "user_id should be a string"
            });
        }
        // Validate the start_date, end_date
        if (!validateDate(start_date)) {
            return res.status(400).json({
                msg: "Start date isn't a valid date"
            });
        }
        if (!validateDate(end_date)) {
            return res.status(400).json({
                msg: "End date isn't a valid date"
            });
        }
        // Validate cat_id and user_id (UUIDs)
        if (!validate(cat_id)) {
            return res.status(400).json({
                msg: "Invalid category Id"
            });
        }
        if (!validate(user_id)) {
            return res.status(400).json({
                msg: "Invalid user Id"
            });
        }
        // Check that the category exists (and isn't soft-deleted)
        const existingCategory = await pool.query("SELECT cat_id FROM categories WHERE cat_id = $1 AND deleted_at IS NULL", [cat_id]);
        if (existingCategory.rows.length === 0) {
            return res.status(404).json({
                msg: "Category with this id doesn't exist"
            });
        }
        const query = `
    WITH filtered AS (
      SELECT * FROM transactions
      WHERE
        user_id = $1
        AND cat_id = $2
        AND tran_date BETWEEN $3 AND $4
    )

    SELECT
      COUNT(*)::int AS total_number_of_transaction,
      COALESCE(SUM(tran_amount), 0)::int AS total_value_of_transaction,
      COUNT(*) FILTER (WHERE tran_type = 'income')::int AS total_number_of_income,
      COUNT(*) FILTER (WHERE tran_type = 'expense')::int AS total_number_of_expense,
      COALESCE(SUM(tran_amount) FILTER (WHERE tran_type = 'income'), 0)::int AS total_value_of_income,
      COALESCE(SUM(tran_amount) FILTER (WHERE tran_type = 'expense'), 0)::int AS total_value_of_expense,
      (
        SELECT to_jsonb(f) FROM filtered f
        WHERE f.tran_type = 'expense'
        ORDER BY f.tran_amount DESC, f.tran_date DESC LIMIT 1
      ) AS most_expense_transaction,
      (
        SELECT to_jsonb(f) FROM filtered f
        WHERE f.tran_type = 'income'
        ORDER BY f.tran_amount DESC, f.tran_date DESC LIMIT 1
      ) AS most_income_transaction,
      (
        SELECT to_jsonb(f) FROM filtered f
        WHERE f.tran_type = 'expense'
        ORDER BY f.tran_amount ASC, f.tran_date DESC LIMIT 1
      ) AS least_expense_transaction,
      (
        SELECT to_jsonb(f) FROM filtered f
        WHERE f.tran_type = 'income'
        ORDER BY f.tran_amount ASC, f.tran_date DESC LIMIT 1
      ) AS least_income_transaction
    FROM filtered f;
    `;
        const result = await pool.query(query, [user_id, cat_id, start_date, end_date]);
        return res.json({
            msg: "OK",
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
