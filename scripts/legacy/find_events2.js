const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');
const match = content.match(/.{0,100}group\.on\(['"]click['"].{0,200}/g);
console.log(match);
