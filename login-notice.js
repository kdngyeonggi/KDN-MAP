const LABELS={reinforcement:"보강공사",low_voltage:"저압",high_voltage:"고압",relay_table:"보강공사_중계표"};
export function noticeSession(uid,authTime,host=window){
 const key="kdn_notice_session_v1:"+encodeURIComponent(uid);
 function checked(){
  if(!authTime)return false;
  for(const kind of ["localStorage","sessionStorage"]){
   try{if(host[kind].getItem(key)===authTime)return true;}catch{}
  }
  return false;
 }
 function markChecked(){
  if(!authTime)return;
  for(const kind of ["localStorage","sessionStorage"]){
   try{host[kind].setItem(key,authTime);return;}catch{}
  }
 }
 return {checked,markChecked};
}

export async function confirmLoginNotices(host,notices){
 if(!notices.length)return;
 const dialog=document.createElement("dialog");
 dialog.className="login-notice";
 dialog.setAttribute("aria-labelledby","loginNoticeHeading");
 const make=(tag,value,cls)=>{
  const el=document.createElement(tag);el.textContent=value;
  if(cls)el.className=cls;
  return el;
 };
 const heading=make("h1","공지사항");heading.id="loginNoticeHeading";
 const scroller=make("div","","login-notice-scroll");
 for(const {part,title,text} of notices){
  const article=document.createElement("article");
  article.append(make("span",LABELS[part]||part,"pill"),make("h2",title),make("p",text));
  scroller.append(article);
 }
 const button=make("button","확인","primary");
 button.type="button";
 dialog.append(make("div","KDN MAP · 작업 공지","tinylabel"),heading,scroller,button);
 const loading=[...host.childNodes];
 host.replaceChildren(dialog);
 await new Promise(resolve=>{
  dialog.addEventListener("cancel",e=>e.preventDefault());
  button.addEventListener("click",resolve,{once:true});
  if(typeof dialog.showModal==="function")dialog.showModal();
  else{dialog.setAttribute("open","");dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");}
  button.focus();
 });
 if(dialog.parentNode===host)host.replaceChildren(...loading);
}
