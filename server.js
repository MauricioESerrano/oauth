require("dotenv").config();

const express = require("express");
const { auth, requiresAuth } = require("express-openid-connect");
const axios = require("axios");
const fs = require("fs");
const https = require("https");
const session = require("express-session");
const winston = require("winston");

// Set up logger
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

const PRIVATE_IP = "192.168.128.9";
const PUBLIC_IP = "137.110.115.26";

// false == production, true == local
const isLocal = false;
const protocol = isLocal ? "http" : "https";


// const localBaseURL = `${protocol}://${PUBLIC_IP}:${PORT}`;
// Callback URL for handling Auth0 responses
// const callbackURL = `${protocol}://${PUBLIC_IP}:${PORT}/callback`;

const localBaseURL = "https://qi-nuc-5102.ucsd.edu:3000";
const callbackURL = "https://qi-nuc-5102.ucsd.edu:3000/callback";




logger.info("Initializing application");

// Set up session middleware (used to store Meraki GET parameters)
// Ensure that SESSION_SECRET is defined in your .env
if (!process.env.SESSION_SECRET) {
  logger.error("SESSION_SECRET is not defined in .env!");
}
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
  })
);

// Debug middleware: Log session details (remove after debugging)
app.use((req, res, next) => {
  logger.info("Session data:", req.session);
  next();
});

// Middleware to enforce HTTPS redirection (production only)
app.use((req, res, next) => {
  if (!req.secure && !isLocal) {
    logger.info("Redirecting to HTTPS:", req.headers.host + req.url);
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// AUTH0 settings (make sure your Auth0 dashboard callback matches this URL)
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

// Debug middleware to log incoming query parameters (especially on initial splash page load)
app.use((req, res, next) => {
  logger.info("Incoming request query:", req.query);
  next();
});

// Root route: Captures Meraki splash GET parameters and shows the splash page.
app.get("/", (req, res) => {
  // Capture GET parameters sent by Meraki (if any) and store in session
  const { base_grant_url, user_continue_url, node_mac, client_ip, client_mac } = req.query;
  if (base_grant_url && user_continue_url) {
    // req.session.merakiParams = { base_grant_url, user_continue_url, node_mac, client_ip, client_mac };
    req.session.merakiParams = { base_grant_url, user_continue_url};
    logger.info("Stored Meraki parameters in session:", req.session.merakiParams);
  } else {
    logger.info("No Meraki parameters found in query.");
  }

  // Display splash page based on authentication status
  if (req.oidc && req.oidc.isAuthenticated()) {
    logger.info("User authenticated:", req.oidc.user);
    res.send(`
      <h1>Welcome ${req.oidc.user.name}</h1>
      <p>You are logged in.</p>
      <a href="/logout">Logout</a>
    `);
  } else {
    logger.info("User is not authenticated; showing login prompt.");
    res.send(`
      <h1>Welcome to WiFi Access</h1>
      <p>Please log in to gain access.</p>
      <a href="/login">Login</a>
    `);
  }
});

// /login route: Redirects the user to the Auth0 universal login page
app.get("/login", (req, res) => {
  logger.info("Login route accessed. Session before login:", req.session);
  res.oidc.login();
});

// /callback route: Handles Auth0 callback, updates Meraki client details, and redirects using Meraki splash parameters.
app.get(
  "/callback",
  (req, res, next) => {
    // Log the query and session data to check if state parameter exists
    logger.info("Callback query parameters:", req.query);
    logger.info("Session at callback start:", req.session);
    req.oidc.handleCallback(req, res, next);
  },
  async (req, res, next) => {
    logger.info("Callback route processing after handleCallback.");
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

      logger.info("MerakiParams = " + req.session.merakiParams);
      logger.info("merakiparams basegrantURL = " + req.session.merakiParams.base_grant_url);
      logger.info("MerakiParams user continueURL = " + req.session.merakiParams.user_continue_url);


      // If Meraki splash parameters were captured, redirect the user to grant URL.
      if (req.session.merakiParams && req.session.merakiParams.base_grant_url && req.session.merakiParams.user_continue_url) {
        const { base_grant_url, user_continue_url } = req.session.merakiParams;
        // Clear the stored parameters from session for security.
        req.session.merakiParams = null;
        // Build redirect URL.
        const redirectURL = `${base_grant_url}?continue_url=${encodeURIComponent(user_continue_url)}`;
        logger.info("Redirecting user to Meraki grant URL:", redirectURL);
        return res.redirect(redirectURL);
      } else {
        logger.info("No Meraki parameters in session. Redirecting to splash page.");
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
  key: fs.readFileSync("/etc/ssl/private/privkey1.pem"),
  cert: fs.readFileSync("/etc/ssl/private/fullchain1.pem")
};
logger.info("SSL certificates loaded successfully.");

// Start HTTPS server (listening on all interfaces).
https.createServer(sslOptions, app).listen(PORT, "0.0.0.0", () => {
  console.log(`Public Facing (Public) at: ${protocol}://${PUBLIC_IP}:${PORT}`);
  console.log('updated');
});

// Note: Ensure router forwards port 3000 to your device and that any firewalls allow traffic on port 3000.
