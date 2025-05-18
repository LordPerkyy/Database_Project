# Database_Project

Welcome to ElectroMart, an e-commerce application for buying electronics online. This project consists of a Node.js backend, a MySQL database, and a frontend built using HTML, CSS (Bootstrap), and vanilla JavaScript.

# Features

Product browsing by category

Add items to cart

Checkout with address, shipping, and coupon support

User registration and login with hashed passwords

Order and payment tracking

Review system for products

# Installation and setup

## Prerequisites

Node.js (v18 or newer)

MySQL or MariaDB (running locally)

npm (comes with Node.js)

## 1. Clone repository / download files

git clone https://github.com/LordPerkyy/Database_Project.git
cd Database_Project

## 2. Install dependencies

npm install 

## 3. Setup MySQL Database

Ensure MySQL is running locally.

Open your preferred MySQL client (e.g., phpMyAdmin).

Create a database named electromart.

Import the provided sql file into the database.

## 4. Update Credentials (Optional)

Ensure your server.js has the correct MySQL credentials:

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root', // your MySQL username
  password: '', // your MySQL password
  database: 'electromart'
});

## 5. Run the Server (from cmd)

node server.js

## 6. Open the App

Open index.html in a browser (or navigate to http://localhost:3000 if served by Express)


