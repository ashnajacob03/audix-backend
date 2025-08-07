const fetch = require('node-fetch');

async function testFriendsAPI() {
  try {
    console.log('🧪 Testing Friends API...');
    
    // First, let's try to login to get a token
    const loginResponse = await fetch('http://localhost:3002/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'ashnajacob986@gmail.com',
        password: 'Ashna2003' // You might need to adjust this password
      }),
    });
    
    const loginData = await loginResponse.json();
    
    if (!loginResponse.ok) {
      console.log('❌ Login failed:', loginData.message);
      console.log('💡 You might need to check the password or login manually first');
      return;
    }
    
    console.log('✅ Login successful');
    const token = loginData.data.accessToken;
    
    // Now test the friends endpoint
    const friendsResponse = await fetch('http://localhost:3002/api/user/friends', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    const friendsData = await friendsResponse.json();
    
    if (friendsResponse.ok) {
      console.log('✅ Friends API working!');
      console.log(`📊 Friends count: ${friendsData.data.count}`);
      console.log('👥 Friends list:');
      friendsData.data.friends.forEach((friend, index) => {
        console.log(`${index + 1}. ${friend.name} (${friend.email}) - ${friend.online ? 'Online' : 'Offline'}`);
      });
    } else {
      console.log('❌ Friends API failed:', friendsData.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testFriendsAPI();
