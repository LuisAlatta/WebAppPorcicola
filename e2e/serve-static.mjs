import {createServer} from 'node:http';
import {URL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const root=resolve('dist/client');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
let blockOldLazy=false;
createServer(async(request,response)=>{
 try{const url=new URL(request.url,'http://localhost');const path=decodeURIComponent(url.pathname);if(path==='/__test/block-old-lazy'&&request.method==='POST'){blockOldLazy=true;response.writeHead(204).end();return;}if((path==='/__test/unblock-old-lazy'||path==='/__test/reset')&&request.method==='POST'){blockOldLazy=false;response.writeHead(204).end();return;}if(blockOldLazy&&path.startsWith('/assets/ModuloAnimales')){response.writeHead(404).end();return;}if(path==="/offline.html"){response.writeHead(307,{Location:"/offline"}).end();return;}const target=resolve(root,path==="/offline"?"offline.html":`.${path}`);if(!target.startsWith(root+sep)&&target!==root){response.writeHead(403).end();return;}let file=target;let body;try{body=await readFile(file);}catch{file=resolve(root,'index.html');body=await readFile(file);}if(path==='/sw.js'&&url.searchParams.has('test-next')){let source=body.toString().replace(/porcicola-static-([^']+)/,"porcicola-static-$1-test-next");source=source.replace(/const STATIC_PATHS = (\[[^\n]+\]);/,(_match,paths)=>`const STATIC_PATHS = ${JSON.stringify(JSON.parse(paths).filter(path=>!path.startsWith('/assets/ModuloAnimales')))};`);body=source;}response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});response.end(body);}catch{response.writeHead(500).end();}
}).listen(4173,'127.0.0.1');
