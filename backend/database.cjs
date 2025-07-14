const mysql = require("mysql2");
const dotenv = require("dotenv");
const express = require("express");

const bcrypt = require('bcrypt');
const saltRounds = 10;

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
}).promise()

const confirmLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Retrieve user with matching username
    const [rows] = await pool.query(
      `SELECT * FROM login_info WHERE employee_username = ?`,
      [username]
    );

    // If no user found
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const user = rows[0];

    // Compare entered password with hashed password
    const comparison = await bcrypt.compare(password, user.employee_password);

    if (comparison) {
      // Login successful, send user info back
      delete user.employee_password;
      res.json({ success: true, user });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const resetPassword = async(req, res) => {
  try{
    const username = req.body.username;
    const password = req.body.password; 
    const encryptedPassword = await bcrypt.hash(password, saltRounds);

    // Query DB for matching username and reset password
    await pool.query(
      `UPDATE login_info SET employee_password = ? WHERE employee_username = ?;`,
      [encryptedPassword, username]
    );

    const [rows] = await pool.query(
      `SELECT * FROM login_info WHERE employee_username = ? AND employee_password = ?`,
      [username, encryptedPassword]
    );

    if (rows.length > 0) {
      // Reset successful, send user info back
      res.json({ success: true, user: rows[0] });
    } else {
      res.status(401).json({ success: false, message: "Can't change password" });
    }

  }catch(error){
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  confirmLogin,
  resetPassword
};

