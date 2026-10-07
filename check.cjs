const b = require('bcrypt');
const hash = '$2b$12$ZuuN4oevMcaqUrP4.4F/4O32jFwkJnjdoKWXjBSJnlTFKj2h7g38G';
b.compare('password123', hash).then(r => console.log('match:', r));