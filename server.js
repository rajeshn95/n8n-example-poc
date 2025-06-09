// server.js
const express = require("express");
const jwt = require("jsonwebtoken");
const path = require("path");
const app = express();
require("dotenv").config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── CONFIG ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

// ─── IN-MEMORY “DATABASE” ────────────────────────────────────────────────

// 1. Users (for demo purposes; passwords are plain-text here)
//    In production → use a real DB + bcrypt for passwords.
const users = [
  { id: 1, username: "alice", password: "password123" },
  { id: 2, username: "bob", password: "secret456" },
];

// 2. Approval requests (each has id, itemName, status)
//    status: 'pending' | 'approved' | 'rejected'
let requests = [];
let nextRequestId = 1;

// ─── HELPERS / MIDDLEWARE ────────────────────────────────────────────────

// Middleware to verify JWT sent in “Authorization: Bearer <token>”
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization || req.query.token;
  // Allow passing token via query param “?token=…” when serving the HTML page.

  if (!authHeader) {
    return res.status(401).json({ error: "Missing Authorization token" });
  }

  // If it came from header, it looks like “Bearer <token>”
  let token = authHeader;
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    // Attach user info to request
    req.user = { id: payload.id, username: payload.username };
    next();
  });
}

// ─── ROUTES ───────────────────────────────────────────────────────────────

// 1) Health check (no auth needed)
app.get("/health", (req, res) => {
  return res.json({ status: "OK" });
});

// 2) Login → returns a JWT if credentials match
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const foundUser = users.find(
    (u) => u.username === username && u.password === password
  );
  if (!foundUser) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  console.log("env", process.env.JWT_SECRET);
  // Create a token payload
  const payload = { id: foundUser.id, username: foundUser.username };
  // Sign for 1 hour
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });

  return res.json({ token });
});

// 3) Create a new “approval request”
//    → Must send header Authorization: Bearer <token>
app.post("/requests", authenticateJWT, (req, res) => {
  const { itemName } = req.body;
  if (!itemName) {
    return res.status(400).json({ error: 'Field "itemName" is required.' });
  }
  const newReq = {
    id: nextRequestId++,
    itemName,
    status: "pending",
    requestedBy: req.user.username,
  };
  requests.push(newReq);
  return res.status(201).json({ request: newReq });
});

// 4) List all requests (protected)
app.get("/requests", authenticateJWT, (req, res) => {
  return res.json({ requests });
});

// 5) Get a single request by ID (protected)
app.get("/requests/:id", authenticateJWT, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const reqItem = requests.find((r) => r.id === id);
  if (!reqItem) {
    return res.status(404).json({ error: "Request not found" });
  }
  return res.json({ request: reqItem });
});

// 6) Approve a request (protected)
app.post("/requests/:id/approve", authenticateJWT, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const reqItem = requests.find((r) => r.id === id);
  if (!reqItem) {
    return res.status(404).json({ error: "Request not found" });
  }
  if (reqItem.status !== "pending") {
    return res.status(400).json({
      error: `Cannot approve; current status is "${reqItem.status}".`,
    });
  }
  reqItem.status = "approved";
  return res.json({ request: reqItem });
});

// 7) Reject a request (protected)
app.post("/requests/:id/reject", authenticateJWT, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const reqItem = requests.find((r) => r.id === id);
  if (!reqItem) {
    return res.status(404).json({ error: "Request not found" });
  }
  if (reqItem.status !== "pending") {
    return res
      .status(400)
      .json({ error: `Cannot reject; current status is "${reqItem.status}".` });
  }
  reqItem.status = "rejected";
  return res.json({ request: reqItem });
});

// 8) SERVE THE “Approval Page” HTML
//
//    This endpoint expects two query parameters:
//
//      • requestId = the numeric ID of the approval request
//      • token     = a valid JWT (so you can call the approve/reject APIs from the page)
//
//    Example URL (after you log in / create a request):
//      http://localhost:3000/approval?requestId=1&token=<JWT>
//
//    If both are valid, it returns an HTML page with Approve/Reject buttons that use “fetch”
//    to POST back to the server with the same token in the Authorization header.
app.get("/approval", (req, res) => {
  const token = req.query.token;
  const requestId = parseInt(req.query.requestId, 10);

  if (!token) {
    return res
      .status(400)
      .send("❌ Missing token. You must pass `?token=<your_jwt>`");
  }
  if (isNaN(requestId)) {
    return res
      .status(400)
      .send("❌ Missing or invalid requestId. Pass `?requestId=<number>`");
  }

  // Verify token
  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      return res
        .status(401)
        .send("❌ Invalid or expired token. Please log in again.");
    }

    // Find the request
    const reqItem = requests.find((r) => r.id === requestId);
    if (!reqItem) {
      return res.status(404).send("❌ Approval request not found.");
    }

    // Serve a simple HTML page (inline) with Approve / Reject buttons
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Approve or Reject Request #${reqItem.id}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 2em;
            }
            .container {
              max-width: 500px;
              margin: 0 auto;
              text-align: center;
            }
            button {
              padding: 0.6em 1.2em;
              font-size: 1rem;
              margin: 0.5em;
              border: none;
              border-radius: 4px;
              cursor: pointer;
            }
            .approve {
              background-color: #28a745;
              color: white;
            }
            .reject {
              background-color: #dc3545;
              color: white;
            }
            .status {
              margin-top: 1em;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Request #${reqItem.id}</h1>
            <p><strong>Item:</strong> ${reqItem.itemName}</p>
            <p><strong>Current Status:</strong> <span id="status-text">${
              reqItem.status
            }</span></p>
            ${
              reqItem.status !== "pending"
                ? "<p>This request has already been " + reqItem.status + ".</p>"
                : `
            <button class="approve" id="btn-approve">Approve</button>
            <button class="reject" id="btn-reject">Reject</button>
            `
            }
            <p class="status" id="message"></p>
          </div>

          <script>
            const token = "${token}";
            const requestId = ${reqItem.id};

            async function doAction(action) {
              const url = \`/requests/\${requestId}/\${action}\`;
              try {
                const res = await fetch(url, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                  }
                });
                const data = await res.json();
                if (!res.ok) {
                  throw new Error(data.error || 'Unknown error');
                }
                document.getElementById('status-text').innerText = data.request.status;
                document.getElementById('message').innerText = 
                  action === 'approve'
                    ? '✅ Request approved!'
                    : '❌ Request rejected!';
                
                // Disable buttons after action
                document.getElementById('btn-approve')?.setAttribute('disabled','true');
                document.getElementById('btn-reject')?.setAttribute('disabled','true');
              } catch (err) {
                document.getElementById('message').innerText = 'Error: ' + err.message;
              }
            }

            document.getElementById('btn-approve')?.addEventListener('click', () => doAction('approve'));
            document.getElementById('btn-reject')?.addEventListener('click', () => doAction('reject'));
          </script>
        </body>
      </html>
    `);
  });
});

// ─── START SERVER ─────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`👉 Server running on http://localhost:${PORT}`);
});
