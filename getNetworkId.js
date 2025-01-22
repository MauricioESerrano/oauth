const axios = require('axios');

const apiKey = '6aca7d649c068ec26b9b4062dbb51cdc06da49c2';
const orgId = '1568322';

axios.get(`https://api.meraki.com/api/v1/organizations/${orgId}/networks`, {
  headers: {
    'X-Cisco-Meraki-API-Key': apiKey
  }
})
.then(response => {
  console.log('Networks:', response.data);
})
.catch(error => {
  console.log('Error:', error.response ? error.response.data : error.message);
});
