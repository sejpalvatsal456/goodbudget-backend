import { Request, Response } from "express";
import { validateEmail, validateName, validatePassword, validateUsername } from "../lib/validations.js";
import pool from "../lib/pgInit.js";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const signupController = async(req: Request, res: Response) => {
  try {

    if (!process.env.JWT_ACCESS_SECRET) {
      throw new Error("JWT_ACCESS_SECRET is not configured");
    }

    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error("JWT_REFRESH_SECRET is not configured");
    }
    console.log(req.body)
    const raw_name = req.body.name;
    const raw_email = req.body.email;
    const raw_username = req.body.username;
    const password = req.body.password;

    // Validate name, email, username, password types

    if(typeof raw_name !== "string") {
      return res.status(400).json({
        msg: "Name can only be string"
      });
    }

    if(typeof raw_email !== "string") {
      return res.status(400).json({
        msg: "Email can only be string"
      });
    }

    if(typeof raw_username !== "string") {
      return res.status(400).json({
        msg: "Username can only be string"
      });
    }

    if(typeof password !== "string") {
      return res.status(400).json({
        msg: "Password can only be string"
      });
    }

    // Trim the name, email, username
    const name = raw_name.trim();
    const email = raw_email.trim().toLowerCase();
    const username = raw_username.trim().toLowerCase();

    // Validate the syntax of name, email, password, username

    if(!validateName(name)) {
      return res.status(400).json({
        msg: "Name should be non empty string with atmost 60 characters."
      });
    }

    if(!validateEmail(email)) {
      return res.status(400).json({
        msg: "Email syntax is invalid."
      });
    }

    if(!validateUsername(username)) {
      return res.status(400).json({
        msg: "Username is invalid."
      });
    }

    if(!validatePassword(password)) {
      return res.status(400).json({
        msg: "Password is invalid."
      });
    }

    // Check if the user with this email already exist
    const existingEmailUser = await pool.query("SELECT user_id FROM users WHERE user_email = $1", [email]);
    if(existingEmailUser.rows.length !== 0) {
      return res.status(409).json({
        msg: "User with this email already exist."
      });
    }

    // Check if the user with this username already exist
    const existingUserNameUser = await pool.query("SELECT user_id FROM users WHERE user_username = $1", [username]);
    if(existingUserNameUser.rows.length !== 0) {
      return res.status(409).json({
        msg: "User with this username already exist."
      });
    }

    // create a hash for the password
    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
    if (!Number.isInteger(saltRounds) || saltRounds < 10) {
      throw new Error("Invalid BCRYPT_SALT_ROUNDS configuration");
    }

    const hashPassword = await bcrypt.hash(password, saltRounds);

    // Add the user into database
    const insertQuery = "INSERT INTO users(user_name, user_email, user_username, user_password) VALUES ($1, $2, $3, $4) RETURNING user_id, user_name, user_email, user_username";
    const insertResult = await pool.query(insertQuery, [name, email, username, hashPassword]);

    const user = insertResult.rows[0];

    // Generate a jwt for the user
    
    const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

    const accessToken = jwt.sign({user_id: user.user_id}, JWT_ACCESS_SECRET, { expiresIn: "15m" });
    const refreshToken = jwt.sign({user_id: user.user_id}, JWT_REFRESH_SECRET, { expiresIn: "7d" });

    // return a 201 response
    return res.status(201).json({
      msg: "Ok",
      user,
      accessToken,
      refreshToken
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Internal Server Error"
    });
  }
}

export const loginController = async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const raw_identifier = body.identifier;
    const password = body.password;

    if (typeof raw_identifier !== "string") {
      return res.status(400).json({
        msg: "Identifier can only be a string.",
      });
    }

    if (typeof password !== "string") {
      return res.status(400).json({
        msg: "Password can only be a string.",
      });
    }

    const identifier = raw_identifier.trim().toLowerCase();

    if (!identifier) {
      return res.status(400).json({
        msg: "Email or username is required.",
      });
    }

    // Look up by email OR username — both columns are unique, so at most
    // one row can match.
    const userQuery = `
      SELECT user_id, user_name, user_email, user_username, user_password
      FROM users
      WHERE user_email = $1 OR user_username = $1
    `;
    const userResult = await pool.query(userQuery, [identifier]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({
        msg: "User with this email or username doesn't exist.",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.user_password);

    if (!passwordMatches) {
      return res.status(401).json({
        msg: "Incorrect password.",
      });
    }

    if (!process.env.JWT_ACCESS_SECRET) {
      throw new Error("JWT_ACCESS_SECRET is not configured");
    }
    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error("JWT_REFRESH_SECRET is not configured");
    }

    const accessToken = jwt.sign(
      { user_id: user.user_id },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: "15m", algorithm: "HS256" },
    );
    const refreshToken = jwt.sign(
      { user_id: user.user_id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d", algorithm: "HS256" },
    );

    // res.cookie("refreshToken", refreshToken, {
    //   httpOnly: true,
    //   secure: true,
    //   sameSite: "strict",
    //   maxAge: 7 * 24 * 60 * 60 * 1000,
    //   path: "/auth",
    // });

    return res.status(200).json({
      msg: "ok",
      user: {
        user_id: user.user_id,
        user_name: user.user_name,
        user_email: user.user_email,
        user_username: user.user_username,
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Internal Server Error",
    });
  }
};