import { Request, Response } from "express";
import { validate } from "uuid";

import pool from "../lib/pgInit.js";
import {
  validateBalance,
  validateDate,
  validateTransactionMode,
  validateTransactionStatus,
  validateTransactionType,
} from "../lib/validations.js";

const RATE_LIMIT = Number.parseInt(process.env.RATE_LIMIT ?? "10", 10);

// ---------------------------------------------------------
// GET SPECIFIC TRANSACTION
// ---------------------------------------------------------

export const getSpecificTransactionController = async (
  req: Request,
  res: Response,
) => {
  try {
    const tran_id = req.params.id as string;
    const user_id = req.auth!.id;

    if (!validate(tran_id)) {
      return res.status(400).json({
        msg: "Invalid transaction id.",
      });
    }

    const query = `
      SELECT *
      FROM transactions
      WHERE tran_id = $1 AND user_id = $2
    `;

    const result = await pool.query(query, [tran_id, user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        msg: "Transaction with this id doesn't exist.",
      });
    }

    return res.json({
      msg: "ok",
      result: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      msg: "Internal Server Error.",
    });
  }
};

// ---------------------------------------------------------
// GET ALL TRANSACTIONS
// ---------------------------------------------------------

export const getAllTransaction = async (
  req: Request,
  res: Response,
) => {
  try {
    const user_id = req.auth!.id;
    const offset = req.query.offset ?? "0" ;

    const query = `
      SELECT t.*, c.cat_name
      FROM transactions t
      JOIN categories c
      ON t.cat_id = c.cat_id
      WHERE t.user_id = $1
      ORDER BY t.tran_date DESC, t.created_at DESC
      LIMIT $2
      OFFSET $3
    `;

    const result = await pool.query(query, [user_id, RATE_LIMIT, offset]);

    return res.json({
      msg: "ok",
      result: result.rows,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      msg: "Internal Server Error.",
    });
  }
};

// ---------------------------------------------------------
// GET ALL TRANSACTIONS FOR SPECIFIC ACCOUNT
// ---------------------------------------------------------

export const getAllTransactionForSpecificAccount = async (
  req: Request,
  res: Response,
) => {
  try {
    const account_id = req.params.id as string;
    const user_id = req.auth!.id;

    if (!validate(account_id)) {
      return res.status(400).json({
        msg: "Invalid account id.",
      });
    }

    const existedAccountQuery = `
      SELECT acc_id
      FROM accounts
      WHERE acc_id = $1 AND user_id = $2
    `;

    const existedAccountResult = await pool.query(existedAccountQuery, [
      account_id,
      user_id
    ]);

    if (existedAccountResult.rows.length === 0) {
      return res.status(404).json({
        msg: "Account with this id doesn't exist.",
      });
    }

    const query = `
      SELECT *
      FROM transactions
      WHERE account_id = $1 and user_id = $2
      ORDER BY tran_date DESC, "created_at" DESC
    `;

    const result = await pool.query(query, [account_id, user_id]);

    return res.json({
      msg: "ok",
      result: result.rows,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      msg: "Internal Server Error.",
    });
  }
};

// ---------------------------------------------------------
// CREATE TRANSACTION
// ---------------------------------------------------------

// TODO: change default tran_status from 'pending' to 'completed'

