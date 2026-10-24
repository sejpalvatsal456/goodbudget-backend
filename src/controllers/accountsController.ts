import { Request, Response } from "express";
import pool from "../lib/pgInit.js";
import { validate } from "uuid";
import { validateAccountType, validateBalance, validateName } from "../lib/validations.js";

export const getAllAccountsController = async(req: Request, res: Response) => {
  try {

    const user_id = req.auth!.id;

    const RATE_LIMIT = process.env.RATE_LIMIT || "10";
    const query = "SELECT * FROM accounts WHERE user_id = $1 AND acc_is_disabled = FALSE LIMIT $2";
    const result = await pool.query(query, [user_id, parseInt(RATE_LIMIT)]);

    return res.json({
      msg: "ok",
      result: result.rows
    })

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Internal Server Error."
    });
  }
};

export const getSpecificAccountController = async(req: Request, res: Response) => {
  try {
    const acc_id = req.params.id as string;
    const user_id = req.auth!.id;

    if(!validate(acc_id)) {
      return res.status(400).json({
        msg: "Invalid Account Id."
      });
    }

    const query = "SELECT * FROM accounts WHERE acc_id = $1 AND user_id = $2";
    const result = await pool.query(query, [acc_id, user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        msg: "Account with this id doesn't exist."
      });
    } 

    return res.json({
      msg: "ok",
      result: result.rows[0]
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Internal Server Error."
    });
  }
};

export const createAccountController = async(req: Request, res: Response) => {
  try {
    
    const { acc_name, acc_type, acc_balance } = req.body as {
      acc_name: string,
      acc_type: 'cash' | 'saving' | 'credit_card' | 'current',
      acc_balance: number,
    };

    const user_id: string = req.auth!.id;

    if(!validateName(acc_name)) {
      return res.status(400).json({
        msg: "Account name should be non empty and atmost 60 characters."
      });
    }

    if(!validateBalance(acc_balance)) {
      return res.status(400).json({
        msg: "Balance should be greater than 0."
      });
    }

    if(!validateAccountType(acc_type)) {
      return res.status(400).json({
        msg: "Account type isn't valid."
      });
    }

    if (!validate(user_id)) {
      return res.status(400).json({
        msg: "Invalid user id."
      });
    }

    const existedUserQuery = "SELECT user_id FROM users WHERE user_id = $1";
    const existedUserResult = await pool.query(existedUserQuery, [user_id]);

    if(existedUserResult.rows.length === 0) {
      return res.status(404).json({
        msg: "User with this id doesn't exist."
      });
    }

    const insertQuery = "INSERT INTO accounts(acc_name, acc_type, acc_balance, user_id) VALUES($1, $2, $3, $4) RETURNING *";
    const insertResult = await pool.query(insertQuery, [acc_name, acc_type, acc_balance, user_id]);

    return res.json({
      msg: "ok",
      result: insertResult.rows[0]
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Internal Server Error."
    });
  }
}

export const updateAccountController = async(req: Request, res: Response) => {
  try {
    
    const { acc_id, acc_name, acc_type, acc_is_disabled } = req.body as {
      acc_id: string,
      acc_name?: string,
      acc_type?: 'cash' | 'current' | 'saving' | 'credit_card',
      acc_is_disabled?: boolean
    };

    const user_id: string = req.auth!.id;

    if(!validate(acc_id)) {
      return res.status(400).json({
        msg: "Invalid account id."
      });
    }

    if(acc_name !== undefined && !validateName(acc_name)) {
      return res.status(400).json({
        msg: "Account name should be non empty and at most 60 characters."
      });
    }


    if(acc_type !== undefined && !validateAccountType(acc_type)) {
      return res.status(400).json({
        msg: "Account type isn't valid."
      });
    }


    let updatedFields = [];
    let updatedValues = [];

    if(acc_name !== undefined) {
      updatedFields.push(`acc_name = $${updatedValues.length + 1}`);
      updatedValues.push(acc_name);
    }

    if(acc_type !== undefined) {
      updatedFields.push(`acc_type = $${updatedValues.length + 1}`);
      updatedValues.push(acc_type);
    }

    if(acc_is_disabled !== undefined) {
      updatedFields.push(`acc_is_disabled = $${updatedValues.length + 1}`);
      updatedValues.push(acc_is_disabled);
    }

    updatedValues.push(acc_id);
    updatedValues.push(user_id);

    if (updatedFields.length === 0) {
      return res.status(400).json({
        msg: "No fields provided for update."
      });
    }

    const updateQuery = `UPDATE accounts SET ${updatedFields.join(", ")} WHERE acc_id = $${updatedValues.length - 1} AND user_id = $${updatedValues.length} RETURNING *`;
    const updateResult = await pool.query(updateQuery, updatedValues);

    if(updateResult.rows.length === 0) {
      return res.status(404).json({
        msg: "Account with this acc_id and user_id doesn't exist."
      });
    }

    return res.json({
      msg: "ok",
      result: updateResult.rows[0]
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Internal Server Error."
    });
  }
};

export const softDeleteAccountController = async (
  req: Request,
  res: Response,
) => {
  try {
    const user_id: string = req.auth!.id;
    const acc_id = req.body.acc_id;

    // -------------------------
    // Validate IDs
    // -------------------------

    if (!validate(user_id)) {
      return res.status(400).json({ msg: "Invalid user id." });
    }

    if (!validate(acc_id)) {
      return res.status(400).json({ msg: "Invalid account id." });
    }

    // -------------------------
    // Soft delete (single atomic statement)
    // -------------------------

    const result = await pool.query(
      `UPDATE accounts
       SET acc_is_disabled = true, updated_at = now()
       WHERE acc_id = $1 AND user_id = $2 AND acc_is_disabled = false
       RETURNING acc_id, acc_type, acc_name, acc_balance, acc_is_disabled, updated_at`,
      [acc_id, user_id],
    );

    if (result.rows.length > 0) {
      return res.status(200).json({
        msg: "ok",
        result: result.rows[0],
      });
    }

    // Nothing updated: either it doesn't exist / isn't theirs, or it's already disabled
    const existing = await pool.query(
      "SELECT acc_is_disabled FROM accounts WHERE acc_id = $1 AND user_id = $2;",
      [acc_id, user_id],
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        msg: "Account doesn't exist or doesn't belong to this user.",
      });
    }

    return res.status(409).json({ msg: "Account is already deleted." });
  } catch (error: unknown) {
    console.error(error);
    return res.status(500).json({ msg: "Internal Server Error." });
  }
};