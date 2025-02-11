require("dotenv").config();
const express = require("express");
const { auth, requiresAuth } = require("express-openid-connect");
const axios = require("axios");

const app = express();
const PORT = 3000;

// Auth0 Configuration
const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_CLIENT_SECRET,
  baseURL: "http://137.110.115.26:3000",
  clientID: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,  // Add clientSecret here
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  authorizationParams: {
    redirect_uri: "http://137.110.115.26:3000/callback",
    response_type: "code id_token",  // Request both code and id_token
    scope: "openid profile email",  // Ensure openid scope is included
  },
};

// Use Auth0 to manage authentication
app.use(auth(config));

// Public Route
app.get("/", (req, res) => {
  if (req.oidc.isAuthenticated()) {
    res.send(`
      <h1>Welcome ${req.oidc.user.name}</h1>
      <pre>${JSON.stringify(req.oidc.user, null, 2)}</pre>
      <a href="/logout">Logout</a>
    `);
  } else {
    res.send('<h1>Welcome</h1><a href="/login">Login</a>');
  }
});

// Redirect to Auth0 ULP
app.get("/login", (req, res) => {
  res.oidc.login();
});

// Callback route after successful login
app.get("/callback", async (req, res) => {
  // Log the received tokens to check if id_token is included
  console.log("Received Tokens:", req.oidc.tokens);

  const user = req.oidc.user;

  // Meraki API integration - Sending user data to Meraki
  try {
    const merakiOrgId = '1568322';
    const merakiNetworkId = 'L_686235993220612846';
    const merakiApiKey = '6aca7d649c068ec26b9b4062dbb51cdc06da49c2';

    const response = await axios.post(
      `https://api.meraki.com/api/v1/networks/${merakiNetworkId}/clients`, 
      {
        // User Information
        email: user.email, 
        name: user.name, 
        role: "user",
      },
      {
        headers: {
          "X-Cisco-Meraki-API-Key": merakiApiKey,
        },
      }
    );

    res.send('<h1>Logged in successfully and sent data to Meraki!</h1><a href="/">Home</a>');
  } catch (error) {
    console.error("Error sending data to Meraki:", error);
    res.send('<h1>Error occurred while sending data to Meraki!</h1><a href="/">Home</a>');
  }
});

// Protected route, only accessible if logged in
app.get("/profile", requiresAuth(), (req, res) => {
  res.send(`
    <h1>Profile</h1>
    <pre>${JSON.stringify(req.oidc.user, null, 2)}</pre>
    <a href="/">Home</a>
  `);
});

// Server Start
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Server running on http://137.110.115.26:3000`);
});



// ----------------------------------------------------------------------------------------------------
//                                            IPv4 Portion Implemented
// ----------------------------------------------------------------------------------------------------


// 10.204.96.141

// require("dotenv").config();
// const express = require("express");
// const { auth, requiresAuth } = require("express-openid-connect");
// const axios = require("axios");

// const app = express();
// const PORT = 3000;


// const getBaseUrl = () => {
//   if (process.env.ENV === "production") {
//     // public
//     return "http://your-public-ip:3000";
//   } else {
//     // local 
//     return "http://192.168.x.x:3000";
//   }
// };

// // Auth0 Configuration
// const config = {
//   authRequired: false,
//   auth0Logout: true,
//   secret: process.env.AUTH0_CLIENT_SECRET,
//   baseURL: getBaseUrl(),
//   clientID: process.env.AUTH0_CLIENT_ID,
//   issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
//   authorizationParams: {
//     redirect_uri: getBaseUrl() + "/callback",
//   },
// };

// // Use Auth0 to manage authentication
// app.use(auth(config));

// // Public Route
// app.get("/", (req, res) => {
//   if (req.oidc.isAuthenticated()) {
//     res.send(`
//       <h1>Welcome ${req.oidc.user.name}</h1>
//       <pre>${JSON.stringify(req.oidc.user, null, 2)}</pre>
//       <a href="/logout">Logout</a>
//     `);
//   } else {
//     res.send('<h1>Welcome</h1><a href="/login">Login</a>');
//   }
// });

// // Redirect to Auth0 ULP
// app.get("/login", (req, res) => {
//   res.oidc.login();
// });

// app.get("/callback", async (req, res) => {
//   const user = req.oidc.user;

//   // Meraki API integration - Sending user data to Meraki
//   try {
//     const merakiOrgId = '1568322';
//     const merakiNetworkId = 'L_686235993220612846';
//     const merakiApiKey = '6aca7d649c068ec26b9b4062dbb51cdc06da49c2';

//     const response = await axios.post(
//       `https://api.meraki.com/api/v1/networks/${merakiNetworkId}/clients`, 
//       {
//         // User Information
//         email: user.email, 
//         name: user.name, 
//         role: "user",
//       },
//       {
//         headers: {
//           "X-Cisco-Meraki-API-Key": merakiApiKey,
//         },
//       }
//     );

//     res.send('<h1>Logged in successfully and sent data to Meraki!</h1><a href="/">Home</a>');
//   } catch (error) {
//     console.error("Error sending data to Meraki:", error);
//     res.send('<h1>Error occurred while sending data to Meraki!</h1><a href="/">Home</a>');
//   }
// });

// app.get("/profile", requiresAuth(), (req, res) => {
//   res.send(`
//     <h1>Profile</h1>
//     <pre>${JSON.stringify(req.oidc.user, null, 2)}</pre>
//     <a href="/">Home</a>
//   `);
// });

// app.listen(PORT, "0.0.0.0", () => {
//   console.log(`Server running on ${getBaseUrl()}`);
// });
