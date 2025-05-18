// backend/server.js
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (CSS, HTML, etc.)
app.use(express.static(path.join(__dirname)));
// Route '/' to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'electromart'
});

db.connect(err => {
  if (err) {
    console.error('Database connection failed:', err.stack);
    return;
  }
  console.log('Connected to database.');
});

const userCarts = {}; // In-memory user carts (demo purpose only)

// PRODUCTS
app.get('/api/products', (req, res) => {
  const categoryId = req.query.category;
  const baseQuery = `
    SELECT p.ProductID as id, p.Name as name, p.Description as description, p.Price as price
    FROM product p
    ${categoryId ? 'JOIN category_product cp ON p.ProductID = cp.ProductID' : ''}
    ${categoryId ? 'WHERE cp.CategoryID = ?' : ''}
  `;
  db.query(baseQuery, categoryId ? [categoryId] : [], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// CATEGORIES
app.get('/api/categories', (req, res) => {
  db.query('SELECT CategoryID as id, Name as name FROM category', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// BRANDS
app.get('/api/brands', (req, res) => {
  db.query('SELECT BrandID as id, Name, Description FROM brand', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// REVIEWS
app.get('/api/reviews/:productId', (req, res) => {
  db.query('SELECT Rating, Comment, ReviewDate FROM reviews WHERE ProductID = ?', [req.params.productId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/reviews', (req, res) => {
  const { productId, rating, comment } = req.body;
  const userId = 1; // Placeholder user
  db.query('INSERT INTO reviews (UserID, ProductID, Rating, Comment, ReviewDate) VALUES (?, ?, ?, ?, NOW())',
    [userId, productId, rating, comment],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

// SHIPPING METHODS
app.get('/api/shipping-methods', (req, res) => {
  db.query('SELECT ShippingMethodID as id, Name, Cost, Description FROM shippingmethods', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// COUPONS
app.get('/api/coupons/:code', (req, res) => {
  const code = req.params.code;
  const today = new Date().toISOString().split('T')[0];
  db.query(
    'SELECT * FROM coupons WHERE Code = ? AND Start_Date <= ? AND End_Date >= ? AND Usage_Limit > Times_Used',
    [code, today, today],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) return res.json({ valid: false });
      const coupon = results[0];
      res.json({ valid: true, id: coupon.Coupons_ID, discount: coupon.Discount_Value, code });
    }
  );
});

// CART
app.post('/api/cart/add', (req, res) => {
  const { userId, productId, quantity } = req.body;
  if (!userCarts[userId]) userCarts[userId] = [];
  db.query('SELECT Name, Price FROM product WHERE ProductID = ?', [productId], (err, results) => {
    if (err || results.length === 0) return res.status(500).json({ error: 'Product not found.' });
    const product = results[0];
    const cart = userCarts[userId];
    const existing = cart.find(item => item.productId === productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({ productId, name: product.Name, price: product.Price, quantity });
    }
    res.json({ success: true });
  });
});

app.get('/api/cart', (req, res) => {
  const userId = parseInt(req.query.userId);
  const cart = userCarts[userId] || [];
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  res.json({ totalQuantity, items: cart });
});

// ORDER
app.post('/api/order', async (req, res) => {
  const { address1, address2, city, postal, country, couponCode, shippingMethodId, userId } = req.body;
  const cart = userCarts[userId] || [];
  if (!cart.length) return res.status(400).json({ error: 'Cart is empty.' });

  try {
    const couponId = await new Promise(resolve => {
      if (!couponCode) return resolve(null);
      const today = new Date().toISOString().split('T')[0];
      db.query('SELECT * FROM coupons WHERE Code = ? AND Start_Date <= ? AND End_Date >= ? AND Usage_Limit > Times_Used',
        [couponCode, today, today], (err, results) => {
          if (err || results.length === 0) return resolve(null);
          resolve(results[0].Coupons_ID);
        });
    });

    await new Promise((resolve, reject) => {
      db.query('INSERT INTO addresses (UserID, Address_line1, Address_line2, City, Postal_code, Country) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, address1, address2, city, postal, country], err => err ? reject(err) : resolve());
    });

    const shippingCost = await new Promise((resolve, reject) => {
      db.query('SELECT Cost FROM shippingmethods WHERE ShippingMethodID = ?', [shippingMethodId], (err, result) => {
        if (err || result.length === 0) return reject(err);
        resolve(parseFloat(result[0].Cost)); // FIX: Ensure number
      });
    });

    const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discountAmount = couponId ? await new Promise(resolve => {
      db.query('SELECT Discount_Value FROM coupons WHERE Coupons_ID = ?', [couponId], (err, results) => {
        if (err || results.length === 0) return resolve(0);
        resolve(parseFloat(results[0].Discount_Value));
      });
    }) : 0;

    const finalAmount = parseFloat(totalAmount) + parseFloat(shippingCost) - parseFloat(discountAmount);
    console.log('Order Summary:', { totalAmount, shippingCost, discountAmount, finalAmount });

    const paymentResult = await new Promise((resolve, reject) => {
      db.query('INSERT INTO payment (MethodID, Amount, PaymentDate, Status) VALUES (?, ?, NOW(), ?)',
        [1, finalAmount, 'Pending'], (err, result) => err ? reject(err) : resolve(result));
    });
    const paymentId = paymentResult.insertId;

    const shipmentResult = await new Promise((resolve, reject) => {
      db.query('INSERT INTO shipments (ShippingMethodID, ShipmentStatus) VALUES (?, ?)',
        [shippingMethodId, 'Pending'], (err, result) => err ? reject(err) : resolve(result));
    });
    const shipmentId = shipmentResult.insertId;

    const orderResult = await new Promise((resolve, reject) => {
      db.query('INSERT INTO `order` (UserID, CouponsID, PaymentID, ShipmentID, OrderDate, Status) VALUES (?, ?, ?, ?, NOW(), ?)',
        [userId, couponId, paymentId, shipmentId, 'Pending'], (err, result) => err ? reject(err) : resolve(result));
    });
    const orderId = orderResult.insertId;

    const orderItems = cart.map(item => [orderId, item.productId, item.quantity]);
    await new Promise((resolve, reject) => {
      db.query('INSERT INTO orderitem (OrderID, ProductID, Quantity) VALUES ?', [orderItems], err => err ? reject(err) : resolve());
    });

    if (couponId) {
      db.query('UPDATE coupons SET Times_Used = Times_Used + 1 WHERE Coupons_ID = ?', [couponId]);
    }

    userCarts[userId] = [];
    res.json({ orderId });
  } catch (err) {
    console.error('Order processing error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// REGISTER
app.post('/api/register', async (req, res) => {
  const { username, password, email, firstName, lastName, phone } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  db.query('INSERT INTO user (UserName, Password, Email, FirstName, LastName, Phone) VALUES (?, ?, ?, ?, ?, ?)',
    [username, hashedPassword, email, firstName, lastName, phone],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, user: { id: result.insertId, username } });
    });
});

// LOGIN
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.query('SELECT * FROM user WHERE UserName = ?', [username], async (err, results) => {
    if (err || results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = results[0];
    const match = await bcrypt.compare(password, user.Password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ success: true, user: { id: user.UserID, username: user.UserName } });
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});