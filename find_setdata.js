const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');
const match = content.match(/setData\([^)]*\)\s*\{[\s\S]{0,1000}/);
console.log(match ? match[0] : 'not found');
