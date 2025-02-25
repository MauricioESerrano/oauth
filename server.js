require("dotenv").config();

const express = require("express");
const { auth, requiresAuth } = require("express-openid-connect");
const axios = require("axios");
const https = require("https");
const fs = require("fs");
const app = express();

const PORT = 3000;

const PRIVATE_IP = "192.168.128.7";
const PUBLIC_IP = "137.110.115.26";

// Configure Auth0 settings
const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_CLIENT_SECRET,
  baseURL: `https://${PUBLIC_IP}:${PORT}`,
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  authorizationParams: {
    redirect_uri: `https://${PUBLIC_IP}:${PORT}/callback`,
  },
};

// Add Auth0 authentication middleware to all routes based on the configuration above
app.use(auth(config));

// Define the root route ("/")
// This route serves as the homepage where users see a welcome message
app.get("/", (req, res) => {
  // Check if the user is authenticated via Auth0
  if (req.oidc.isAuthenticated()) {
    // If authenticated, display a personalized welcome message with user details
    // "if it enters here, it means the user has successfully logged in"
    res.send(`
      <h1>Welcome ${req.oidc.user.name}</h1>
      <pre>${JSON.stringify(req.oidc.user, null, 2)}</pre>
      <a href="/logout">Logout</a>
    `);
  } else {
    // If not authenticated, show a generic welcome message with a login link
    // "else, it means the user is not logged in"
    res.send('<h1>Welcome</h1><a href="/login">Login</a>');
  }
});

// Define the /login route
// When this route is accessed, it triggers the login flow using Auth0
app.get("/login", (req, res) => res.oidc.login());

// Define the /callback route
// This route is used as the redirect URI after Auth0 completes the authentication
app.get("/callback", async (req, res) => {
  try {
    const merakiNetworkId = 'L_686235993220612846';

    // Make an HTTP POST request to the Meraki API to update client details
    await axios.post(
      `https://api.meraki.com/api/v1/networks/${merakiNetworkId}/clients`,
      {
        // Send the authenticated user's email, name, and role to the API
        email: req.oidc.user.email,
        name: req.oidc.user.name,
        role: "user",
      },
      {
        // Set the required headers for the Meraki API
        headers: {
          "X-Cisco-Meraki-API-Key": process.env.MERAKI_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    // If the POST request is successful, send a success message with a link to the home page
    res.send('<h1>Login & Meraki update successful!</h1><a href="/">Home</a>');
  } catch (error) {
    // If an error occurs during the API call, log the error and notify the user
    console.error("Meraki error:", error);
    res.send('<h1>Meraki update failed!</h1><a href="/">Home</a>');
  }
});

// TEMP: Define the /profile route, which requires the user to be authenticated
// TEMP: displays user information if/when authenticated
app.get("/profile", requiresAuth(), (req, res) => {
  res.send(`
    <h1>Profile</h1>
    <pre>${JSON.stringify(req.oidc.user, null, 2)}</pre>
    <a href="/">Home</a>
  `);
});

// Define SSL options by reading the SSL certificate and private key from file paths.
const sslOptions = {
  // to key.pem path
  // to crt.pem path
  key: fs.readFileSync("etc/ssl/privkey1.pem"),
  cert: fs.readFileSync("etc/ssl/fullchain1.pem"),
};

https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
  console.log(`Internal access: https://${PRIVATE_IP}:${PORT}`);
  console.log(`External auth flow: https://${PUBLIC_IP}:${PORT}`);
});
