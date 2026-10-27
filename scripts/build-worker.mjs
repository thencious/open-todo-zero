import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
const assets={};
function collect(dir='dist'){for(const item of readdirSync(dir,{withFileTypes:true})){if(item.name==='server'||item.name==='.openai')continue;const path=dir+'/'+item.name;if(item.isDirectory())collect(path);else assets['/'+path.slice(5)]=readFileSync(path,'utf8');}}
collect();
assets['/index.html']=assets['/index.html'].replace('<head>','<head><meta name="open-todo-server" content="enabled">');
const manifest=existsSync('.openai/hosting.json')?'.openai/hosting.json':'.openai/hosting.example.json';
const api=readFileSync('worker/api.js','utf8').replaceAll('export async function','async function');
const source='const assets='+JSON.stringify(assets)+';\n'+api+`\nexport default {async fetch(request,env){try{const path=new URL(request.url).pathname;if(path.startsWith('/api/'))return await api(request,env);if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});const key=path==='/'?'/index.html':path,body=assets[key];if(body===undefined)return new Response('Not found',{status:404});const type=key.endsWith('.js')?'text/javascript':key.endsWith('.css')?'text/css':key.endsWith('.html')?'text/html':'text/plain';return new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});}catch(error){console.error(error);return Response.json({error:'Server request failed'},{status:500});}}};`;
mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});writeFileSync('dist/server/index.js',source);writeFileSync('dist/.openai/hosting.json',readFileSync(manifest));
console.log('Built Worker with '+Object.keys(assets).length+' embedded assets');
