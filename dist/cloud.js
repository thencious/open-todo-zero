/* Private server backup and reminder scheduling. No API credentials are uploaded. */
(() => {
 'use strict';
 if(document.querySelector('meta[name="open-todo-server"]')?.content!=='enabled')return;
 let client=localStorage.getItem('still.cloud.client');if(!client){client=crypto.randomUUID();localStorage.setItem('still.cloud.client',client);}
 let pending=null,timer=null,busy=false,last='',inflight='';
 async function flush(){
  clearTimeout(timer);timer=null;if(busy||!pending)return;busy=true;const payload=pending;inflight=payload;pending=null;
  try{
   const response=await fetch('/api/tasks/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:payload.length<60000});
   if(!response.ok)throw new Error('Server backup failed ('+response.status+')');const result=await response.json();last=payload;
   document.getElementById('storage-status').textContent='Saved on device and server';
   window.StillAlerts?.serverStatus(result.reminders?.errors?.length?'Server reminder error: '+result.reminders.errors[0]:'Server reminders active');
  }catch(error){pending=pending||payload;document.getElementById('storage-status').textContent='Saved on device · server retry pending';timer=setTimeout(flush,15000);}
  finally{busy=false;inflight='';if(pending&&!timer)timer=setTimeout(flush,1000);}
 }
 window.StillCloud={save(tasks){const payload=JSON.stringify({client,tasks,topic:window.StillAlerts?.topic()||'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});if(payload===last||payload===pending||payload===inflight)return;pending=payload;clearTimeout(timer);timer=setTimeout(()=>{timer=null;flush();},800);},flush};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});window.addEventListener('online',flush);
})();
