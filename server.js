require("dotenv").config();

const express = require("express");
const { auth, requiresAuth } = require("express-openid-connect");
const axios = require("axios");
const fs = require("fs");
const https = require("https");
const session = require("express-session");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "Logs.log" })
  ]
});

const app = express();
const PORT = 3000;

// MY APARTMENT network settings
const PRIVATE_IP = "192.168.1.75";
const PUBLIC_IP = "68.252.125.3";

//false == production, true == local
const isLocal = false;
const protocol = isLocal ? "http" : "https";

// The base URL served on private
const localBaseURL = `${protocol}://${PRIVATE_IP}:${PORT}`;
// callBack URL for handling callbacks
const callbackURL = `${protocol}://${PUBLIC_IP}:${PORT}/callback`;

logger.info("Initializing application");

// Set up session middleware (used to store Meraki GET parameters)
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
  })
);

// Middleware (this forces HTTPS redirection [production only])
app.use((req, res, next) => {
  if (!req.secure && !isLocal) {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// AUTH0 settings
// Note: baseURL is the private IP (wifi users), while the callback URI is the public IP
// defined above the values.
const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_CLIENT_SECRET,
  baseURL: localBaseURL,
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  authorizationParams: {
    redirect_uri: callbackURL
  }
};

logger.info("Auth0 configuration initialized:", config);

// Add Auth0 authentication middleware.
app.use(auth(config));
logger.info("Auth0 applied.");

// Root route: Captures Meraki splash GET parameters and shows the splash page.
app.get("/", (req, res) => {
  // Capture GET parameters sent by Meraki (if any) and store in session
  const { base_grant_url, user_continue_url, node_mac, client_ip, client_mac } = req.query;
  if (base_grant_url && user_continue_url) {
    req.session.merakiParams = { base_grant_url, user_continue_url, node_mac, client_ip, client_mac };
    logger.info("Stored Meraki parameters in session:", req.session.merakiParams);
  }

  // Display splash page based on authentication status
  if (req.oidc.isAuthenticated()) {
    logger.info("User has NOW been auth-ed (after going through authentication process) OR pre-authenticated when they log in (means they've been through this recently. Check meraki for \"repeat every...\"", req.oidc.user);
    res.send(`
      <h1>Welcome ${req.oidc.user.name}</h1>
      <p>You are logged in.</p>
      <a href="/logout">Logout</a>
    `);
  } else {
    logger.info("User is NOT pre-authed, must authenticate.");
    res.send(`
      <h1>Welcome to WiFi Access</h1>
      <p>Please log in to gain access.</p>
      <a href="/login">Login</a>
    `);
  }
});

// /login route: Redirects the user to the Auth0 universal login page
app.get("/login", (req, res) => {
  logger.info("Login route accessed.");
  res.oidc.login();
});

// /callback route: Handles Auth0 callback, updates Meraki client details, and redirects using Meraki splash parameters.
app.get(
  "/callback",
  (req, res, next) => {
    req.oidc.handleCallback(req, res, next);
  },
  async (req, res, next) => {
    logger.info("Callback route accessed.");
    try {
      const user = req.oidc.user;
      const merakiNetworkId = "L_686235993220612846";
      logger.info("Updating Meraki client details for:", user.email);

      // POST updated client details to the Meraki API.
      await axios.post(
        `https://api.meraki.com/api/v1/networks/${merakiNetworkId}/clients`,
        {
          email: user.email,
          name: user.name,
          role: "user"
        },
        {
          headers: {
            "X-Cisco-Meraki-API-Key": process.env.MERAKI_API_KEY,
            "Content-Type": "application/json"
          }
        }
      );
      logger.info("Meraki update successful.");

      // If Meraki splash parameters were captured, redirect the user to grant URL.
      if (req.session.merakiParams && req.session.merakiParams.base_grant_url && req.session.merakiParams.user_continue_url) {
        const { base_grant_url, user_continue_url } = req.session.merakiParams;
        // Clear the stored parameters from session for security.
        req.session.merakiParams = null;
        // Redirect user to the assembled Meraki grant URL.
        const redirectURL = `${base_grant_url}?continue_url=${encodeURIComponent(user_continue_url)}`;
        logger.info("Redirecting user to Meraki grant URL:", redirectURL);
        return res.redirect(redirectURL);
      } else {
        // Fallback: redirect to splash page if no parameters are present.
        return res.redirect("/");
      }
    } catch (error) {
      logger.error("Meraki update error: " + error.message);
      next(error);
    }
  }
);

// /profile route: Requires authentication and displays user profile.
app.get("/profile", requiresAuth(), (req, res) => {
  logger.info("Profile route accessed for user:", req.oidc.user.email);
  res.send(`
    <h1>Profile</h1>
    <pre>${JSON.stringify(req.oidc.user, null, 2)}</pre>
    <a href="/">Home</a>
  `);
});

// Global error handling middleware: Logs error details and sends a generic error message.
app.use((err, req, res, next) => {
  logger.error("Global error handler caught an error: " + err.message);
  res.status(500).send("Internal Server Error");
});

// Production: Load SSL certificates and start the HTTPS server.
logger.info("Loading SSL certificates");
const sslOptions = {
  key: fs.readFileSync("C:/Users/maury/Desktop/Auth/certs/privkey1.pem"),
  cert: fs.readFileSync("C:/Users/maury/Desktop/Auth/certs/fullchain1.pem")
};
logger.info("SSL certificates loaded successfully.");

// Start HTTPS server (listening on all interfaces).
https.createServer(sslOptions, app).listen(PORT, "0.0.0.0", () => {
  console.log(`Public Facing (Public) at: https://${PUBLIC_IP}:${PORT}`);
  console.log(`Splash page (Private) access via: https://${PRIVATE_IP}:${PORT}`);
});

// Router Firewall Allow for port forwarding to device running the code.
// Device firewall must allow inbound traffic on port 3000.
