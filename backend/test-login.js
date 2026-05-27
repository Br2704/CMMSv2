const http = require('http');

const data = JSON.stringify({
  email: 'admin@jkfenner.com',
  password: 'JKFenner@123'
});

const options = {
  hostname: 'localhost',
  port: 8081,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, res => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', d => process.stdout.write(d));
});
req.write(data);
req.end();
