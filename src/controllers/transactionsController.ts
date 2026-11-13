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
import {
  applyToBalance,
  balanceErrors,
  lockAccount,
  lockTransaction,
  updateBalance,
} from "../utils/utils.js";

const RATE_LIMIT = Number.parseInt(process.env.RATE_LIMIT ?? "10", 10);

// This function assumes that account does exist and the authorised user is updating it.

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

export const getAllTransaction = async (req: Request, res: Response) => {
  try {
    const user_id = req.auth!.id;
    const offset = req.query.offset ?? "0";

    const query = `
      SELECT t.*, c.cat_name
      FROM transactions t
      LEFT JOIN categories c
      ON t.cat_id = c.cat_id
      WHERE t.user_id = $1 AND t.deleted_at IS NULL
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
    const acc_id = req.params.id as string;
    const user_id = req.auth!.id;

    if (!validate(acc_id)) {
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
      acc_id,
      user_id,
    ]);

    if (existedAccountResult.rows.length === 0) {
      return res.status(404).json({
        msg: "Account with this id doesn't exist.",
      });
    }

    const query = `
      SELECT *
      FROM transactions
      WHERE acc_id = $1 and user_id = $2
      ORDER BY tran_date DESC, "created_at" DESC
    `;

    const result = await pool.query(query, [acc_id, user_id]);

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

export const issueTransactionController = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const {
      tran_desc,
      tran_status = "success",
      acc_id,
      tran_merchant,
      tran_mode,
      tran_type,
      tran_date,
      tran_amount,
    } = req.body as {
      tran_desc?: string;
      tran_status?: string;
      acc_id: string;
      tran_merchant: string;
      tran_mode?: string;
      tran_type: string;
      tran_date?: string;
      tran_amount: number;
    };

    const user_id: string = req.auth!.id;

    // ---- validation ----

    if (!validate(user_id)) {
      return res.status(400).json({ msg: "Invalid user id." });
    }
    if (!validate(acc_id)) {
      return res.status(400).json({ msg: "Invalid account id." });
    }
    if (!tran_merchant) {
      return res.status(400).json({ msg: "Transaction merchant is required." });
    }
    if (!validateBalance(tran_amount)) {
      return res.status(400).json({ msg: "Transaction amount should be greater than 0." });
    }
    if (!validateTransactionType(tran_type)) {
      return res.status(400).json({ msg: "Type can only be 'income', 'expense'." });
    }
    if (!validateTransactionStatus(tran_status)) {
      return res.status(400).json({ msg: "Status can only be 'pending', 'success', 'failed'." });
    }
    if (tran_mode !== undefined && !validateTransactionMode(tran_mode)) {
      return res.status(400).json({ msg: "Mode can only be 'cash', 'online', 'credit_card'." });
    }
    if (tran_date !== undefined && !validateDate(tran_date)) {
      return res.status(400).json({ msg: "Invalid transaction date." });
    }

    // ---- build dynamic INSERT (omitted optional fields use the schema DEFAULT) ----

    const insertedFields: string[] = ["user_id", "acc_id", "tran_merchant", "tran_amount", "tran_type", "tran_status"];
    const insertedValues: unknown[] = [user_id, acc_id, tran_merchant, tran_amount, tran_type, tran_status];

    if (tran_desc !== undefined) {
      insertedFields.push("tran_desc");
      insertedValues.push(tran_desc);
    }
    if (tran_mode !== undefined) {
      insertedFields.push("tran_mode");
      insertedValues.push(tran_mode);
    }
    if (tran_date !== undefined) {
      insertedFields.push("tran_date");
      insertedValues.push(tran_date);
    }

    // ---- transaction ----

    await client.query("BEGIN");

    // ownership check, applies to every status
    if (!(await lockAccount(client, acc_id, user_id))) {
      await client.query("ROLLBACK");
      return res.status(404).json({ msg: balanceErrors.not_found.msg });
    }

    // only completed transactions touch the balance
    if (tran_status === "success") {
      const outcome = await applyToBalance(client, acc_id, user_id, tran_type, tran_amount);
      if (outcome !== "ok") {
        await client.query("ROLLBACK");
        return res.status(balanceErrors[outcome].status).json({ msg: balanceErrors[outcome].msg });
      }
    }

    const placeholders = insertedValues.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await client.query(
      `INSERT INTO transactions (${insertedFields.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      insertedValues,
    );

    await client.query("COMMIT");
    return res.status(201).json({ msg: "ok", result: rows[0] });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error);

    const code = (error as { code?: string } | null)?.code;

    // 22P02: invalid enum value, 23503: foreign key violation, 23502: NOT NULL violation
    if (code === "22P02") {
      return res.status(400).json({ msg: "Invalid transaction status, mode or type." });
    }
    if (code === "23503") {
      return res.status(400).json({ msg: "Invalid user or account." });
    }
    if (code === "23502") {
      return res.status(400).json({ msg: "Missing required transaction field." });
    }

    return res.status(500).json({ msg: "Internal Server Error." });
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
  const client = await pool.connect();
  try {
    const {
      tran_id,
      tran_desc,
      tran_status,
      tran_merchant,
      tran_mode,
      tran_date,
      tran_amount,
      cat_id,
    } = req.body as {
      tran_id: string;
      tran_desc?: string;
      tran_status?: string;
      tran_merchant?: string;
      tran_mode?: string;
      tran_date?: string;
      tran_amount?: number;
      cat_id?: string | null;
    };

    const user_id: string = req.auth!.id;

    // ---- validation (no DB transaction needed yet) ----

    if (!validate(tran_id)) {
      return res.status(400).json({ msg: "Invalid transaction id." });
    }
    if (tran_status !== undefined && !validateTransactionStatus(tran_status)) {
      return res
        .status(400)
        .json({ msg: "Status can only be 'pending', 'success', 'failed'." });
    }
    if (tran_mode !== undefined && !validateTransactionMode(tran_mode)) {
      return res
        .status(400)
        .json({ msg: "Mode can only be 'cash', 'online', 'credit_card'." });
    }
    if (tran_date !== undefined && !validateDate(tran_date)) {
      return res.status(400).json({ msg: "Invalid transaction date." });
    }
    if (tran_amount !== undefined && !validateBalance(tran_amount)) {
      return res.status(400).json({ msg: "Invalid transaction amount." });
    }
    if (cat_id !== undefined && cat_id !== null) {
      if (!validate(cat_id)) {
        return res.status(400).json({ msg: "Invalid category id." });
      }
      const category = await client.query(
        "SELECT 1 FROM categories WHERE cat_id = $1",
        [cat_id],
      );
      if (category.rows.length === 0) {
        return res
          .status(400)
          .json({ msg: "There is no category with this id." });
      }
    }

    // ---- build dynamic UPDATE ----

    const fields = {
      tran_desc,
      tran_status,
      tran_merchant,
      tran_mode,
      tran_date,
      tran_amount,
      cat_id,
    };
    const updatedFields: string[] = [];
    const updatedValues: unknown[] = [];

    for (const [column, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updatedValues.push(value);
        updatedFields.push(`${column} = $${updatedValues.length}`);
      }
    }

    if (updatedFields.length === 0) {
      return res.status(400).json({ msg: "No fields provided for update." });
    }

    updatedFields.push(`"updated_at" = now()`);
    updatedValues.push(tran_id, user_id);

    // ---- transaction ----

    await client.query("BEGIN");

    const lockResult = await lockTransaction(client, tran_id, user_id);
    if (!lockResult) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ msg: "Transaction with this id doesn't exist." });
    }

    // completed and failed transactions are final
    if (lockResult.rows[0].tran_status !== "pending") {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ msg: "A completed or failed transaction can't be updated." });
    }

    const updateResult = await client.query(
      `UPDATE transactions SET ${updatedFields.join(", ")}
       WHERE tran_id = $${updatedValues.length - 1} AND user_id = $${updatedValues.length}
       RETURNING *`,
      updatedValues,
    );
    const updated = updateResult.rows[0];

    // pending -> success: apply to the balance using the final amount
    if (tran_status === "success") {
      const outcome = await applyToBalance(
        client,
        updated.acc_id,
        user_id,
        updated.tran_type,
        updated.tran_amount,
      );
      if (outcome !== "ok") {
        await client.query("ROLLBACK");
        return res
          .status(balanceErrors[outcome].status)
          .json({ msg: balanceErrors[outcome].msg });
      }
    }

    const result = await client.query(
      "SELECT t.*, c.cat_name FROM transactions t LEFT JOIN categories c ON t.cat_id = c.cat_id WHERE t.tran_id = $1;",
      [tran_id],
    );

    await client.query("COMMIT");
    return res.json({ msg: "ok", result: result.rows[0] });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error);

    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "22P02"
    ) {
      return res
        .status(400)
        .json({ msg: "Invalid transaction status or mode." });
    }

    return res.status(500).json({ msg: "Internal Server Error." });
  } finally {
    client.release();
  }
};
// ---------------------------------------------------------
// DELETE TRANSACTION
// ---------------------------------------------------------

