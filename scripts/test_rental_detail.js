const axios = require('axios');

async function run() {
  try {
    const res = await axios.get('http://localhost:5000/api/v1/rentals/1');
    console.log('Rental Detail:', JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error('API Error:', e.message);
  }
}

run();
