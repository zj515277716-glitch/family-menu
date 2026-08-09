const fs = require('fs');
const path = require('path');

const dist = 'apps/h5/dist';
const js = fs.readdirSync(path.join(dist, 'js')).filter(f => f.endsWith('.js'));
const css = fs.readdirSync(path.join(dist, 'css')).filter(f => f.endsWith('.css'));

const cssLinks = css.map(f => '<link rel="stylesheet" href="css/' + f + '">').join('');
const jsScripts = js.map(f => '<script src="js/' + f + '"></script>').join('');

const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><title>家庭菜谱</title>' + cssLinks + '<script>window.process=window.process||{env:{NODE_ENV:"production"}};</script></head><body><div id="app"></div>' + jsScripts + '</body></html>';

fs.writeFileSync(path.join(dist, 'index.html'), html);
console.log('index.html created');
console.log('JS:', js);
console.log('CSS:', css);
