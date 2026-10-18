// 检查业务脚本语法与 HTML 加载清单，防止拆分后遗漏文件或顺序漂移。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'static/js/modules.json'), 'utf8'));
const files = ['config/app-config.js', 'services/api.js', 'ai.js', ...manifest];
const html = fs.readFileSync(path.join(root, 'static/index.html'), 'utf8');
let previous = -1;
for (const file of files) {
    const source = fs.readFileSync(path.join(root, 'static/js', file), 'utf8');
    new vm.Script(source, {filename: file});
    const index = html.indexOf(`/static/js/${file}"`);
    assert(index > previous, `脚本缺失或顺序错误：${file}`);
    previous = index;
}
// 联合解析还能发现拆分文件之间的重复词法声明。
new vm.Script(files.map(file => fs.readFileSync(path.join(root, 'static/js', file), 'utf8')).join('\n'));
console.log(`前端语法及加载顺序通过：${files.length} 个文件`);
const vendor = JSON.parse(fs.readFileSync(path.join(root, 'static/vendor/manifest.json'), 'utf8'));
for (const [file, expected] of Object.entries(vendor.sha256)) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'static/vendor', file))).digest('hex');
    assert.equal(actual, expected, `第三方库内容发生变化：${file}`);
}
console.log('第三方库内容校验通过');
