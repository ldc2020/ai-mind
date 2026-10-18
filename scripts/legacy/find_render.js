const fs = require('fs');
const content = fs.readFileSync('./static/js/simpleMindMap.umd.min.js', 'utf8');
const nodeRenderCode = content.match(/createNodeGroup[\s\S]*?className[\s\S]*?}/);
console.log(nodeRenderCode ? nodeRenderCode[0] : 'Not found');