export const issueTransactionController = async (
  req: Request,
  res: Response,
) => {
  const client = await pool.connect();
  try {
    const {
      tran_desc,
      tran_status,
      account_id,
      tran_merchant,
      tran_mode,
      tran_type,
      tran_date,
      tran_amount,
    } = req.body as {
      tran_desc?: string;
      tran_status?: string;
      account_id: string;
      tran_merchant: string;
      tran_mode?: string;
      tran_type: string;
      tran_date?: string;
      tran_amount: number;
    };

    const user_id: string = req.auth!.id;

    // -------------------------
    // Validate IDs
    // -------------------------

    if (!validate(user_id)) {
      return res.status(400).json({
        msg: "Invalid user id.",
      });
    }

    if (!validate(account_id)) {
      return res.status(400).json({
        msg: "Invalid account id.",
      });
    }

    // -------------------------
    // Validate required fields
    // -------------------------

    if (!tran_merchant) {
      return res.status(400).json({
        msg: "Transaction merchant is required.",
      });
    }

    if (!validateBalance(tran_amount)) {
      return res.status(400).json({
        msg: "Transaction amount should be greater than 0.",
      });
    }

    if (!validateTransactionType(tran_type)) {
      return res.status(400).json({
        msg: "Type can only be 'income', 'expense'.",
      });
    }

    // -------------------------
    // Validate optional fields
    // (only if provided)
    // -------------------------

    if (tran_status !== undefined && !validateTransactionStatus(tran_status)) {
      return res.status(400).json({
        msg: "Status can only be 'pending', 'completed', 'failed'."
      });
    }

    if (tran_mode !== undefined && !validateTransactionMode(tran_mode)) {
      return res.status(400).json({
        msg: "Mode can only be 'cash', 'online', 'credit_card'."
      });
    }

    if (tran_date !== undefined && !validateDate(tran_date)) {
      return res.status(400).json({
        msg: "Invalid transaction date.",
      });
    }

    // -------------------------
    // Build dynamic INSERT
    // (omitted optional fields fall
    // back to the schema's DEFAULT)
    // -------------------------

    const insertedFields: string[] = ["user_id", "account_id", "tran_merchant", "tran_amount", "tran_type"];
    const insertedValues: unknown[] = [user_id, account_id, tran_merchant, tran_amount, tran_type];

    if (tran_desc !== undefined) {
      insertedFields.push("tran_desc");
      insertedValues.push(tran_desc);
    }

    if (tran_status !== undefined) {
      insertedFields.push("tran_status");
      insertedValues.push(tran_status);
    }

    if (tran_mode !== undefined) {
      insertedFields.push("tran_mode");
      insertedValues.push(tran_mode);
    }

    if (tran_date !== undefined) {
      insertedFields.push("tran_date");
      insertedValues.push(tran_date);
    }

    await client.query("BEGIN");

    // get the account details

    const accountResult = await client.query("SELECT acc_type, acc_balance FROM accounts WHERE acc_id = $1 AND user_id = $2 FOR UPDATE;", [account_id, user_id]);

    if (accountResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ msg: "Account doesn't exist or doesn't belong to this user." });
    }

    const { acc_type } = accountResult.rows[0];
    const acc_balance = Number(accountResult.rows[0].acc_balance)

    if (
      ["cash", "current", "saving"].includes(acc_type) &&
      tran_type === "expense" &&
      tran_amount > acc_balance
    ) {
      await client.query("ROLLBACK");
      return res.status(422).json({
        msg: "Transaction amount is greater than account balance, it can not be processed.",
      });
    }

    const balanceUpdateQuery = `
      UPDATE accounts
      SET acc_balance = acc_balance ${tran_type === "income" ? "+" : "-"} $1
      WHERE acc_id = $2 AND user_id = $3
      RETURNING acc_id
    `;
    const balanceResult = await client.query(balanceUpdateQuery, [tran_amount, account_id, user_id]);

    if (balanceResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ msg: "Account doesn't exist or doesn't belong to this user." });
    }

    const placeholders = insertedValues.map((_, i) => `$${i + 1}`).join(", ");
    const insertQuery = `
      INSERT INTO transactions (${insertedFields.join(", ")})
      VALUES (${placeholders})
      RETURNING *
    `;
    console.log(insertQuery);
    const transactionResult = await client.query(insertQuery, insertedValues);

    await client.query("COMMIT");

    return res.status(201).json({
      msg: "ok",
      result: transactionResult.rows[0],
    });

  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => {}); // no-op if no txn was open
    console.error(error);

    if (typeof error === "object" && error !== null && "code" in error) {
      const pgError = error as {
        code: string;
      };

      // Invalid PostgreSQL enum value
      if (pgError.code === "22P02") {
        return res.status(400).json({
          msg: "Invalid transaction status, mode or type.",
        });
      }

      // Foreign key violation
      if (pgError.code === "23503") {
        return res.status(400).json({
          msg: "Invalid user or account.",
        });
      }

      // NOT NULL violation (e.g. a column with no schema DEFAULT was omitted)
      if (pgError.code === "23502") {
        return res.status(400).json({
          msg: "Missing required transaction field.",
        });
      }
    }

    return res.status(500).json({
      msg: "Internal Server Error.",
    });
  } finally {
    client.release();
  }
};

// ---------------------------------------------------------
// UPDATE TRANSACTION
// ---------------------------------------------------------

