export function demoTasks(){
 const now=Date.now();
 const task=(id,title,priority,order,notes='',extra={})=>({id,title,confirmedTitle:title,notes,createdAt:now-order*1000,confirmedAt:now,priority,order,completedAt:null,...extra});
 const due=(hours)=>({at:now+hours*3600000,kind:'calendar',source:'manual',key:'demo:'+hours,expression:'Sample deadline'});
 return [
  task('demo-launch','Review the launch checklist','important',0,'# Ready for launch\n\nKeep the next step clear.\n\n## Before sharing\n\n- [x] Finish the first draft\n- [x] Check the mobile layout\n- [ ] Write a short release note\n- [ ] Share with the team\n\n## Release notes\n\nA quieter place for **tasks and notes**.\n\nCapture the details here, then get back to the work.\n\n> One useful step at a time.',{deadline:due(1.5),deadlineOverride:true,estimatedSeconds:2700}),
  task('demo-week','Plan the week ahead','important',1,'## This week\n\nChoose three things that matter. Leave room to think.'),
  task('demo-draft','Finish the project outline','important',2,'## Outline\n\n1. The problem\n2. The smallest useful solution\n3. The next step',{deadline:due(72),deadlineOverride:true}),
  task('demo-walk','Make time for a walk','important',3),
  task('demo-read','Read a saved article','unimportant',4),
  task('demo-links','Organize reference links','unimportant',5,'A few ideas for later.'),
  task('demo-done','Set up the project workspace','important',6,'A clean start.',{completedAt:now-1800000}),
  task('demo-archive','Archive last week\u2019s notes','unimportant',7,'',{completedAt:now-3600000})
 ];
}
