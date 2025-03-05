require("dotenv").config();

const express = require("express");
const { auth, requiresAuth } = require("express-openid-connect");
const axios = require("axios");
const fs = require("fs");
const https = require("https");

const app = express();
const PORT = 3000;

const PRIVATE_IP = "192.168.128.9";   // For splash page access on WiFi
const PUBLIC_IP = "137.110.115.26";     // For external OAuth callbacks

// Toggle environment (false means production, true would be local testing)
const isLocal = false;
const protocol = isLocal ? "http" : "https";

// The base URL for serving your splash page (private IP) and the callback URL (public IP)
const localBaseURL = `${protocol}://${PRIVATE_IP}:${PORT}`;
const callbackURL = `${protocol}://${PUBLIC_IP}:${PORT}/callback`;

console.log("Initializing");

// Configure Auth0 settings.
// Note: baseURL is the private IP (for WiFi users), while the callback URI is the public IP.
const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_CLIENT_SECRET,
  baseURL: localBaseURL,
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  authorizationParams: {
    redirect_uri: callbackURL,
  },
};

console.log("Auth0 configuration initialized:", config);

// Middleware to enforce HTTPS redirection in production only.
app.use((req, res, next) => {
  if (!req.secure && !isLocal) {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// Add Auth0 authentication middleware.
app.use(auth(config));
console.log("Auth0 applied.");

// Define the root route ("/") as the splash page.
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

// Define the /login route.
app.get("/login", (req, res) => {
  console.log("Login route accessed.");
  res.oidc.login();
});

// The /callback route validates the authentication callback and runs custom logic.
app.get(
  "/callback",
  (req, res, next) => {
    req.oidc.handleCallback(req, res, next);
  },
  async (req, res) => {
    console.log("Callback route accessed.");
    try {
      const merakiNetworkId = 'L_686235993220612846';
      console.log("Updating Meraki client details for:", req.oidc.user.email);

      // POST updated client details to the Meraki API.
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

// Define the /profile route (requires authentication).
app.get("/profile", requiresAuth(), (req, res) => {
  console.log("Profile route accessed for user:", req.oidc.user.email);
  res.send(`
    <h1>Profile</h1>
    <pre>${JSON.stringify(req.oidc.user, null, 2)}</pre>
    <a href="/">Home</a>
  `);
});

// Production: Load SSL certificates and start the HTTPS server.
console.log("Loading SSL certificates");
const sslOptions = {
  key: fs.readFileSync("/etc/ssl/private/privkey1.pem"),
  cert: fs.readFileSync("/etc/ssl/private/fullchain1.pem"),
};
console.log("SSL certificates loaded successfully.");

// Start HTTPS server (listening on all interfaces).
https.createServer(sslOptions, app).listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at: https://${PUBLIC_IP}:${PORT}`);
  console.log(`Splash page (WiFi) access via: https://${PRIVATE_IP}:${PORT}`);
});
