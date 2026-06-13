const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');
const match = content.match(/\.attr\(\s*['"]data-[^'"]+['"]/g);
console.log(match ? [...new Set(match)] : null);
