require("dotenv").config();

const express = require("express");
const { auth, requiresAuth } = require("express-openid-connect");
const axios = require("axios");
const fs = require("fs");
// const https = require("https"); // Not used for local, want HTTP

const app = express();
const PORT = 3000;

// NUC
const PRIVATE_IP = "192.168.128.9";

// Local
// const PRIVATE_IP = "100.80.225.61";



const PUBLIC_IP = "137.110.115.26";

// Choose protocol based on environment (HTTP for local, HTTPS for production)
// const protocol = isLocal ? "http" : "https";
const protocol = "https";

console.log("Initializing");

// Configure Auth0 settings using the appropriate protocol
const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_CLIENT_SECRET,
  baseURL: `${protocol}://${PRIVATE_IP}:${PORT}`, // Use HTTP if local, HTTPS if production
  clientID: process.env.AUTH0_CLIENT_ID,
  // Auth0 domain is always HTTPS
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  authorizationParams: {
    redirect_uri: `${protocol}://${PRIVATE_IP}:${PORT}/callback`, // Match protocol for callback
  },
};

console.log("Auth0 configuration initialized:", config);

// Middleware to enforce HTTPS redirection in production only
app.use((req, res, next) => {
  if (!req.secure && !isLocal) {
    // In production, redirect HTTP to HTTPS
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// Add Auth0 authentication middleware
app.use(auth(config));
console.log("Auth0 applied.");

// Define the root route ("/")
app.get("/", (req, res) => {
  console.log("Root route accessed.");
  if (req.oidc.isAuthenticated()) {
    console.log("User is authenticated:", req.oidc.user);
    res.send(`
      <h1>Welcome ${req.oidc.user.name}</h1>
      <pre>${JSON.stringify(req.oidc.user, null, 2)}</pre>
      <a href="/logout">Logout</a>
    `);
  } else {
    console.log("User is not authenticated.");
    res.send('<h1>Welcome</h1><a href="/login">Login</a>');
  }
});

// Define the /login route
app.get("/login", (req, res) => {
  console.log("Login route accessed.");
  res.oidc.login();
});

// Modified /callback route:
// The first middleware calls req.oidc.handleCallback() to validate state, tokens, etc.
// Then the async function runs your custom logic.
app.get(
  "/callback",
  (req, res, next) => {
    // Handle Auth0 callback validation (state, tokens, etc.)
    req.oidc.handleCallback(req, res, next);
  },
  async (req, res) => {
    console.log("Callback route accessed.");
    try {
      const merakiNetworkId = 'L_686235993220612846';
      console.log("Updating Meraki client details for:", req.oidc.user.email);

      // POST updated client details to Meraki API
      await axios.post(
        `https://api.meraki.com/api/v1/networks/${merakiNetworkId}/clients`,
        {
          email: req.oidc.user.email,
          name: req.oidc.user.name,
          role: "user",
        },
        {
          headers: {
            "X-Cisco-Meraki-API-Key": process.env.MERAKI_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("Meraki update successful.");
      res.send('<h1>Login & Meraki update successful!</h1><a href="/">Home</a>');
    } catch (error) {
      console.error("Meraki error:", error);
      res.send('<h1>Meraki update failed!</h1><a href="/">Home</a>');
    }
  }
);

// Define the /profile route (requires authentication)
app.get("/profile", requiresAuth(), (req, res) => {
  console.log("Profile route accessed for user:", req.oidc.user.email);
  res.send(`
    <h1>Profile</h1>
    <pre>${JSON.stringify(req.oidc.user, null, 2)}</pre>
    <a href="/">Home</a>
  `);
});

// For local development, we are using HTTP so we start the server normally.
// (In production, we want to uncomment the HTTPS server section below and load SSL certificates.)

// app.listen(PORT, '0.0.0.0', () => {
//   console.log(`Internal access: ${protocol}://${PRIVATE_IP}:${PORT}`);
//   console.log(`External auth flow: ${protocol}://${PUBLIC_IP}:${PORT}`);
// });


// following code for production HTTPS deployment w/ SSL certificates.

// Load SSL certificates
console.log("Loading SSL certificates");
const sslOptions = {
  key: fs.readFileSync("/privkey1.pem"),
  cert: fs.readFileSync("/fullchain1.pem"),
};
console.log("SSL certificates loaded successfully.");

// Start HTTPS server
https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
// Adjust the URLs accordingly in production.
  console.log(`Server running at: https://qi-nuc-5102.ucsd.edu:${PORT}`);
  console.log(`Internal access: https://${PRIVATE_IP}:${PORT}`);
  console.log(`External auth flow: https://${PUBLIC_IP}:${PORT}`);
});
