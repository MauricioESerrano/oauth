require("dotenv").config();

const express = require("express");
const { auth, requiresAuth } = require("express-openid-connect");
const axios = require("axios");
const https = require("https");
const fs = require("fs");
const app = express();

const PORT = 3000;

// const PRIVATE_IP = "192.168.128.7";
const PRIVATE_IP = "100.80.225.61";
const PUBLIC_IP = "137.110.115.26";

console.log("Initializing");

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

console.log("Auth0 configuration initialized:", config);

// Add Auth0 authentication middleware to all routes based on the configuration above
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

// Define the /callback route
app.get("/callback", async (req, res) => {
  console.log("Callback route accessed.");
  try {
    const merakiNetworkId = 'L_686235993220612846';
    console.log("Updating Meraki client details for:", req.oidc.user.email);

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
});

// TEMP: Define the /profile route
app.get("/profile", requiresAuth(), (req, res) => {
  console.log("Profile route accessed for user:", req.oidc.user.email);
  res.send(`
    <h1>Profile</h1>
    <pre>${JSON.stringify(req.oidc.user, null, 2)}</pre>
    <a href="/">Home</a>
  `);
});

// Define SSL options
console.log("Loading SSL certificates...");
const sslOptions = {
  key: fs.readFileSync("etc/ssl/privkey1.pem"),
  cert: fs.readFileSync("etc/ssl/fullchain1.pem"),
};
console.log("SSL certificates loaded successfully.");

// Public Run w/ HTTPS
https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at: https://qi-nuc-5102.ucsd.edu:${PORT}`);
  // console.log(`Internal access: https://${PRIVATE_IP}:${PORT}`);
  // console.log(`External auth flow: https://${PUBLIC_IP}:${PORT}`);
});



// Local Run
// app.listen(PORT, '0.0.0.0', () => {
//   console.log(`Internal access: http://${PRIVATE_IP}:${PORT}`);
//   console.log(`External auth flow: http://${PUBLIC_IP}:${PORT}`);
// });



// https://qi-nuc-5102.ucsd.edu:3000/

// ppt draw architecture. important steps. similar to whiteboard. flow. including (setup diagram)
// call flow user -> auth -> etc. 
// software description. software flow

// Check google google cloud debug (logging) 