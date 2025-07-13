const mysql = require("mysql2");
const dotenv = require("dotenv");
const express = require("express");
dotenv.config({ path: '../.env' });

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
}).promise()

const confirmLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Query DB for matching username and password
    const [rows] = await pool.query(
      `SELECT * FROM login_info WHERE employee_username = ? AND employee_password = ?`,
      [username, password]
    );

    if (rows.length > 0) {
      // Login successful, send user info back
      res.json({ success: true, user: rows[0] });
    } else {
      res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  confirmLogin
};

