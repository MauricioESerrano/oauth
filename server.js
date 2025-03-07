require("dotenv").config();

const express = require("express");
const { auth, requiresAuth } = require("express-openid-connect");
const axios = require("axios");
const fs = require("fs");
const https = require("https");
const session = require("express-session");
const winston = require("winston");

// =====================================================================================
//                               Logger Initialization
// =====================================================================================
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

// Legacy
const PRIVATE_IP = "192.168.128.9";
const PUBLIC_IP = "137.110.115.26";

// Local vs. Production
const isLocal = false;
const protocol = isLocal ? "http" : "https";

const localBaseURL = "https://qi-nuc-5102.ucsd.edu:3000";
const callbackURL = "https://qi-nuc-5102.ucsd.edu:3000/callback";


// Set up session middleware (used to store Meraki GET parameters)
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
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// =====================================================================================
//                         Auth0 Settings (Initalizer) initializer
// =====================================================================================
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

// Add Auth0 authentication middleware.
app.use(auth(config));


// =====================================================================================
//                           General Logic for Handling User
// =====================================================================================
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
    if (req.session.merakiParams && req.session.merakiParams.base_grant_url && req.session.merakiParams.user_continue_url) {
      const base_grant_url = req.session.merakiParams.base_grant_url;
      const user_continue_url = req.session.merakiParams.user_continue_url;
      // Clear the stored parameters from session for security.
      req.session.merakiParams = null;
      // Build redirect URL.
      const redirectURL = `${base_grant_url}?continue_url=${encodeURIComponent(user_continue_url)}`;
      logger.info("Redirecting user to Meraki grant URL:", redirectURL);
      return res.redirect(redirectURL);
    } else {
      // If authenticated but no Meraki parameters, show welcome page.
      logger.info("User is authenticated but no Meraki parameters available.");
      return res.send(`
        <h1>Welcome ${req.oidc.user.name}</h1>
        <p>In truth you should never be here because if you are then that means that you authenticated but are not on the wifi still.</p>
        <a href="/logout">Restart</a>
      `);
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


// =====================================================================================
//                            Login Button (Redirects to oAuth)
// =====================================================================================

// /login route: Redirects the user to the Auth0 universal login page.
app.get("/login", (req, res) => {
  res.oidc.login();
});

// =====================================================================================
//                                    Meraki Callback
// =====================================================================================
// /callback route: Handles Auth0 callback, updates Meraki client with user details

app.get("/callback",(req, res, next) => {
    req.oidc.handleCallback(req, res, next);
  },
  async (req, res, next) => {
    try {
      const user = req.oidc.user;
      const merakiNetworkId = "L_686235993220612846";

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

    } catch (error) {
      logger.error("Meraki update error: " + error.message);
      next(error);
    }
  }
);


// =====================================================================================
//                                     Universal Error
// =====================================================================================


// Global error handling middleware: Logs error details and sends a generic error message.
app.use((err, req, res, next) => {
  logger.error("Global error handler caught an error: " + err.message);
  res.status(500).send("Internal Server Error");
});



// =====================================================================================
//                       SSL Certificate Loading && Server creater 
// =====================================================================================


// Production: Load SSL certificates and start the HTTPS server.
logger.info("Loading SSL certificates");
const sslOptions = {
  key: fs.readFileSync("/etc/ssl/private/privkey1.pem"),
  cert: fs.readFileSync("/etc/ssl/private/fullchain1.pem")
};
logger.info("SSL certificates loaded successfully.");

https.createServer(sslOptions, app).listen(PORT, "0.0.0.0", () => {
  console.log(`Public Facing (Public) at: ${protocol}://qi-nuc-5102.ucsd.edu:${PORT}`);
  console.log("update 0.0");
});
