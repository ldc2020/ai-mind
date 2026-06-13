const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');
const match = content.match(/setData\s*=\s*function[\s\S]*?\{[\s\S]{0,1000}/g);
console.log(match ? match.length : 0);
const match2 = content.match(/\bsetData\([^{]*\{[\s\S]{0,500}/g);
if (match2) {
    console.log(match2.filter(s => s.includes('nodeData')));
}
