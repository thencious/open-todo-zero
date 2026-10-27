import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const candidates=[process.env.CHROME_BIN,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
let browser;for(const path of candidates){try{await access(path);browser=path;break;}catch{}}
if(!browser)throw new Error('Install Chrome/Chromium or set CHROME_BIN to its executable.');
const port=5187,server=spawn(process.execPath,['scripts/serve.mjs','--demo'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error('Preview exited: '+code)));});
try{
 await mkdir(join(root,'docs/screenshots'),{recursive:true});
 if(typeof WebSocket==='undefined')throw new Error('Screenshot capture requires Node.js 22 or newer.');
 for(const [name,width,height] of [['desktop',1440,960],['mobile',420,920]]){
  const profile=await mkdtemp(join(tmpdir(),'open-todo-zero-screenshot-'));
  const chrome=spawn(browser,['--headless=new','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--hide-scrollbars','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let socket;
  try{
   const endpoint=await new Promise((resolve,reject)=>{let output='';const timeout=setTimeout(()=>reject(new Error('Chrome startup timed out')),15000);chrome.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});chrome.once('error',reject);});
   socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
   let nextId=0;const pending=new Map();socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(!message.id)return;const job=pending.get(message.id);if(!job)return;pending.delete(message.id);message.error?job.reject(new Error(message.error.message)):job.resolve(message.result);});
   const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
   const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
   const command=(method,params)=>send(method,params,sessionId);
   await command('Page.enable');await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:name==='mobile'});
   if(name==='mobile')await command('Emulation.setTouchEmulationEnabled',{enabled:true});
   await command('Page.navigate',{url:'http://127.0.0.1:'+port+'/__demo'});
   let ready=false;for(let attempt=0;attempt<100;attempt++){const result=await command('Runtime.evaluate',{expression:"document.querySelector('.toastui-editor-ww-container .toastui-editor-contents')?.textContent.includes('Ready for launch')",returnByValue:true});if(result.result?.value){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}
   if(!ready)throw new Error('Sample notes did not finish rendering');
   const metrics=await command('Runtime.evaluate',{expression:"JSON.stringify({viewport:innerWidth,body:document.body.scrollWidth,editor:document.querySelector('.toastui-editor-main').getBoundingClientRect().toJSON()})",returnByValue:true});console.log(name+' layout: '+metrics.result.value);
   const capture=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   const {writeFile}=await import('node:fs/promises');await writeFile(join(root,'docs/screenshots',name+'.png'),Buffer.from(capture.data,'base64'));
   console.log('Saved docs/screenshots/'+name+'.png');
  }finally{socket?.close();chrome.kill();}
 }
}finally{server.kill();}
