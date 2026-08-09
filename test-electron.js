const { app } = require('electron');
console.log('App is:', typeof app);
console.log('Is packaged:', app.isPackaged);
app.quit();
