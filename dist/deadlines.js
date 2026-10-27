/* Deadline formatting and validated manual dates use the device's local calendar and clock. */
(() => {
 'use strict';
 const normalize=s=>s.toLowerCase().replace(/\s+/g,' ').trim();
 const expressionKey=s=>normalize(s).replace(/^(?:due|deadline)\s*(?:(?:is|on|by|at)\s+)?[:\-]?\s*/,'').replace(/^(?:by|before|until|in|within|on|at)\s+/,'');
 const localString=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')+'T'+[d.getHours(),d.getMinutes(),d.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');
 function localDate(value){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value||''))return null;
  const nums=value.match(/\d+/g).map(Number),d=new Date(nums[0],nums[1]-1,nums[2],nums[3],nums[4],nums[5]||0);
  return d.getFullYear()===nums[0]&&d.getMonth()===nums[1]-1&&d.getDate()===nums[2]&&d.getHours()===nums[3]&&d.getMinutes()===nums[4]?d:null;
 }
 function format(at,now=Date.now()){
  const remaining=at-now,seconds=Math.max(0,Math.ceil(Math.abs(remaining)/1000)),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),mins=Math.floor(seconds%3600/60),secs=seconds%60;
  return (remaining<0?'−':'')+(days?days+'D ':'')+[hours,mins,secs].map(n=>String(n).padStart(2,'0')).join(':');
 }
 window.StillDeadlines={format,normalize,expressionKey,localDate,localString};
})();
