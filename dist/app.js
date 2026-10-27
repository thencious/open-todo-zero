/* Still — browser-local notes and tasks. Editor: TOAST UI (MIT). */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const key = 'still.tasks.v1';
 const checkIcon = '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>';
 const circleIcon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/></svg>';
 const chevronIcon = '<svg class="task-chevron" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg>';
 const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const now = Date.now();
 const starter = [
  {id:'welcome',title:'Plan the week ahead',notes:'## Make room for what matters\n\nA fresh week, a little intention.\n\n### The essentials\n\n- Pick **three things** to focus on\n- Leave some breathing room\n- Make time for something you enjoy\n\n### A note to yourself\n\nYou don’t have to do it all today. Just start with the next small thing.\n\n> Progress over perfection.',createdAt:now},
  {id:'focus',title:'Make time for focused work',notes:'Find a quiet hour. Close a few tabs. Begin.',createdAt:now-1000},
  {id:'thought',title:'Capture a loose thought',notes:'An idea doesn’t need to be finished to be worth keeping.\n\nWrite yours here…',createdAt:now-2000},
  {id:'read',title:'Read something inspiring',notes:'A chapter, an article, a few good words.',createdAt:now-3000},
  {id:'break',title:'Take a proper break',notes:'Step outside. Stretch. Come back with fresh eyes.',createdAt:now-4000},
  {id:'space',title:'Set up your space',notes:'A clear desk, a fresh start.',createdAt:now-5000,completedAt:now-60000},
  {id:'small',title:'Start small',notes:'You’re already on your way.',createdAt:now-6000,completedAt:now-120000}
 ];
 let tasks, storageOk = true;
 try {
  const raw = localStorage.getItem(key);
  if (raw === null) tasks = starter;
  else {
   const data = JSON.parse(raw);
   if (!Array.isArray(data) || !data.every(t => t && typeof t.id === 'string' && typeof t.title === 'string' && typeof t.notes === 'string' && Number.isFinite(t.createdAt) && (t.completedAt == null || Number.isFinite(t.completedAt))) || new Set(data.map(t => t.id)).size !== data.length) throw new Error('Invalid saved tasks');
   tasks = data;
  }
 } catch (e) { tasks = []; storageOk = false; }
 // Migrate existing lists once; manual order is independent of creation/completion dates.
 for(const done of [false,true]) tasks.filter(t=>!!t.completedAt===done).sort((a,b)=>done?b.completedAt-a.completedAt:b.createdAt-a.createdAt).forEach((t,i)=>{if(!Number.isFinite(t.order))t.order=i;});
 for(const task of tasks){if(!['urgent','important','unimportant'].includes(task.priority))task.priority='important';if(task.deadline&&!Number.isFinite(task.deadline.at))task.deadline=null;if(task.deadline?.kind==='calendar'&&task.deadline.local){const date=StillDeadlines.localDate(task.deadline.local);if(date)task.deadline.at=date.getTime();}if(!Number.isFinite(task.estimatedSeconds)||task.estimatedSeconds<60)task.estimatedSeconds=null;}
 function effectivePriority(task,time=Date.now()){
  if(task.completedAt)return 'completed';
  if(task.priority==='urgent')return 'urgent';
  if(Number.isFinite(task.deadline?.at)&&task.deadline.at-time<=43200000+(task.estimatedSeconds||0)*1000)return 'urgent';
  return task.priority;
 }
 function compareTasks(a,b){const ranks={urgent:0,important:1,unimportant:2,completed:3};return ranks[effectivePriority(a)]-ranks[effectivePriority(b)]||a.order-b.order||(b.completedAt||0)-(a.completedAt||0);}
 const firstTask = [...tasks].sort(compareTasks)[0];
 let selected = firstTask?.id || null;
 for(const task of tasks){if(typeof task.confirmedTitle!=='string')task.confirmedTitle=task.title;if(task.aiState==='pending'){task.aiState='error';task.aiError='Previous OpenRouter request was interrupted. Click Update AI to retry.';}}
 let filter = 'all', query = '', loadingEditor = false,groupSignature='',renderingRows=false,deadlineFieldsTask=null,rowDeadlineEdit=null;
 const deletionHistory=[];
 const newTaskDrafts={important:'',unimportant:''};
 const mobile = matchMedia('(max-width: 720px)');
 const editor = new toastui.Editor({
  el:$('editor-mount'),height:'100%',minHeight:'200px',initialValue:'',
  initialEditType:'wysiwyg',previewStyle:'tab',hideModeSwitch:true,autofocus:false,
  theme:'dark',usageStatistics:false,placeholder:'Write a note…',
  toolbarItems:[['heading','bold','italic'],['ul','ol','task'],['link','code','quote']],
  linkAttributes:{target:'_blank',rel:'noopener noreferrer'},
  customHTMLSanitizer:html=>DOMPurify.sanitize(html)
 });
 $('editor-mount').querySelectorAll('[contenteditable="true"]').forEach(el=>{el.setAttribute('aria-label','Notes');el.setAttribute('role','textbox');el.setAttribute('aria-multiline','true');});
 editor.on('change',()=>{
  if(loadingEditor) return;
  const task = current(); if(!task) return;
  task.notes=editor.getMarkdown(); save(); updateWordCount(); updateRow(task);
 });
 function current(){return tasks.find(t=>t.id===selected);}
 function save(){
  if(window.StillCloud)StillCloud.save(tasks);
  try { if(!storageOk) throw new Error('Storage unavailable'); localStorage.setItem(key,JSON.stringify(tasks)); $('storage-status').innerHTML='<span></span>Saved on this device'; }
  catch(e){storageOk=false; $('storage-status').textContent='Not saved · browser storage unavailable';}
 }
 function visible(){return tasks.filter(t=>(filter==='all'||(filter==='completed'?!!t.completedAt:!t.completedAt))&&(!query||(t.title+' '+t.notes).toLowerCase().includes(query))).sort(compareTasks);}
 function topOrder(done,exclude){return Math.min(0,...tasks.filter(t=>t.id!==exclude&&!!t.completedAt===done).map(t=>t.order))-1;}
 function rowMarkup(task){
  const id=escapeHtml(task.id);
  return '<div class="task-row'+(task.completedAt?' completed':'')+(task.priority==='unimportant'||task.urgentBasePriority==='unimportant'?' low-importance':'')+(task.id===selected?' selected':'')+'" draggable="true" data-task-id="'+id+'" title="Click to edit · drag to reorder"><button class="drag-handle" data-drag="'+id+'" aria-label="'+escapeHtml('Reorder '+task.title)+'" title="Drag to reorder · ↑/↓ to move selected task"><svg viewBox="0 0 12 18"><path d="M4 3h.1M8 3h.1M4 9h.1M8 9h.1M4 15h.1M8 15h.1" stroke-width="2.5"/></svg></button><button class="task-check" data-check="'+id+'" role="checkbox" aria-checked="'+!!task.completedAt+'" aria-label="'+escapeHtml((task.completedAt?'Reopen ':'Complete ')+task.title)+'">'+(task.completedAt?checkIcon:'')+'</button><div class="task-open"><span class="task-copy"><button class="task-title" data-open="'+id+'" aria-expanded="'+(task.id===selected)+'" aria-controls="detail-pane" aria-keyshortcuts="ArrowUp ArrowDown Delete">'+escapeHtml(task.title)+'</button><input class="row-title-input" data-row-title="'+id+'" aria-label="Task title in list" value="'+escapeHtml(task.title)+'" maxlength="250" enterkeyhint="done" autocomplete="off" hidden></span>'+rowDeadlineMarkup(task)+chevronIcon+'</div></div>';
 }
 function rowDeadlineMarkup(task){
  const id=escapeHtml(task.id),button=part=>'<button type="button" class="due-part due-'+part+'" data-due-part="'+part+'" data-due-task="'+id+'" aria-label="Edit deadline '+part+'"></button>';
  return '<div class="row-deadline" data-row-deadline="'+id+'"><div class="row-deadline-parts"><span class="due-label">Due</span>'+button('date')+'<span class="row-clock-parts">'+button('hour')+'<span class="time-separator">:</span>'+button('minute')+'<span class="time-separator">:</span>'+button('second')+'</span></div><time class="task-countdown" data-countdown="'+id+'"'+(!task.deadline?' hidden':'')+'></time></div>';
 }
 function updateRow(task){
  const wrap = [...document.querySelectorAll('.task-wrap')].find(w=>w.dataset.id===task.id);
  if(wrap){wrap.querySelector('.task-title').textContent=task.title;const input=wrap.querySelector('.row-title-input');if(input.value!==task.title)input.value=task.title;wrap.querySelector('.task-check').setAttribute('aria-label',(task.completedAt?'Reopen ':'Complete ')+task.title);wrap.querySelector('.drag-handle').setAttribute('aria-label','Reorder '+task.title);}
 }
 function renderList(){
  // Keep the one editor instance alive while task rows are rebuilt.
  const focusedEditor=$('editor-mount').contains(document.activeElement),selection=focusedEditor?editor.getSelection():null;
  const focusedRow=document.activeElement?.matches('[data-row-title]')?{id:document.activeElement.dataset.rowTitle,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
  const focusedNew=document.activeElement?.matches('[data-new-priority]')?{priority:document.activeElement.dataset.newPriority,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
  const focusedDeadline=document.activeElement?.matches('[data-due-edit]')?{id:document.activeElement.dataset.dueTask,part:document.activeElement.dataset.dueEdit,value:document.activeElement.value}:null;
  if(focusedNew)newTaskDrafts[focusedNew.priority]=document.activeElement.value;
  renderingRows=true;
  if($('detail-pane').parentElement!==$('workspace'))$('workspace').append($('detail-pane'));
  const list = visible();
  if(selected&&!list.some(t=>t.id===selected))selected=null;
  const labels={urgent:'Urgent',important:'Important',unimportant:'Unimportant',completed:'Completed'};
  $('task-list').dataset.filter=filter;
  $('task-list').innerHTML=['urgent','important','unimportant','completed'].map(priority=>{
   const items=list.filter(t=>effectivePriority(t)===priority);if((priority==='urgent'||priority==='completed')&&!items.length)return '';if(filter==='completed'&&priority!=='completed')return '';
   const addForm=(priority==='important'||priority==='unimportant')?'<form class="section-add-form" data-task-form="'+priority+'" autocomplete="off"><span class="add-plus">+</span><input class="section-new-task" data-new-priority="'+priority+'" maxlength="250" enterkeyhint="done" value="'+escapeHtml(newTaskDrafts[priority])+'" placeholder="Add a task…" aria-label="New '+priority+' task"><button type="submit" class="add-key" aria-label="Confirm '+priority+' task" title="Confirm task (Enter)">↵</button></form>':'';
   return '<section class="priority-section priority-'+priority+'" data-priority="'+priority+'" aria-label="'+labels[priority]+' tasks"><div class="priority-heading"><span>'+labels[priority]+' <span class="section-count">'+items.length+'</span></span></div>'+addForm+'<div class="priority-tasks">'+(items.map(task=>'<div class="task-wrap" data-id="'+escapeHtml(task.id)+'">'+rowMarkup(task)+'</div>').join('')||'<div class="list-empty">'+(query?'No matching tasks.':'No tasks.')+'</div>')+'</div></section>';
  }).join('');
  if(!list.length&&filter==='completed')$('task-list').innerHTML='<div class="list-empty">No completed tasks.</div>';
  document.querySelectorAll('.filter').forEach(b=>{const on=b.dataset.filter===filter;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});
  positionDetail();
  updateCountdowns();
  groupSignature=tasks.map(t=>t.id+':'+effectivePriority(t)).join('|');
  if(focusedEditor&&selected){focusNotes();if(selection)editor.setSelection(...selection);}
  if(focusedRow&&focusedRow.id===selected)focusRowEditor(focusedRow.id,focusedRow.start,focusedRow.end);
  if(focusedNew){const input=document.querySelector('[data-new-priority="'+focusedNew.priority+'"]');if(input){input.focus({preventScroll:true});input.setSelectionRange(focusedNew.start,focusedNew.end);}}
  if(focusedDeadline&&tasks.some(t=>t.id===focusedDeadline.id))renderRowDeadlineInput(focusedDeadline.id,focusedDeadline.part,focusedDeadline.value);
  renderingRows=false;
 }
 function positionDetail(){
  const pane=$('detail-pane');
  if(mobile.matches&&selected){
   const wrap=[...document.querySelectorAll('.task-wrap')].find(w=>w.dataset.id===selected);
   if(wrap)wrap.append(pane);
  } else if(pane.parentElement!==$('workspace'))$('workspace').append(pane);
  pane.classList.toggle('mobile-open',mobile.matches&&!!selected);
 }
 function showTask(){
  const task=current();
  $('detail-content').hidden=!task;$('detail-empty').hidden=!!task;
  if(!task)return;
  $('detail-title').value=task.title;
  updateTaskMeta();updateAIButton();
  $('detail-status').innerHTML=task.completedAt?checkIcon+'Completed':circleIcon+'To do';
  $('detail-status').setAttribute('aria-label',task.completedAt?'Reopen task':'Complete task');
  loadingEditor=true;editor.setMarkdown('',false);editor.setMarkdown(task.notes,false);setSourceMode(false);loadingEditor=false;
  updateWordCount();
 }
 function toggleComplete(id){
  const task=tasks.find(t=>t.id===id);if(!task)return;
  task.completedAt=task.completedAt?null:Math.max(Date.now(),...tasks.map(t=>(t.completedAt||0)+1));
  task.order=topOrder(!!task.completedAt,task.id);
  save();renderList();if(selected===id){$('detail-status').innerHTML=task.completedAt?checkIcon+'Completed':circleIcon+'To do';$('detail-status').setAttribute('aria-label',task.completedAt?'Reopen task':'Complete task');updateTaskMeta();}else if(!selected)showTask();StillAlerts.refresh();StillAlerts.sync(tasks,save);
 }
 function closeDetail(){selected=null;renderList();showTask();}
 function focusTask(id,handle=false){
  const wrap=[...document.querySelectorAll('.task-wrap')].find(w=>w.dataset.id===id);
  wrap?.querySelector(handle?'.drag-handle':'.task-title').focus({preventScroll:true});
 }
 function focusRowEditor(id,start,end){
  const input=[...document.querySelectorAll('[data-row-title]')].find(el=>el.dataset.rowTitle===id);if(!input)return;
  input.closest('.task-row').classList.add('editing-title');input.hidden=false;input.previousElementSibling.hidden=true;
  input.focus({preventScroll:true});const length=input.value.length;input.setSelectionRange(start??length,end??start??length);
  if(start==null)input.scrollLeft=input.scrollWidth;
 }
 function focusNotes(){const mode=editor.isMarkdownMode()?'.toastui-editor-md-container':'.toastui-editor-ww-container';$('editor-mount').querySelector(mode+' [contenteditable="true"]')?.focus({preventScroll:true});}
 function startTitleEdit(id){
  if(!tasks.some(t=>t.id===id))return;
  if(selected!==id){document.activeElement?.blur();selected=id;renderList();showTask();}
  focusRowEditor(id);
 }
 function finishRowEdit(id,focus=false){
  const input=[...document.querySelectorAll('[data-row-title]')].find(el=>el.dataset.rowTitle===id);if(!input)return;
  input.hidden=true;input.previousElementSibling.hidden=false;input.closest('.task-row').classList.remove('editing-title');if(focus)focusTask(id);
 }
 function moveTask(id,targetId,after){
  const task=tasks.find(t=>t.id===id),target=tasks.find(t=>t.id===targetId);
  if(!task||!target||task===target||!!task.completedAt!==!!target.completedAt)return false;
  const priority=effectivePriority(target);if(!task.completedAt&&effectivePriority(task)!==priority)assignPriority(task,priority);
  const group=tasks.filter(t=>effectivePriority(t)===priority&&!!t.completedAt===!!task.completedAt&&t.id!==id).sort(compareTasks);
  group.splice(group.findIndex(t=>t.id===targetId)+(after?1:0),0,task);
  group.forEach((t,i)=>t.order=i);
  const changedSelection=selected!==id;selected=id;save();renderList();if(changedSelection)showTask();else updateTaskMeta();focusTask(id);
  return true;
 }
 // Native row dragging on desktop, pointer handles for mouse, touch, and pen.
 let dragId=null,drop=null,pointerDrag=null,suppressHandleClick=false;
 function clearDrop(){document.querySelectorAll('.drop-before,.drop-after,.drop-zone').forEach(el=>el.classList.remove('drop-before','drop-after','drop-zone'));drop=null;}
 function markDrop(row,y,section){
  clearDrop();
  const from=tasks.find(t=>t.id===dragId),target=tasks.find(t=>t.id===row?.dataset.taskId);
  if(from&&!row&&section?.dataset.priority&&section.dataset.priority!=='completed'){section.classList.add('drop-zone');drop={priority:section.dataset.priority};return true;}
  if(!from||!target||from.id===target.id||!!from.completedAt!==!!target.completedAt)return false;
  const rect=row.getBoundingClientRect(),after=y>rect.top+rect.height/2;
  row.classList.add(after?'drop-after':'drop-before');drop={id:target.id,after};return true;
 }
 function endDrag(commit){
  const id=dragId,destination=drop;
  if(pointerDrag?.holdTimer)clearTimeout(pointerDrag.holdTimer);
  clearDrop();document.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));document.body.classList.remove('is-dragging');dragId=null;pointerDrag=null;
  if(commit&&destination){if(destination.priority)moveIntoPriority(id,destination.priority);else moveTask(id,destination.id,destination.after);}
 }
 $('task-list').addEventListener('dragstart',e=>{
  const row=e.target.closest('.task-row');if(!row||pointerDrag||e.target.closest('input,textarea,[contenteditable="true"],.detail-pane,.row-deadline')){e.preventDefault();return;}
  dragId=row.dataset.taskId;row.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragId);
 });
 $('task-list').addEventListener('dragover',e=>{
  if(dragId&&markDrop(e.target.closest('.task-row'),e.clientY,e.target.closest('.priority-section'))){e.preventDefault();e.dataTransfer.dropEffect='move';}
 });
 $('task-list').addEventListener('drop',e=>{if(!dragId)return;e.preventDefault();endDrag(true);});
 $('task-list').addEventListener('dragend',()=>endDrag(false));
 $('task-list').addEventListener('pointerdown',e=>{
  const row=e.target.closest('.task-row'),handle=e.target.closest('[data-drag]');
  if(!row||e.target.closest('input,[data-check],.detail-pane,.row-deadline')||e.button!==0||e.isPrimary===false)return;
  const touch=e.pointerType==='touch'&&!handle;
  if(!touch)e.preventDefault();
  pointerDrag={id:row.dataset.taskId,x:e.clientX,y:e.clientY,pointerId:e.pointerId,target:handle||row,handle:!!handle,touch,active:false};
  const p=pointerDrag;p.target.setPointerCapture?.(e.pointerId);
  if(touch)p.holdTimer=setTimeout(()=>{if(pointerDrag===p){p.active=true;dragId=p.id;row.classList.add('dragging');document.body.classList.add('is-dragging');}},350);
 });
 document.addEventListener('pointermove',e=>{
  const p=pointerDrag;if(!p||e.pointerId!==p.pointerId)return;
  const distance=Math.hypot(e.clientX-p.x,e.clientY-p.y);
  if(p.touch&&!p.active){if(distance>8)endDrag(false);return;}
  if(!p.active&&distance<5)return;
  e.preventDefault();
  if(!p.active){p.active=true;dragId=p.id;p.target.closest('.task-row').classList.add('dragging');document.body.classList.add('is-dragging');}
  const under=document.elementFromPoint(e.clientX,e.clientY);markDrop(under?.closest('.task-row'),e.clientY,under?.closest('.priority-section'));
  const pane=under?.closest('.priority-tasks')||p.target.closest('.priority-tasks'),rect=pane?.getBoundingClientRect();
  if(!mobile.matches&&pane&&rect){if(e.clientY<rect.top+40)pane.scrollTop-=12;else if(e.clientY>rect.bottom-40)pane.scrollTop+=12;}
  else{if(e.clientY<40)window.scrollBy(0,-12);else if(e.clientY>window.innerHeight-40)window.scrollBy(0,12);}
 },{passive:false});
 document.addEventListener('pointerup',e=>{
  const p=pointerDrag;if(!p||e.pointerId!==p.pointerId)return;
  if(p.holdTimer)clearTimeout(p.holdTimer);p.target.releasePointerCapture?.(p.pointerId);
  suppressHandleClick=true;setTimeout(()=>suppressHandleClick=false,0);
  if(p.active)endDrag(true);
  else{pointerDrag=null;if(p.handle){if(selected!==p.id){selected=p.id;renderList();showTask();}focusTask(p.id,true);}else startTitleEdit(p.id);}
 });
 document.addEventListener('touchmove',e=>{if(pointerDrag?.active)e.preventDefault();},{passive:false});
 $('task-list').addEventListener('contextmenu',e=>{if(pointerDrag?.active)e.preventDefault();});
 document.addEventListener('pointercancel',()=>endDrag(false));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dragId){endDrag(false);e.preventDefault();}});
 function setSourceMode(on){
  editor.changeMode(on?'markdown':'wysiwyg',true);
  $('source-toggle').setAttribute('aria-pressed',on);
  $('source-toggle').classList.toggle('active',on);
  $('source-toggle').title=on?'Return to formatted notes':'Show raw Markdown';
  $('editor-mount').classList.toggle('source-mode',on);
 }
 function updateWordCount(){const count=(current()?.notes.trim().match(/\S+/g)||[]).length;$('word-count').textContent=count+' '+(count===1?'word':'words');}
 $('task-list').addEventListener('click',e=>{
  const part=e.target.closest('[data-due-part]');if(part){startRowDeadlineEdit(part.dataset.dueTask,part.dataset.duePart);return;}
  if(e.target.closest('.row-deadline'))return;
  if(suppressHandleClick||e.target.closest('[data-row-title],[data-task-form],.detail-pane'))return;
  const handle=e.target.closest('[data-drag]');if(handle){if(suppressHandleClick)return;if(selected!==handle.dataset.drag){selected=handle.dataset.drag;renderList();showTask();}focusTask(selected,true);return;}
  const check=e.target.closest('[data-check]');if(check){toggleComplete(check.dataset.check);return;}
  const row=e.target.closest('.task-row');if(row)startTitleEdit(row.dataset.taskId);
 });
 $('task-list').addEventListener('input',e=>{const input=e.target.closest('[data-row-title]');if(input)editTitle(input.dataset.rowTitle,input.value);const add=e.target.closest('[data-new-priority]');if(add)newTaskDrafts[add.dataset.newPriority]=add.value;});
 $('task-list').addEventListener('change',e=>{if(e.target.matches('[data-due-edit="date"]'))finishRowDeadlineEdit(true,true);});
 $('task-list').addEventListener('focusout',e=>{
  const due=e.target.closest('[data-due-edit]');if(due){if(renderingRows)return;const next=e.relatedTarget?.closest('[data-due-part]');const finished=finishRowDeadlineEdit(true,false);if(finished&&next)startRowDeadlineEdit(next.dataset.dueTask,next.dataset.duePart);return;}
  const add=e.target.closest('[data-new-priority]');if(add){newTaskDrafts[add.dataset.newPriority]=add.value;return;}
  const input=e.target.closest('[data-row-title]');if(!input||renderingRows)return;
  finishRowEdit(input.dataset.rowTitle);
 });
 $('task-list').addEventListener('keydown',e=>{
  const due=e.target.closest('[data-due-edit]');if(due){
   if(e.key==='Enter'){e.preventDefault();e.stopPropagation();finishRowDeadlineEdit(true,true);}
   else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finishRowDeadlineEdit(false,true);}
   else if(due.dataset.dueEdit!=='date'&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();e.stopPropagation();const max=due.dataset.dueEdit==='hour'?24:60,n=Number(due.value)||0;due.value=String((n+(e.key==='ArrowUp'?1:max-1))%max).padStart(2,'0');}
   return;
  }
  const add=e.target.closest('[data-new-priority]');if(add&&e.key==='Enter'&&!e.isComposing){e.preventDefault();e.stopPropagation();add.form.requestSubmit();return;}
  const input=e.target.closest('[data-row-title]');if(!input)return;
  if(e.key==='Enter'&&!e.isComposing){e.preventDefault();e.stopPropagation();confirmTitle(input.dataset.rowTitle);finishRowEdit(input.dataset.rowTitle,true);}
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();const task=tasks.find(t=>t.id===input.dataset.rowTitle);if(task)editTitle(task.id,task.confirmedTitle);finishRowEdit(input.dataset.rowTitle,true);}
 });
 $('task-list').addEventListener('submit',e=>{
  const form=e.target.closest('[data-task-form]');if(!form)return;e.preventDefault();const input=form.querySelector('input');createTask(form.dataset.taskForm,input.value,true);
 });
 function createTask(priority,value,focusAfter){
  const title=value.trim();if(!title)return;if(!['important','unimportant'].includes(priority))return;
  newTaskDrafts[priority]='';const input=document.querySelector('[data-new-priority="'+priority+'"]');if(input)input.value='';
  const task={id:crypto.randomUUID(),title,confirmedTitle:title,confirmedAt:Date.now(),notes:'',createdAt:Math.max(Date.now(),...tasks.map(t=>t.createdAt+1)),completedAt:null,order:topOrder(false),priority};
  tasks.unshift(task);selected=task.id;filter='all';query='';$('search').value='';save();renderList();showTask();requestAI(task.id,'initial');if(focusAfter)focusNewTask(priority);
 }
 function focusNewTask(priority='important'){
  let input=document.querySelector('[data-new-priority="'+priority+'"]');if(!input){filter='all';renderList();input=document.querySelector('[data-new-priority="'+priority+'"]');}input?.focus();
 }
 $('detail-title').addEventListener('input',()=>editTitle(selected,$('detail-title').value));
 $('detail-title').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();confirmTitle();focusNotes();}});
 $('detail-status').addEventListener('click',()=>toggleComplete(selected));
 $('close-detail').addEventListener('click',closeDetail);
 $('source-toggle').addEventListener('click',()=>setSourceMode(!editor.isMarkdownMode()));
 $('update-ai').addEventListener('click',()=>{if(!StillOpenRouter.isConnected()){showMessage('Connect OpenRouter in settings to update AI.');return;}requestAI(selected,'manual');});
 $('priority').addEventListener('change',()=>{const task=current();if(task)moveIntoPriority(task.id,$('priority').value);});
 $('due-date').addEventListener('change',()=>editDeadline('date'));
 $('due-time').addEventListener('change',()=>editDeadline('time'));
 $('deadline-clear').addEventListener('click',()=>{const task=current();if(!task)return;task.deadlineOverride=true;task.deadline=null;task.alerted=null;finishDeadlineChange();});
 document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;renderList();if(!selected)showTask();}));
 $('search-toggle').addEventListener('click',()=>{const open=$('search-wrap').hidden;$('search-wrap').hidden=!open;$('search-toggle').setAttribute('aria-expanded',open);if(open)$('search').focus();else{query='';$('search').value='';renderList();showTask();}});
 $('search').addEventListener('input',()=>{query=$('search').value.toLowerCase().trim();renderList();if(!selected)showTask();});
 function deleteSelected(){
  const task=current();if(!task)return;const oldVisible=visible(),index=oldVisible.findIndex(t=>t.id===task.id);
  if(rowDeadlineEdit?.id===task.id)rowDeadlineEdit=null;
  deletionHistory.push({task,index:tasks.indexOf(task)});tasks=tasks.filter(t=>t.id!==task.id);
  analysisQueue.delete(task.id);requestedHashes.delete(task.id);
  const remaining=visible();selected=remaining[Math.min(index,remaining.length-1)]?.id||null;save();renderList();showTask();if(selected)focusTask(selected);else $('task-list').focus();StillAlerts.refresh();StillAlerts.sync(tasks,save);
  $('toast-message').textContent='Task deleted';$('undo').hidden=false;$('toast').hidden=false;
 }
 function restoreDeleted(){
  const entry=deletionHistory.pop();if(!entry)return;tasks.splice(Math.min(entry.index,tasks.length),0,entry.task);selected=entry.task.id;filter='all';query='';$('search').value='';save();renderList();showTask();focusTask(selected);$('toast').hidden=true;StillAlerts.refresh();StillAlerts.sync(tasks,save);
 }
 $('delete-task').addEventListener('click',deleteSelected);
 $('undo').addEventListener('click',restoreDeleted);
 $('dismiss-toast').addEventListener('click',()=>{$('toast').hidden=true;});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!e.defaultPrevented){closeDetail();return;}
  const editing='input,textarea,[contenteditable]:not([contenteditable="false"]),.toastui-editor-defaultUI';
  const rowEditing=e.target.matches('[data-row-title]'),textEditing=(e.target.closest(editing)||document.activeElement?.closest(editing))&&!rowEditing;
  if(e.defaultPrevented||e.isComposing)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey&&!textEditing&&!rowEditing&&deletionHistory.length){e.preventDefault();restoreDeleted();return;}
  if((e.key==='Delete'||e.key==='Del')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!textEditing&&current()){e.preventDefault();deleteSelected();return;}
  if(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||textEditing)return;
  if((e.key==='ArrowUp'||e.key==='ArrowDown')&&current()){
   if(rowEditing)finishRowEdit(selected,true);
   e.preventDefault();const peers=visible().filter(t=>!!t.completedAt===!!current().completedAt);
   const index=peers.findIndex(t=>t.id===selected),down=e.key==='ArrowDown',target=peers[index+(down?1:-1)];
   if(target)moveTask(selected,target.id,down);
  }
  if(e.key.toLowerCase()==='n'&&!rowEditing){e.preventDefault();focusNewTask();}
 });
 mobile.addEventListener('change',positionDetail);
 window.addEventListener('storage',e=>{if(e.key===key&&e.newValue!==null){$('storage-status').textContent='Changed in another tab · reload to sync';}});
 function assignPriority(task,priority){if(priority==='urgent'&&task.priority!=='urgent')task.urgentBasePriority=task.priority;else if(priority!=='urgent')delete task.urgentBasePriority;task.priority=priority;}
 function moveIntoPriority(id,priority){
  const task=tasks.find(t=>t.id===id);if(!task||!['urgent','important','unimportant'].includes(priority))return;
  assignPriority(task,priority);task.order=topOrder(!!task.completedAt,task.id);const changed=selected!==id;selected=id;save();renderList();if(changed)showTask();else updateTaskMeta();focusTask(id);
 }
 function formatEstimate(seconds){if(!seconds)return '';const minutes=Math.ceil(seconds/60);return minutes<60?minutes+'m':Math.floor(minutes/60)+'h'+(minutes%60?' '+minutes%60+'m':'');}
 function updateTaskMeta(){const task=current();if(!task)return;$('priority').value=task.completedAt?task.priority:effectivePriority(task);$('estimate-label').textContent=task.estimatedSeconds?'~'+formatEstimate(task.estimatedSeconds):'';$('estimate-label').title=task.estimatedSeconds?'Estimated work time · alert when this much time remains':'Connect OpenRouter to estimate work time';updateDeadlineFields();}
 function updateDeadlineFields(force=false){
  const task=current();if(!task)return;
  $('deadline-clear').disabled=!task.deadline;
  if(!force&&deadlineFieldsTask===task.id&&(document.activeElement===$('due-date')||document.activeElement===$('due-time')))return;
  deadlineFieldsTask=task.id;
  const local=task.deadline?StillDeadlines.localString(new Date(task.deadline.at)):'';
  $('due-date').value=local.slice(0,10);$('due-time').value=local.slice(11,19);
 }
 function findDueButton(id,part){return [...document.querySelectorAll('[data-due-part]')].find(el=>el.dataset.dueTask===id&&el.dataset.duePart===part);}
 function renderRowDeadlineInput(id,part,value){
  const button=findDueButton(id,part);if(!button)return;
  const input=document.createElement('input');input.className='row-due-input row-due-'+part;input.dataset.dueEdit=part;input.dataset.dueTask=id;input.type=part==='date'?'date':'text';input.value=value;
  input.setAttribute('aria-label','Deadline '+part);input.setAttribute('enterkeyhint','done');
  if(part!=='date'){input.inputMode='numeric';input.maxLength=2;input.pattern='[0-9]{1,2}';}
  rowDeadlineEdit={id,part};button.hidden=true;button.before(input);input.focus({preventScroll:true});if(part!=='date')input.select();
 }
 function startRowDeadlineEdit(id,part){
  if(!['date','hour','minute','second'].includes(part))return;
  if(rowDeadlineEdit){if(rowDeadlineEdit.id===id&&rowDeadlineEdit.part===part){document.querySelector('[data-due-edit]')?.focus();return;}if(!finishRowDeadlineEdit(true,false))return;}
  const task=tasks.find(t=>t.id===id);if(!task)return;
  if(selected!==id){document.activeElement?.blur();selected=id;renderList();showTask();}
  const date=task.deadline?new Date(task.deadline.at):new Date();
  const values={date:StillDeadlines.localString(date).slice(0,10),hour:String(date.getHours()).padStart(2,'0'),minute:String(date.getMinutes()).padStart(2,'0'),second:String(date.getSeconds()).padStart(2,'0')};
  renderRowDeadlineInput(id,part,values[part]);
  if(part==='date'){try{document.querySelector('[data-due-edit="date"]')?.showPicker?.();}catch{}}
 }
 function finishRowDeadlineEdit(commit,focus){
  const state=rowDeadlineEdit,input=document.querySelector('[data-due-edit]');if(!state||!input){rowDeadlineEdit=null;return true;}
  const task=tasks.find(t=>t.id===state.id);if(!task){rowDeadlineEdit=null;input.remove();return true;}
  let parsed=null;
  if(commit){
   if(state.part==='date'&&input.value==='')parsed=null;
   else{
    const base=task.deadline?new Date(task.deadline.at):new Date();if(!task.deadline)base.setHours(23,59,59,0);
    const local=StillDeadlines.localString(base);let value;
    if(state.part==='date')value=input.value+'T'+local.slice(11);
    else{
     const number=Number(input.value),max=state.part==='hour'?23:59;
     if(!/^\d{1,2}$/.test(input.value)||number<0||number>max){showMessage('Enter '+state.part+' from 0 to '+max+'.');input.focus();input.select();return false;}
     const time=local.slice(11).split(':');time[{hour:0,minute:1,second:2}[state.part]]=String(number).padStart(2,'0');value=local.slice(0,10)+'T'+time.join(':');
    }
    parsed=StillDeadlines.localDate(value);if(!parsed){showMessage('Choose a valid local date and time.');input.focus();return false;}
   }
  }
  rowDeadlineEdit=null;input.remove();const button=findDueButton(state.id,state.part);if(button)button.hidden=false;
  const changed=commit&&(task.deadline?(!parsed||StillDeadlines.localString(new Date(task.deadline.at))!==StillDeadlines.localString(parsed)):!!parsed);
  if(changed){setManualDeadline(task,parsed);finishDeadlineChange();}else updateCountdowns();
  if(focus)findDueButton(state.id,state.part)?.focus({preventScroll:true});return true;
 }
 function setManualDeadline(task,date){
  task.deadlineOverride=true;task.alerted=null;
  const local=date?StillDeadlines.localString(date):null;
  task.deadline=date?{at:date.getTime(),kind:'calendar',local,expression:'Manually set deadline',key:'manual:'+local,anchor:Date.now(),source:'manual',parserVersion:3}:null;
 }
 function editDeadline(field){
  const task=current();if(!task)return;
  if(field==='date'&&!$('due-date').value){task.deadlineOverride=true;task.deadline=null;task.alerted=null;finishDeadlineChange();return;}
  const existing=task.deadline?StillDeadlines.localString(new Date(task.deadline.at)):StillDeadlines.localString(new Date());
  const date=$('due-date').value||existing.slice(0,10),time=$('due-time').value||'23:59:59';
  const local=date+'T'+time+(time.length===5?':00':'');const parsed=StillDeadlines.localDate(local);
  if(!parsed){$('deadline-feedback').textContent='Choose a valid local date and time.';return;}
  setManualDeadline(task,parsed);
  $('due-date').value=date;$('due-time').value=local.slice(11,19);finishDeadlineChange();
 }
 function finishDeadlineChange(){
  $('deadline-feedback').textContent='';save();renderList();updateTaskMeta();updateDeadlineFields(true);updateAIButton();StillAlerts.refresh();StillAlerts.sync(tasks,save);
 }
 function updateCountdowns(){
  const clock=Date.now();
  document.querySelectorAll('[data-row-deadline]').forEach(container=>{
   const task=tasks.find(t=>t.id===container.dataset.rowDeadline);if(!task)return;const exists=!!task.deadline,date=exists?new Date(task.deadline.at):null;
   container.classList.toggle('no-deadline',!exists);container.querySelector('.row-clock-parts').hidden=!exists;const label=container.querySelector('.due-label');container.classList.toggle('needs-ai',['disconnected','needs-analysis','error','pending'].includes(task.aiState));label.hidden=!exists&&!container.classList.contains('needs-ai');label.textContent=task.aiState==='pending'?'AI…':task.aiState==='error'?'AI failed':task.deadlineOverride?'Manual':task.aiState==='disconnected'?'Connect AI':task.aiState==='needs-analysis'?'Update AI':task.deadline?.source==='openrouter'?'AI':'Due';label.title=task.aiError||task.aiEvidence?.model||'OpenRouter deadline analysis';
   const values=exists?{date:date.toLocaleDateString(undefined,{month:'short',day:'numeric'}),hour:String(date.getHours()).padStart(2,'0'),minute:String(date.getMinutes()).padStart(2,'0'),second:String(date.getSeconds()).padStart(2,'0')}:{date:'+ date'};
   container.querySelectorAll('[data-due-part]').forEach(button=>{const part=button.dataset.duePart;button.textContent=values[part]||'';button.title='Edit deadline '+part+(exists?' · '+date.toLocaleString():'');button.setAttribute('aria-label',button.title);});
  });
  document.querySelectorAll('[data-countdown]').forEach(el=>{
   const task=tasks.find(t=>t.id===el.dataset.countdown);el.hidden=!task?.deadline;if(!task?.deadline)return;
   const at=task.deadline.at;el.dateTime=new Date(at).toISOString();el.textContent=StillDeadlines.format(at,task.completedAt||clock);el.classList.toggle('overdue',!task.completedAt&&at<clock);
   el.title='Due '+new Date(at).toLocaleString()+' · '+task.deadline.expression+(task.estimatedSeconds?' · Estimated work: '+formatEstimate(task.estimatedSeconds):' · Work estimate pending');
   el.setAttribute('aria-label',el.title);
  });
  $('local-clock').textContent=new Date(clock).toLocaleString()+' · '+Intl.DateTimeFormat().resolvedOptions().timeZone;
  updateDeadlineFields();
 }
 const analysisQueue=new Map(),requestedHashes=new Map();let analyzing=false,nextAnalysisAt=0;
 const taskText=task=>task.title+'\n'+task.notes;
 function hash(text){let value=2166136261;for(const ch of text){value^=ch.charCodeAt(0);value=Math.imul(value,16777619);}return (value>>>0).toString(16)+':'+text.length;}
 function applyDeadline(task,deadline){
  if(task.deadlineOverride)return;
  const previous=task.deadline;
  if(deadline?.kind==='relative'&&previous?.key===deadline.key){deadline={...deadline,at:previous.at,anchor:previous.anchor,local:previous.local};}
  if(previous?.key!==deadline?.key){task.alerted=null;}
  task.deadline=deadline;
 }
 function editTitle(id,value){
  const task=tasks.find(t=>t.id===id);if(!task)return;task.title=value;if(selected===id&&$('detail-title').value!==value)$('detail-title').value=value;save();updateRow(task);
 }
 function confirmTitle(id=selected){
  const task=tasks.find(t=>t.id===id);if(!task)return;
  task.title=task.title.trim()||'Untitled task';if(selected===id)$('detail-title').value=task.title;updateRow(task);
  if(task.title===task.confirmedTitle){save();return;}
  task.confirmedTitle=task.title;task.confirmedAt=Date.now();save();requestAI(task.id,'title-confirmed');
 }
 function updateAIButton(){const task=current(),pending=requestedHashes.has(selected);$('update-ai').disabled=pending;$('update-ai').textContent=pending?'Updating...':'Update AI';$('update-ai').title='Replace the deadline and work estimate using OpenRouter';let status=$('ai-result-status');if(!status){status=document.createElement('span');status.id='ai-result-status';status.style.cssText='font-size:11px;color:#999';$('update-ai').before(status);}status.textContent=pending?'OpenRouter pending':task?.aiState==='error'?'AI failed':task?.aiState==='success'?'AI: '+(task.aiEvidence?.model||'OpenRouter'):task?.aiState==='needs-analysis'?'Update AI':StillOpenRouter.isConnected()?'Not analyzed':'Connect OpenRouter';status.title=task?.aiError||(task?.aiEvidence?'Tool: '+task.aiEvidence.tool+' | Request: '+task.aiEvidence.requestId+' | '+new Date(task.aiEvidence.receivedAt).toLocaleString():'No successful OpenRouter tool call for this task');}
 function requestAI(id,trigger){
  if(!['initial','title-confirmed','manual'].includes(trigger))return;
  const task=tasks.find(t=>t.id===id);if(!task)return;
  const fingerprint=hash(taskText(task));if(!StillOpenRouter.isConnected()){task.aiState='disconnected';task.aiError='OpenRouter is not connected. Connect in settings, then click Update AI. No timer was generated.';save();updateAIButton();updateCountdowns();showMessage(task.aiError);return;}if(task.completedAt||(trigger!=='manual'&&task.analysisHash===fingerprint)||requestedHashes.get(id)===fingerprint)return;
  if(trigger==='manual')task.deadlineOverride=false;if(!task.deadlineOverride){task.deadline=null;task.estimatedSeconds=null;task.alerted=null;}task.aiState='pending';task.aiError=null;task.aiEvidence=null;task.aiInput=taskText(task);task.aiRequestedAt=Date.now();save();renderList();updateTaskMeta();StillAlerts.refresh();StillAlerts.sync(tasks,save);requestedHashes.set(id,fingerprint);analysisQueue.set(id,{fingerprint,text:taskText(task),anchor:task.confirmedAt||Date.now()});updateAIButton();runAnalysis();
 }
 async function runAnalysis(){
  if(analyzing||!analysisQueue.size)return;analyzing=true;
  if(Date.now()<nextAnalysisAt){setTimeout(()=>{analyzing=false;runAnalysis();},nextAnalysisAt-Date.now());return;}
  const [id,job]=analysisQueue.entries().next().value;analysisQueue.delete(id);nextAnalysisAt=Date.now()+3100;
  try{
   const pendingTask=tasks.find(t=>t.id===id);if(!pendingTask||pendingTask.completedAt||!StillOpenRouter.isConnected()||hash(taskText(pendingTask))!==job.fingerprint)return;
   const result=await StillOpenRouter.detect(job.text,job.anchor),task=tasks.find(t=>t.id===id);
   if(result&&task&&!task.completedAt&&hash(taskText(task))===job.fingerprint&&StillOpenRouter.isConnected()){
    applyDeadline(task,result.deadline);task.estimatedSeconds=result.estimatedSeconds;task.analysisHash=job.fingerprint;task.aiState='success';task.aiError=null;task.aiEvidence=result.evidence;task.aiInput=job.text;save();renderList();updateTaskMeta();StillAlerts.refresh();StillAlerts.sync(tasks,save);
   }
  }catch(error){const task=tasks.find(t=>t.id===id);if(task&&hash(taskText(task))===job.fingerprint){task.aiState='error';task.aiError=error.message||'OpenRouter request failed';task.aiEvidence=error.evidence||{requestId:null,receivedAt:Date.now(),networkError:task.aiError};task.aiInput=job.text;save();if(selected===id)showMessage(task.aiError);}}finally{if(requestedHashes.get(id)===job.fingerprint)requestedHashes.delete(id);updateAIButton();updateCountdowns();analyzing=false;runAnalysis();}
 }
 function showMessage(message){$('toast-message').textContent=message;$('undo').hidden=true;$('toast').hidden=false;}
 function connectionStatus(){
  $('openrouter-status').textContent=StillOpenRouter.status();$('openrouter-disconnect').hidden=!StillOpenRouter.isConnected();$('openrouter-connect').textContent=StillOpenRouter.isConnected()?'Reconnect OpenRouter':'Connect OpenRouter';updateAIButton();
 }
 $('settings-open').addEventListener('click',()=>{$('ntfy-topic').value=StillAlerts.topic();$('ntfy-token').value=StillAlerts.token();connectionStatus();$('settings-dialog').showModal();});
 $('settings-close').addEventListener('click',()=>$('settings-dialog').close());
 $('openrouter-connect').addEventListener('click',()=>StillOpenRouter.connect().catch(()=>{$('openrouter-status').textContent='Connection could not start. Try again.';}));
 $('openrouter-disconnect').addEventListener('click',()=>{StillOpenRouter.disconnect();analysisQueue.clear();requestedHashes.clear();updateAIButton();});
 StillOpenRouter.onStatus(connectionStatus);connectionStatus();
 $('enable-notifications').addEventListener('click',async()=>{$('notification-status').textContent=await StillAlerts.enable();});
 $('ntfy-save').addEventListener('click',()=>{try{StillAlerts.configure($('ntfy-topic').value.trim(),$('ntfy-token').value);StillAlerts.sync(tasks,save);}catch(e){$('ntfy-status').textContent=e.message;}});
 StillAlerts.onStatus(message=>{$('ntfy-status').textContent=message;});
 let zoneToken=Intl.DateTimeFormat().resolvedOptions().timeZone+':'+new Date().getTimezoneOffset();
 function tick(){
  const nextZone=Intl.DateTimeFormat().resolvedOptions().timeZone+':'+new Date().getTimezoneOffset();
  if(nextZone!==zoneToken){zoneToken=nextZone;for(const task of tasks){if(task.deadline?.kind==='calendar'&&task.deadline.local){const date=StillDeadlines.localDate(task.deadline.local);if(date)task.deadline.at=date.getTime();}}save();StillAlerts.refresh();}
  const signature=tasks.map(t=>t.id+':'+effectivePriority(t)).join('|');
  if(signature!==groupSignature&&!dragId&&!pointerDrag){renderList();updateTaskMeta();}
  updateCountdowns();StillAlerts.tick(tasks,save,showMessage);StillAlerts.sync(tasks,save);
 }
 // Remove timers produced by the retired local text parser. No automatic AI calls on reload.
 for(const task of tasks){if(!task.deadlineOverride&&task.deadline?.source==='local'){task.deadline=null;task.estimatedSeconds=null;task.analysisHash=null;task.alerted=null;task.aiState='needs-analysis';task.aiError='Click Update AI to calculate the deadline and work estimate.';}}
 for(const task of tasks){if(task.aiState==='needs-analysis')task.aiError='Click Update AI to calculate the deadline and work estimate.';}
 renderList();showTask();save();
 setInterval(tick,1000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
 StillOpenRouter.finish().then(connectionStatus).catch(()=>{});
 tick();
})();
