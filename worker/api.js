const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function rows(db,sql,...args){return (await db.prepare(sql).bind(...args).all()).results;}
export async function reminders(env){
 const now=Date.now(),result={checkedAt:now,queued:0,waiting:0,errors:[]};
 const jobs=await rows(env.DB,'SELECT * FROM reminder_jobs WHERE state != ? OR trigger_at > ?', 'delivered',now);
 for(const job of jobs){
  try{
   const url=job.topic+'/still-'+encodeURIComponent(job.task_id);
   if(job.state==='cancel'){
    const response=await fetch(url,{method:'DELETE'});if(!response.ok&&response.status!==404)throw new Error('ntfy cancellation HTTP '+response.status);
    await env.DB.prepare('DELETE FROM reminder_jobs WHERE task_id = ?').bind(job.task_id).run();continue;
   }
   if(job.state==='queued'){if(job.trigger_at<=now)await env.DB.prepare('UPDATE reminder_jobs SET state = ? WHERE task_id = ?').bind('delivered',job.task_id).run();continue;}
   if(job.trigger_at-now>70*3600000){result.waiting++;continue;}
   const headers={'Content-Type':'text/plain; charset=utf-8',Title:'Time to start your task',Priority:'4',Click:job.site_url};
   if(job.trigger_at>now+10000)headers.Delay=String(Math.ceil(job.trigger_at/1000));
   const due=new Date(job.deadline_at).toLocaleString('en-US',{timeZone:job.timezone});
   const response=await fetch(url,{method:'POST',headers,body:job.title+'\nEstimated work: '+Math.ceil(job.estimated_seconds/60)+' min. Due '+due+' ('+job.timezone+').'});
   if(!response.ok)throw new Error('ntfy HTTP '+response.status);
   const receipt=await response.json();await env.DB.prepare('UPDATE reminder_jobs SET state = ?, receipt = ?, last_error = NULL WHERE task_id = ?').bind(job.trigger_at>now?'queued':'delivered',JSON.stringify(receipt),job.task_id).run();result.queued++;
  }catch(error){result.errors.push(job.task_id+': '+error.message);await env.DB.prepare('UPDATE reminder_jobs SET last_error = ? WHERE task_id = ?').bind(error.message,job.task_id).run();}
 }
 await env.DB.prepare('INSERT INTO server_runs (id, ran_at, result) VALUES (?, ?, ?)').bind(crypto.randomUUID(),now,JSON.stringify(result)).run();
 return result;
}
export async function api(request,env){
 const url=new URL(request.url);
 // This Site is owner-private. Sites authenticates browser/service access before dispatch.
 if(request.method==='POST'&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Invalid origin'},403);
 if(url.pathname==='/api/server-status'&&request.method==='GET')return json({tasks:await env.DB.prepare('SELECT COUNT(*) AS count FROM tasks WHERE deleted = 0').first(),runs:await rows(env.DB,'SELECT * FROM server_runs ORDER BY ran_at DESC LIMIT 3'),reminders:await rows(env.DB,'SELECT task_id, trigger_at, state, last_error FROM reminder_jobs')});
 if(url.pathname==='/api/reminders/run'&&request.method==='POST')return json(await reminders(env));
 if(url.pathname!=='/api/tasks/backup'||request.method!=='POST')return json({error:'Not found'},404);
 if(!request.headers.get('oai-authenticated-user-id'))return json({error:'Sign in to save tasks'},401);
 if(Number(request.headers.get('Content-Length')||0)>3000000)return json({error:'Backup too large'},413);
 const data=await request.json();
 if(typeof data.client!=='string'||data.client.length>100||!Array.isArray(data.tasks)||data.tasks.length>1000)return json({error:'Invalid backup'},400);
 let topic=data.topic||'';if(topic&&!/^https:\/\/ntfy\.sh\/[\w-]+$/.test(topic))return json({error:'Use an ntfy.sh topic for server reminders'},400);
 let timezone=data.timezone||'UTC';try{new Intl.DateTimeFormat('en-US',{timeZone:timezone});}catch{return json({error:'Invalid timezone'},400);}
 const now=Date.now(),previous=await rows(env.DB,'SELECT * FROM tasks WHERE client_id = ? AND deleted = 0',data.client),ids=new Set(data.tasks.map(t=>t.id));
 for(const task of data.tasks){
  if(typeof task.id!=='string'||task.id.length>100||typeof task.title!=='string'||task.title.length>1000||typeof task.notes!=='string'||task.notes.length>500000)return json({error:'Invalid task'},400);
 }
 const statements=[];
 for(const task of previous.filter(t=>!ids.has(t.task_id))){statements.push(env.DB.prepare('UPDATE tasks SET deleted = 1, updated_at = ? WHERE task_id = ?').bind(now,task.task_id));statements.push(env.DB.prepare('UPDATE reminder_jobs SET state = ? WHERE task_id = ? AND state != ?').bind('cancel',task.task_id,'delivered'));}
 for(const task of data.tasks){
  statements.push(env.DB.prepare('INSERT INTO tasks (task_id, client_id, title, notes, deadline, ai_state, ai_error, ai_input, ai_result, payload, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0) ON CONFLICT(task_id) DO UPDATE SET client_id=excluded.client_id,title=excluded.title,notes=excluded.notes,deadline=excluded.deadline,ai_state=excluded.ai_state,ai_error=excluded.ai_error,ai_input=excluded.ai_input,ai_result=excluded.ai_result,payload=excluded.payload,updated_at=excluded.updated_at,deleted=0').bind(task.id,data.client,task.title,task.notes,JSON.stringify(task.deadline||null),task.aiState||null,task.aiError||null,task.aiInput||null,JSON.stringify(task.aiEvidence||null),JSON.stringify(task),now));
  const active=!task.completedAt&&Number.isFinite(task.deadline?.at)&&Number.isFinite(task.estimatedSeconds)&&task.estimatedSeconds>0&&topic;
  if(!active){statements.push(env.DB.prepare('UPDATE reminder_jobs SET state = ? WHERE task_id = ? AND state != ?').bind('cancel',task.id,'delivered'));continue;}
  const at=task.deadline.at-task.estimatedSeconds*1000,signature=JSON.stringify([task.title,task.deadline.at,task.estimatedSeconds,topic]);
  statements.push(env.DB.prepare('INSERT INTO reminder_jobs (task_id, title, topic, timezone, site_url, deadline_at, estimated_seconds, trigger_at, signature, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET title=excluded.title,topic=excluded.topic,timezone=excluded.timezone,site_url=excluded.site_url,deadline_at=excluded.deadline_at,estimated_seconds=excluded.estimated_seconds,trigger_at=excluded.trigger_at,state=CASE WHEN reminder_jobs.signature != excluded.signature OR reminder_jobs.state = \'cancel\' THEN \'pending\' ELSE reminder_jobs.state END,signature=excluded.signature').bind(task.id,task.title,topic,timezone,url.origin,task.deadline.at,task.estimatedSeconds,at,signature,'pending'));
 }
 for(let i=0;i<statements.length;i+=80)await env.DB.batch(statements.slice(i,i+80));
 return json({saved:now,count:data.tasks.length,reminders:await reminders(env)});
}
