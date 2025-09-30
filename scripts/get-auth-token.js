const axios = require('axios');

async function getToken() {
  try {
    const timestamp = Date.now();
    const register = await axios.post('http://localhost:3000/api/v1/auth/register', {
      email: `test_${timestamp}@example.com`,
      password: 'TestPassword123!',
      username: `test_${timestamp}`,
      firstName: 'Test',
      lastName: 'User'
    });
    
    console.log('Token:', register.data.data.tokens.accessToken);
    console.log('User ID:', register.data.data.user.id);
    return register.data.data;
  } catch (err) {
    console.log('Error:', err.response?.data || err.message);
  }
}

getToken();
