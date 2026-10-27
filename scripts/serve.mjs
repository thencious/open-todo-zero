import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {demoTasks} from './demo-fixture.mjs';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
const port=Number(process.env.PORT||5173),demo=process.argv.includes('--demo');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(request,response)=>{
 try{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  if(demo&&pathname==='/__demo'){
   const seed=JSON.stringify(demoTasks()).replaceAll('<','\\u003c');
   response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   response.end('<!doctype html><script>localStorage.clear();localStorage.setItem("still.tasks.v1",JSON.stringify('+seed+'));location.replace("/");</script>');return;
  }
  const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(resolve(root)+sep)||(await stat(file)).isDirectory()){response.writeHead(404);response.end();return;}
  const bytes=await readFile(file);response.writeHead(200,{'Content-Type':(types[extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store'});response.end(request.method==='HEAD'?undefined:bytes);
 }catch{response.writeHead(404);response.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log('Open Todo Zero: http://127.0.0.1:'+port));
