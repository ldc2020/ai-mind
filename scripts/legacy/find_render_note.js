const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');
const match = content.match(/renderNote[\s\S]*?renderIcon/);
console.log(match ? match[0] : 'not found');
