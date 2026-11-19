import { Request, Response } from "express";
import { validateDate } from "../lib/validations.js";
import { validate } from "uuid";
import pool from "../lib/pgInit.js";

const formatDate = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const summarizeAllTransaction = async (req: Request, res: Response) => {
  try {
    const start_date = req.query.start_date;
    const end_date = req.query.end_date;
    const user_id = req.auth?.id;

    // console.log(start_date);
    // console.log(end_date);

    // Validate that start_date, end_date and user_id are all string
    if (typeof start_date !== "string") {
      return res.status(400).json({
        msg: "start_date should be a stirng",
      });
    }

    if (typeof end_date !== "string") {
      return res.status(400).json({
        msg: "end_date should be a stirng",
      });
    }

    if (typeof user_id !== "string") {
      return res.status(400).json({
        msg: "user_id should be a stirng",
      });
    }

    // Validate the start_date, end_date
    if (!validateDate(start_date)) {
      return res.status(400).json({
        msg: "Start date isn't a valid date",
      });
    }

    if (!validateDate(end_date)) {
      return res.status(400).json({
        msg: "End date isn't a valid date",
      });
    }

    // Validate user_id

    if (!validate(user_id)) {
      return res.status(400).json({
        msg: "Invalid user Id",
      });
    }

    // Check if the user_id exist
    const existedUser = await pool.query(
      "SELECT user_id FROM users WHERE user_id = $1",
      [user_id],
    );
    if (existedUser.rows.length === 0) {
      return res.status(404).json({
        msg: "User with this id doesn't exist",
      });
    }

    const query = `
    
    WITH filtered AS (
      SELECT * FROM transactions
      WHERE 
        user_id = $1 AND 
        tran_date BETWEEN $2 AND $3 AND
        deleted_at IS NULL
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

    const categorywiseExpenseQuery = `
      SELECT
        COALESCE(c.cat_name, 'Uncategorized') AS name,
        c.cat_id AS id,
        COALESCE(SUM(t.tran_amount), 0) AS value
      FROM transactions t
      LEFT JOIN categories c
        ON c.cat_id = t.cat_id
      WHERE
        t.user_id = $1
        AND t.tran_date BETWEEN $2 AND $3
        AND t.tran_type = 'expense'
        AND t.deleted_at IS NULL
      GROUP BY c.cat_id, c.cat_name;
    `;

    const categorywiseExpenseResult = await pool.query(
      categorywiseExpenseQuery,
      [user_id, start_date, end_date],
    );
    // console.log(categorywiseExpenseResult);

    const categorywiseIncomeQuery = `
      SELECT
        COALESCE(c.cat_name, 'Uncategorized') AS name,
        c.cat_id AS id,
        COALESCE(SUM(t.tran_amount), 0) AS value
      FROM transactions t
      LEFT JOIN categories c
        ON c.cat_id = t.cat_id
      WHERE
        t.user_id = $1
        AND t.tran_date BETWEEN $2 AND $3
        AND t.tran_type = 'income'
        AND t.deleted_at IS NULL
      GROUP BY c.cat_id, c.cat_name;
    `;

    const categorywiseIncomeResult = await pool.query(categorywiseIncomeQuery, [
      user_id,
      start_date,
      end_date,
    ]);
    // console.log(categorywiseIncomeResult);

    return res.json({
      msg: "OK",
      result: result.rows[0],
      categorywiseExpenseResult: categorywiseExpenseResult.rows || [],
      categorywiseIncomeResult: categorywiseIncomeResult.rows || [],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Internal Server Error",
    });
  }
};

export const summarizeAccountTransaction = async (
  req: Request,
  res: Response,
) => {
  try {
    const start_date = req.query.start_date;
    const end_date = req.query.end_date;
    // const acc_id = req.query.acc_id;
    const user_id = req.auth?.id;

    // Validate that start_date, end_date and user_id are all string
    if (typeof start_date !== "string") {
      return res.status(400).json({
        msg: "start_date should be a stirng",
      });
    }

    if (typeof end_date !== "string") {
      return res.status(400).json({
        msg: "end_date should be a stirng",
      });
    }

    // if (typeof acc_id !== "string") {
    //   return res.status(400).json({
    //     msg: "acc_id should be a stirng",
    //   });
    // }

    if (typeof user_id !== "string") {
      return res.status(400).json({
        msg: "user_id should be a stirng",
      });
    }

    // Validate the start_date, end_date
    if (!validateDate(start_date)) {
      return res.status(400).json({
        msg: "Start date isn't a valid date",
      });
    }

    if (!validateDate(end_date)) {
      return res.status(400).json({
        msg: "End date isn't a valid date",
      });
    }

    // if (!validate(acc_id)) {
    //   return res.status(400).json({
    //     msg: "End date isn't a valid date",
    //   });
    // }

    // Validate user_id

    if (!validate(user_id)) {
      return res.status(400).json({
        msg: "Invalid user Id",
      });
    }

    // Check if the user_id exist
    // const existingAccount = await pool.query(
    //   "SELECT acc_id FROM accounts WHERE user_id = $1 AND acc_id = $2",
    //   [user_id, acc_id],
    // );
    // if (existingAccount.rows.length === 0) {
    //   return res.status(404).json({
    //     msg: "Account with this id doesn't exist",
    //   });
    // }

    // This query is made by AI. GO get a AI to explain it!

    const query = `

WITH account_transactions AS (
    SELECT
        a.acc_id,
        a.acc_name,
        a.acc_type,
        t.tran_id,
        t.tran_amount,
        t.tran_type,
        t.tran_date,
        t.tran_desc,
        t.tran_merchant
    FROM accounts a
    LEFT JOIN transactions t
        ON t.acc_id = a.acc_id
        AND t.user_id = a.user_id
        AND t.tran_date BETWEEN $2 AND $3
        AND t.deleted_at IS NULL
    WHERE a.user_id = $1
),

category_totals AS (
    SELECT
        a.acc_id,
        c.cat_name,
        COALESCE(SUM(t.tran_amount), 0) AS total_amount
    FROM accounts a
    CROSS JOIN categories c
    LEFT JOIN transactions t
        ON t.acc_id = a.acc_id
        AND t.cat_id = c.cat_id
        AND t.user_id = a.user_id
        AND t.tran_date BETWEEN $2 AND $3
        AND t.deleted_at IS NULL
    WHERE
        a.user_id = $1
        AND c.user_id = $1
    GROUP BY a.acc_id, c.cat_id, c.cat_name
),

category_json AS (
    SELECT
        acc_id,
        jsonb_object_agg(
            cat_name,
            total_amount
        ) AS categorywise_total_amount
    FROM category_totals
    GROUP BY acc_id
)

SELECT
    at.acc_id,
    at.acc_name,
    at.acc_type,

    COUNT(at.tran_id)::int AS total_number_of_transaction,

    COALESCE(SUM(at.tran_amount), 0) AS total_value_of_transaction,

    COUNT(at.tran_id) FILTER (
        WHERE at.tran_type = 'income'
    )::int AS total_number_of_income,

    COUNT(at.tran_id) FILTER (
        WHERE at.tran_type = 'expense'
    )::int AS total_number_of_expense,

    COALESCE(
        SUM(at.tran_amount) FILTER (
            WHERE at.tran_type = 'income'
        ), 0
    ) AS total_value_of_income,

    COALESCE(
        SUM(at.tran_amount) FILTER (
            WHERE at.tran_type = 'expense'
        ), 0
    ) AS total_value_of_expense,

    cj.categorywise_total_amount,

    (
        SELECT to_jsonb(f)
        FROM account_transactions f
        WHERE f.acc_id = at.acc_id
        AND f.tran_type = 'expense'
        ORDER BY f.tran_amount DESC, f.tran_date DESC
        LIMIT 1
    ) AS most_expense_transaction,

    (
        SELECT to_jsonb(f)
        FROM account_transactions f
        WHERE f.acc_id = at.acc_id
        AND f.tran_type = 'income'
        ORDER BY f.tran_amount DESC, f.tran_date DESC
        LIMIT 1
    ) AS most_income_transaction,

    (
        SELECT to_jsonb(f)
        FROM account_transactions f
        WHERE f.acc_id = at.acc_id
        AND f.tran_type = 'expense'
        ORDER BY f.tran_amount ASC, f.tran_date DESC
        LIMIT 1
    ) AS least_expense_transaction,

    (
        SELECT to_jsonb(f)
        FROM account_transactions f
        WHERE f.acc_id = at.acc_id
        AND f.tran_type = 'income'
        ORDER BY f.tran_amount ASC, f.tran_date DESC
        LIMIT 1
    ) AS least_income_transaction

FROM account_transactions at
LEFT JOIN category_json cj
    ON cj.acc_id = at.acc_id

GROUP BY
    at.acc_id,
    at.acc_name,
    at.acc_type,
    cj.categorywise_total_amount

ORDER BY at.acc_name;

    `;

    const result = await pool.query(query, [
      user_id,
      start_date,
      end_date,
    ]);

    return res.json({
      msg: "OK",
      result: result.rows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Internal Server Error",
    });
  }
};

export const summarizeCategoriesTransactionsController = async (
  req: Request,
  res: Response,
) => {
  try {
    const now = new Date();

    const start_date =
      req.query.start_date ?? formatDate(new Date(now.getFullYear(), 0, 1));
    const end_date = req.query.end_date ?? formatDate(now);
    const cat_id = req.query.cat_id;
    const user_id = req.auth?.id;

    // Validate that start_date, end_date, cat_id and user_id are all strings
    if (typeof start_date !== "string") {
      return res.status(400).json({
        msg: "start_date should be a string",
      });
    }

    if (typeof end_date !== "string") {
      return res.status(400).json({
        msg: "end_date should be a string",
      });
    }

    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({
        msg: "start_date can't be after end_date",
      });
    }

    if (typeof cat_id !== "string") {
      return res.status(400).json({
        msg: "cat_id should be a string",
      });
    }

    if (typeof user_id !== "string") {
      return res.status(400).json({
        msg: "user_id should be a string",
      });
    }

    // Validate the start_date, end_date
    if (!validateDate(start_date)) {
      return res.status(400).json({
        msg: "Start date isn't a valid date",
      });
    }

    if (!validateDate(end_date)) {
      return res.status(400).json({
        msg: "End date isn't a valid date",
      });
    }

    // Validate cat_id and user_id (UUIDs)
    if (!validate(cat_id)) {
      return res.status(400).json({
        msg: "Invalid category Id",
      });
    }

    if (!validate(user_id)) {
      return res.status(400).json({
        msg: "Invalid user Id",
      });
    }

    // Check that the category exists (and isn't soft-deleted)
    const existingCategory = await pool.query(
      "SELECT cat_id FROM categories WHERE cat_id = $1 AND deleted_at IS NULL",
      [cat_id],
    );
    if (existingCategory.rows.length === 0) {
      return res.status(404).json({
        msg: "Category with this id doesn't exist",
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

    const result = await pool.query(query, [
      user_id,
      cat_id,
      start_date,
      end_date,
    ]);

    return res.json({
      msg: "OK",
      result: result.rows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Internal Server Error",
    });
  }
};


export const summaryWeekwiseTransactionsController = async (
  req: Request,
  res: Response
) => {
  try {
    const start_date = req.query.start_date;
    const end_date = req.query.end_date;
    const user_id = req.auth?.id;

    // Validate input types
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

    if (typeof user_id !== "string") {
      return res.status(400).json({
        msg: "user_id should be a string"
      });
    }

    // Validate dates
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

    // Validate date range
    if (start_date > end_date) {
      return res.status(400).json({
        msg: "Start date cannot be greater than end date"
      });
    }

    // Validate user ID
    if (!validate(user_id)) {
      return res.status(400).json({
        msg: "Invalid user Id"
      });
    }

    // Check whether user exists
    const existedUser = await pool.query(
      "SELECT user_id FROM users WHERE user_id = $1",
      [user_id]
    );

    if (existedUser.rows.length === 0) {
      return res.status(404).json({
        msg: "User with this id doesn't exist"
      });
    }

    // Weekwise transaction summary
    const query = `
      WITH weeks AS (
        SELECT generate_series(
          1,
          CEIL(
            EXTRACT(
              DAY FROM (
                DATE_TRUNC('month', $2::date)
                + INTERVAL '1 month - 1 day'
              )
            ) / 7.0
          )::int
        ) AS week
      ),

      weekly_data AS (
        SELECT
          ((EXTRACT(DAY FROM tran_date)::int - 1) / 7) + 1 AS week,

          COALESCE(
            SUM(tran_amount) FILTER (
              WHERE tran_type = 'income'
            ), 0
          ) AS income,

          COALESCE(
            SUM(tran_amount) FILTER (
              WHERE tran_type = 'expense'
            ), 0
          ) AS expense

        FROM transactions
        WHERE
          user_id = $1
          AND tran_date BETWEEN $2 AND $3
          AND deleted_at IS NULL
        GROUP BY week
      )

      SELECT
        w.week,
        COALESCE(wd.income, 0) AS income,
        COALESCE(wd.expense, 0) AS expense

      FROM weeks w
      LEFT JOIN weekly_data wd
        ON wd.week = w.week

      ORDER BY w.week;
    `;

    const result = await pool.query(query, [
      user_id,
      start_date,
      end_date
    ]);

    return res.status(200).json({
      msg: "OK",
      result: result.rows
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      msg: "Internal Server Error"
    });
  }
};

