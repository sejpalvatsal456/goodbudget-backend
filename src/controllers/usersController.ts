import pool from '../lib/pgInit.js';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { validate } from 'uuid';
import { validateName, validatePassword, validateUsername } from '../lib/validations.js';

const RATE_LIMIT = Number.parseInt(process.env.RATE_LIMIT ?? "10", 10);

if (!Number.isInteger(RATE_LIMIT) || RATE_LIMIT <= 0) {
  throw new Error("Invalid RATE_LIMIT");
}

export const getSpecificUserController = async(req: Request, res: Response) => {
  try {
    const user_id = req.auth!.id;
    if (!validate(user_id)) {
      return res.status(400).json({ "msg": "Invalid User ID." });
    }

    const query = `SELECT user_id, user_name, user_email, user_username FROM users WHERE user_id = $1`;
    const result = await pool.query(query, [user_id]);
    // console.log("Result: ");
    // console.log(result);

    if (result.rows.length == 0) {
      return res.status(404).json({
        msg: "User doesn' t exist."
      });
    }

    return res.json({
      "msg": "ok",
      "data": result.rows
    });
    
  } catch (error) {
    console.error(error);
    return res.status(500).json({ "msg": "error" });
  }
};


export const updateUserController = async(req: Request, res: Response) => {
  try {
    const user_id: string = req.auth!.id;
    const user_name: string | undefined = req.body.user_name?.trim();
    const user_email: string | undefined = req.body.user_email?.trim();
    const user_username: string | undefined = req.body.user_username?.trim();
    const user_password: string | undefined = req.body.user_password;

    if(user_name && !validateName(user_name)) {
      return res.status(400).json({ msg: "Name should be non empty and should be less than 60 characters." });
    }
    if(user_username && !validateUsername(user_username)) {
      return res.status(400).json({ msg: "Username should be non empty, should only have lowercase, numeric or . _" });
    }
    if(user_password && !validatePassword(user_password)) {
      return res.status(400).json({ msg: "Password should be more than 8 characters, atleast one uppercase, one number adn one special character." });
    }

    if (!validate(user_id)) {
      return res.status(400).json({ "msg": "Invalid User ID." });
    }

    const userExistQuery = "SELECT user_id FROM users WHERE user_id = $1";
    const userExistResult = await pool.query(userExistQuery, [user_id]);
    if (userExistResult.rows.length == 0) {
      return res.status(404).json({
        "msg": "User doesn't exist."
      });
    }

    const updateFields = [];
    const updateValues = []

    if (user_name) {
      updateFields.push(`user_name = $${updateValues.length + 1}`);
      updateValues.push(user_name);
    }

    if (user_email) {
      updateFields.push(`user_email = $${updateValues.length + 1}`);
      updateValues.push(user_email);
    }

    if (user_username) {
      updateFields.push(`user_username = $${updateValues.length + 1}`);
      updateValues.push(user_username);
    }

    if (user_password) {
      const hashSalt = process.env.HASH_SALT;

      if (!hashSalt) {
        console.error("HASH_SALT is not configured.");
        return res.status(500).json({
          msg: "Internal server error."
        });
      }

      const hashPassword = await bcrypt.hash(
        user_password,
        parseInt(hashSalt, 10)
      );

      updateFields.push(`user_password = $${updateValues.length + 1}`);
      updateValues.push(hashPassword);
    }

    updateValues.push(user_id);

    if (updateFields.length === 0) {
      return res.status(400).json({
          msg: "No fields provided for update."
      });
  }

    const updateQuery = `UPDATE users SET ${updateFields.join(", ")} WHERE user_id = $${updateValues.length} RETURNING user_id, user_name, user_email, user_username`;
    const updateResult = await pool.query(updateQuery, updateValues);
    console.log(updateQuery);
    return res.json({
      result: updateResult.rows[0]
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ "msg": error });
  }
}

export const deleteUserontroller = async(req: Request, res: Response) => {
  try {
    const user_id = req.auth!.id;

    if (!validate(user_id)) {
      return res.status(400).json({ "msg": "Invalid User ID." });
    }

    const userExistQuery = `SELECT user_id FROM users WHERE user_id = $1`;
    const userExistResult = await pool.query(userExistQuery, [user_id]);
    if (userExistResult.rows.length === 0) {
      return res.status(404).json({
        "msg": "User doesn't exist."
      });
    }

    const deleteUserQuery = `DELETE FROM users WHERE user_id = $1 RETURNING user_id, user_name, user_email, user_username`;
    const deleteUserResult = await pool.query(deleteUserQuery, [user_id]);

    return res.json({
      result: deleteUserResult.rows[0]
    })

  } catch (error) {
    console.error(error);
    return res.status(500).json({ "msg": error });
  }
}

export const getBalanceController = async(req: Request, res: Response) => {
  try {
    const user_id = req.auth?.id;
    const query = "SELECT SUM(acc_balance) as total_balance FROM accounts WHERE user_id = $1 AND acc_type <> 'credit_card' AND acc_is_disabled IS FALSE";
    const result = await pool.query(query, [user_id]);
    console.log(result.rows[0])

    return res.json({
      msg: "ok",
      balance: Number.parseFloat(result.rows[0].total_balance)
    })

  } catch (error) {
    console.error(error);
    return res.status(500).json({ "msg": error });
  }
}