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

// Using a fully-qualified domain for production
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

// Root route: Captures Meraki splash GET parameters and shows the splash page.
app.get("/", (req, res) => {
  // Only update session if the query parameters are present.
  const { base_grant_url, user_continue_url } = req.query;
  if (base_grant_url && user_continue_url) {
    req.session.merakiParams = { base_grant_url, user_continue_url };
    logger.info("Stored Meraki parameters in session:", req.session.merakiParams);
  } else if (req.session.merakiParams) {
    logger.info("No new Meraki parameters found in query; using stored session values:", req.session.merakiParams);
  } else {
    logger.info("No Meraki parameters found in query and none stored in session.");
  }

  // If user is authenticated, check for Meraki parameters and redirect if available.
  if (req.oidc && req.oidc.isAuthenticated()) {
    if (req.session.merakiParams.base_grant_url && req.session.merakiParams.user_continue_url) {
      const base_grant_url = req.session.merakiParams.base_grant_url;
      const user_continue_url = req.session.merakiParams.user_continue_url;
      // Clear the stored parameters from session for security.
      req.session.merakiParams = null;
      // Build redirect URL.
      const redirectURL = `${base_grant_url}?continue_url=${encodeURIComponent(user_continue_url)}`;
      logger.info("Redirecting user to Meraki grant URL:", redirectURL);
      return res.redirect(redirectURL);
    }
  } else {
    // User is not authenticated: show login prompt.
    logger.info("User is not authenticated; showing login prompt.");
    return res.send(`
      <h1>Welcome to WiFi Access</h1>
      <p>Please log in to gain access.</p>
      <a href="/login">Login</a>
    `);
  }
});

// /login route: Redirects the user to the Auth0 universal login page.
app.get("/login", (req, res) => {
  logger.info("Login route accessed. Session before login:", req.session);
  res.oidc.login();
});

// /callback route: Handles Auth0 callback, updates Meraki client details, and redirects.
app.get(
  "/callback",
  (req, res, next) => {
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

      // Redirect to the root route where the Meraki redirect logic will occur.
      res.redirect("/");
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

https.createServer(sslOptions, app).listen(PORT, "0.0.0.0", () => {
  console.log(`Public Facing (Public) at: ${protocol}://${PUBLIC_IP}:${PORT}`);
  console.log("updated");
});