export const softDeleteTransactionController = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { tran_id } = req.body as { tran_id: string };
    const user_id: string = req.auth!.id;

    if (!validate(tran_id)) {
      return res.status(400).json({ msg: "Invalid transaction id." });
    }

    await client.query("BEGIN");

    // lock the transaction row (also filters out already-deleted rows)
    const lockResult = await lockTransaction(client, tran_id, user_id);
    if (!lockResult) {
      await client.query("ROLLBACK");
      return res.status(404).json({ msg: "Transaction with this id doesn't exist." });
    }
    const { acc_id, tran_type, tran_amount, tran_status } = lockResult.rows[0];

    // only successful transactions ever changed the balance, so only those are reverted
    if (tran_status === "success") {
      const outcome = await applyToBalance(client, acc_id, user_id, tran_type, tran_amount, true);
      if (outcome !== "ok") {
        await client.query("ROLLBACK");
        return res.status(balanceErrors[outcome].status).json({ msg: balanceErrors[outcome].msg });
      }
    }

    const deleteResult = await client.query(
      "UPDATE transactions SET deleted_at = now() WHERE tran_id = $1 AND user_id = $2 RETURNING *",
      [tran_id, user_id],
    );

    await client.query("COMMIT");
    return res.json({ msg: "ok", result: deleteResult.rows[0] });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error);
    return res.status(500).json({ msg: "Internal Server Error." });
  } finally {
    client.release();
  }
};
