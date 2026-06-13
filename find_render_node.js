const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');
const match = content.match(/renderNode\(\)[\s\S]*?\{[\s\S]{0,500}/);
console.log(match ? match[0] : 'not found');