export const updateTransactionController = async (
  req: Request,
  res: Response,
) => {
  try {
    const {
      tran_id,
      tran_desc,
      tran_status,
      tran_merchant,
      tran_mode,
      tran_date,
    } = req.body as {
      tran_id: string;
      tran_desc?: string;
      tran_status?: string;
      tran_merchant?: string;
      tran_mode?: string;
      tran_date?: string;
    };

    const user_id: string = req.auth!.id;

    // -------------------------
    // Validate transaction ID
    // -------------------------

    if (!validate(tran_id)) {
      return res.status(400).json({
        msg: "Invalid transaction id.",
      });
    }

    // -------------------------
    // Validate fields
    // -------------------------

    if (tran_status !== undefined && !validateTransactionStatus(tran_status)) {
      return res.status(400).json({
        msg: "Status can only be 'pending', 'completed', 'failed'.",
      });
    }

    if (tran_mode !== undefined && !validateTransactionMode(tran_mode)) {
      return res.status(400).json({
        msg: "Mode can only be 'cash', 'online', 'credit_card'.",
      });
    }

    if (tran_date !== undefined && !validateDate(tran_date)) {
      return res.status(400).json({
        msg: "Invalid transaction date.",
      });
    }

    // -------------------------
    // Build dynamic UPDATE
    // -------------------------

    const updatedFields: string[] = [];
    const updatedValues: unknown[] = [];

    if (tran_desc !== undefined) {
      updatedFields.push(`tran_desc = $${updatedValues.length + 1}`);
      updatedValues.push(tran_desc);
    }

    if (tran_status !== undefined) {
      updatedFields.push(`tran_status = $${updatedValues.length + 1}`);
      updatedValues.push(tran_status);
    }

    if (tran_merchant !== undefined) {
      updatedFields.push(`tran_merchant = $${updatedValues.length + 1}`);
      updatedValues.push(tran_merchant);
    }

    if (tran_mode !== undefined) {
      updatedFields.push(`tran_mode = $${updatedValues.length + 1}`);
      updatedValues.push(tran_mode);
    }

    if (tran_date !== undefined) {
      updatedFields.push(`tran_date = $${updatedValues.length + 1}`);
      updatedValues.push(tran_date);
    }

    // -------------------------
    // Nothing to update
    // -------------------------

    if (updatedFields.length === 0) {
      return res.status(400).json({
        msg: "No fields provided for update.",
      });
    }

    // Always update updated_at
    updatedFields.push(`"updated_at" = now()`);

    updatedValues.push(tran_id);
    updatedValues.push(user_id);

    const updateQuery = `
      UPDATE transactions
      SET ${updatedFields.join(", ")}
      WHERE tran_id = $${updatedValues.length - 1} AND user_id = $${updatedValues.length} AND deleted_at IS NULL
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, updatedValues);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        msg: "Transaction with this id doesn't exist.",
      });
    }

    return res.json({
      msg: "ok",
      result: updateResult.rows[0],
    });
  } catch (error: unknown) {
    console.error(error);

    if (typeof error === "object" && error !== null && "code" in error) {
      const pgError = error as {
        code: string;
      };

      if (pgError.code === "22P02") {
        return res.status(400).json({
          msg: "Invalid transaction status or mode.",
        });
      }
    }

    return res.status(500).json({
      msg: "Internal Server Error.",
    });
  }
};

// ---------------------------------------------------------
// DELETE TRANSACTION
// ---------------------------------------------------------

export const softDeleteTransactionController = async (
  req: Request,
  res: Response,
) => {
  const client = await pool.connect();
  try {
    const { tran_id } = req.body as {
      tran_id: string;
    };

    const user_id: string = req.auth!.id;

    // Validation

    if (!validate(tran_id)) {
      return res.status(400).json({
        msg: "Invalid transaction id.",
      });
    }

    await client.query("BEGIN");

    const deleteQuery = `
      UPDATE transactions
      SET deleted_at = now()
      WHERE user_id = $1 AND tran_id = $2 AND deleted_at IS NULL
      RETURNING *;
    `;

    const deleteResult = await client.query(deleteQuery, [user_id, tran_id]);

    if (deleteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        msg: "Transaction with this id doesn't exist.",
      });
    }

    // Update the account balance
    const acc_id = deleteResult.rows[0].account_id;
    const tran_type = deleteResult.rows[0].tran_type;
    const sign = tran_type === "income" ? "-" : "+";
    const tran_amount = deleteResult.rows[0].tran_amount;

    const updateBalanceQuery = `
      UPDATE accounts 
      SET acc_bal ${sign}= $1
      WHERE acc_id = $2 AND user_id = $3
      RETURNING *;
    `;

    const updateBalanceResult = await client.query(updateBalanceQuery, [tran_amount, acc_id, user_id]);

    if(updateBalanceResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(500).json({
        msg: "Failed to update the balance."
      });
    }

    await client.query("COMMIT");

    return res.json({
      msg: "ok",
      result: deleteResult.rows[0],
    });
  } catch (error) {
    console.error(error);
    await client.query("ROLLBACK");

    return res.status(500).json({
      msg: "Internal Server Error.",
    });
  } finally {
    client.release();
  }
};
