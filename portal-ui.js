const PARTS={reinforcement:"보강공사",low_voltage:"저압",high_voltage:"고압",relay_table:"보강공사_중계표"};
const REGIONS=["1권역","2권역","3권역","4권역","5권역"];
const menus=[
 ["map","지도","지도에서 계기를 확인하고 현장 작업을 관리해요.","FIELD MAP","mapc",'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zm6-3v15m6-12v15"/>'],
 ["history","작업내역 확인","계기번호·계약번호로 작업결과와 작업자를 확인해요.","WORK RECORDS","histc",'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-6 3h3"/>'],
 ["workfiles","엑셀 다운로드","파트별 변경내역을 내려받고 작업 상태를 관리해요.","WORK EXPORT","filec",'<path d="M5 3h10l4 4v14H5zM14 3v5h5m-7 3v6m-3-3 3 3 3-3"/>'],
 ["upload","엑셀업로드","파트별 엑셀을 검사하고 지도 자료를 갱신해요.","MAP DATA","uplc",'<path d="M6 3h8l4 4v5M6 3v17h8M14 3v5h5m-2 13v-7m-3 3 3-3 3 3"/>'],
 ["workers","작업자관리","파트와 담당 권역, 계정 사용 상태를 관리해요.","FIELD TEAM","workc",'<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2m0-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 4 5"/>'],
];
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=n=>Number(n||0).toLocaleString("ko-KR");
const kv=(arr)=>'<div class="kv">'+arr.map(([k,v])=>'<div><span>'+esc(k)+'</span><b>'+esc(v)+'</b></div>').join("")+'</div>';
const icon=m=>'<span class="tileicon '+m[4]+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+m[5]+'</svg></span>';
const btn=(txt,act,cls="sub")=>'<button type="button" class="'+cls+'" data-act="'+act+'">'+esc(txt)+'</button>';
const input=(id,title,extra="")=>'<label class="field" for="'+id+'">'+title+'</label><input id="'+id+'" '+extra+'>';
const drop=(id,many)=>'<label class="drop"><strong>엑셀 파일 선택</strong><span>이곳에 파일을 끌어놓거나 눌러서 선택하세요 · .xlsx</span><input aria-label="엑셀 파일 선택" type="file" id="'+id+'" accept=".xlsx" '+(many?"multiple":"")+'></label><p class="mini" data-filetext>선택한 파일 없음</p>';
function bindFiles(root,cb){const el=root.querySelector("input[type=file]"),label=el.parentElement;function pick(files){files=Array.from(files);if(!el.multiple&&files.length>1){cb([], "엑셀 한 개만 선택하세요.");return;}root.querySelector("[data-filetext]").textContent=files.map(f=>f.name).join(" · ")||"선택한 파일 없음";cb(files);}
 el.onchange=()=>pick(el.files);label.ondragover=e=>{e.preventDefault();label.classList.add("hot");};label.ondragleave=()=>label.classList.remove("hot");label.ondrop=e=>{e.preventDefault();label.classList.remove("hot");pick(e.dataTransfer.files);};}
function notice(node,msg,bad=false){if(!node)return;node.className="notice"+(bad?" err":"");node.textContent=msg||"";}
export function mount(host,options){
 const {me,api,connected}=options;let seq=0,cleanup=()=>{},resetLock=false;
 if(me.role!=="admin"||me.blocked)throw Error("관리자 계정만 사용할 수 있습니다.");
 const adminMenu=["permissions","권한관리","관리자 명단과 파트별 관리 범위를 지정해요.","ACCESS CONTROL","admc",'<path d="M12 2 4 5v6c0 5 3 8 8 11 5-3 8-6 8-11V5z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'];
 const shown=me.owner?[...menus,adminMenu]:menus;
 const action=(el,key,fn)=>{const b=el.querySelector('[data-act="'+key+'"]');if(b)b.onclick=fn;return b;};
 const has=cap=>me.capabilities.includes(cap);
 function shell(body){host.innerHTML='<div class="frame"><header class="topbar"><div class="brand"><i class="brandmark">K</i><span>KDN MAP</span><span class="wordgap">경기 업무 공간</span></div><div class="identity"><span class="badge"><i class="dot"></i>관리자</span><span class="idname">'+esc(me.name)+'</span>'+btn("로그아웃","exit","plain")+'</div></header><div id="stage">'+body+'</div><footer class="foot"><span>KDN MAP · 경기 현장 운영</span><span>© 김우진</span></footer></div>';action(host,"exit",options.logout);return host.querySelector("#stage");}
 function change(route){location.hash=route==="home"?"menu":route;}
 function gate(cap){return !connected?"Firebase 관리 기능 연결을 확인하세요.":!has(cap)?"이 기능의 변경 권한이 없습니다.":"";}
 function home(){
 const page=shell('<section class="hero"><img class="art" src="portal-art.svg" alt=""><div class="hero-copy"><div class="eyebrow">KDN MAP &nbsp;/&nbsp; OPERATIONS</div><h1>관리자 메뉴</h1><p>지도와 현장 업무에 필요한 도구를 선택하세요.</p><span class="pill">'+esc(me.parts.length===4?"전체 4개 파트":me.parts.map(p=>PARTS[p]).join(" · "))+'</span></div></section><div class="sec-head"><h2>업무 선택</h2><small>관리자 업무 도구 &nbsp; 01 — 0'+shown.length+'</small></div><nav class="cards" aria-label="관리자 메뉴">'+shown.map((m,i)=>'<button type="button" class="choice" data-act="'+m[0]+'">'+icon(m)+'<span><span class="node">0'+(i+1)+' / '+m[3]+'</span><strong>'+m[1]+'</strong><p>'+m[2]+'</p></span><span class="arr" aria-hidden="true">↗</span></button>').join("")+'</nav>');
 for(const m of shown)action(page,m[0],m[0]==="map"?options.openMap:()=>change(m[0]));
 }
 function head(title,desc){const root=shell('<div class="screenhead">'+btn("‹  관리자 메뉴","back","crumb")+'<h1>'+title+'</h1><p>'+desc+'</p></div><div id="content"></div>');
 action(root,"back",()=>change("home"));return root.querySelector("#content");}
 function partButtons(part){return '<div class="chips" aria-label="파트 선택">'+me.parts.map(p=>'<button type="button" data-part="'+p+'" aria-pressed="'+(part===p)+'">'+esc(PARTS[p])+'</button>').join("")+'</div>';}
 function bindParts(el,fn){el.querySelectorAll("[data-part]").forEach(b=>b.onclick=()=>fn(b.dataset.part));}
 function upload(part=me.parts[0]){
  const el=head("엑셀업로드","파트를 선택하고 엑셀을 검사한 뒤, 확인한 데이터만 지도에 반영합니다.");
  const rule=gate("upload");let file=null,converted=null,ticket="",busy=false,worker=null,closed=false;
  const done=()=>{closed=true;if(worker)worker.terminate();window.removeEventListener("beforeunload",leaving);};cleanup=done;
  function leaving(e){if(busy){e.preventDefault();e.returnValue="";}}window.addEventListener("beforeunload",leaving);
  el.innerHTML='<div class="panes"><section class="panel"><div class="tinylabel">01 / SOURCE</div><h3>반영할 파트</h3>'+partButtons(part)+'<hr class="line"><h3>단일 시트 엑셀</h3>'+drop("mapFile",false)+'<p class="mini">선택 파트: '+PARTS[part]+' · 원본 엑셀은 이 브라우저에서 처리됩니다.</p>'+btn("엑셀 검사 · 미리보기","check","primary wide")+'</section><section class="panel"><div class="tinylabel">02 / REVIEW</div><h3>반영 내용</h3><div id="stats">파일을 검사하면 반영 건수를 확인할 수 있습니다.</div><div class="notice" role="status"></div>'+btn("지도에 반영","apply","primary wide")+'</section></div>';
  const msg=el.querySelector(".notice"),stats=el.querySelector("#stats"),check=action(el,"check",inspect),apply=action(el,"apply",publish);
  function controls(){check.disabled=!!rule||busy||!file;apply.disabled=!!rule||busy||!converted;el.querySelector("input").disabled=busy;el.querySelectorAll("[data-part]").forEach(b=>b.disabled=busy);}
  function setfile(f,err){if(busy)return;file=f[0]||null;converted=null;ticket="";stats.textContent="파일을 검사하면 반영 건수를 확인할 수 있습니다.";notice(msg,err||rule);controls();}
  bindFiles(el,setfile);bindParts(el,p=>{done();upload(p);});
  function convert(){return new Promise((resolve,reject)=>{worker=new Worker(new URL("./excel-worker.js?v=47",location.href));worker.onmessage=({data})=>{if(closed)return;if(data.type==="status")notice(msg,data.text);else if(data.type==="done")resolve(data);else if(data.type==="error")reject(Error(data.text));};worker.onerror=()=>reject(Error("엑셀 변환기를 시작하지 못했습니다."));worker.postMessage({file,part});});}
  async function inspect(){
   if(busy||rule)return;busy=true;converted=null;controls();
   try{if(!file||!file.name.toLowerCase().endsWith(".xlsx"))throw Error(".xlsx 파일을 선택하세요.");if(options.preview)throw Error("화면 미리보기에서는 실제 엑셀을 처리하지 않습니다.");
    const base=await api("/api/publish/preview",{method:"POST",body:{part}});if(closed)return;
    const c=await convert();if(closed)return;ticket=base.ticket;converted=c;const t=c.report;
    stats.innerHTML=kv([["선택 파트",PARTS[part]],["입력 시트",t.source_sheet],["반영 계기",num(t.rows)],["마커",num(t.groups)],["좌표 제외",num(t.skipped_no_coord)],["중복 제외",num(t.removed_priority_duplicates)],["계기번호 등 누락",num(t.skipped_no_id)],["데이터 파일",num(t.tiles)]]);
    notice(msg,"검사 완료. 아직 지도는 바뀌지 않았습니다.");
   }catch(e){if(!closed)notice(msg,e.message,true);}finally{worker?.terminate();worker=null;busy=false;if(!closed)controls();}
  }
  async function publish(){
   if(busy||rule||!converted||!confirm(PARTS[part]+" "+num(converted.report.rows)+"건을 지도에 반영할까요?"))return;
   busy=true;controls();let committing=false;
   try{const receipts=[];for(const [i,f] of converted.files.entries()){
     if(closed)return;notice(msg,"지도 파일 전송 "+(i+1)+" / "+converted.files.length);
     const q=new URLSearchParams({part,name:f.name}),r=await api("/api/publish/blob?"+q,{method:"POST",body:new Blob([f.bytes],{type:"application/octet-stream"}),headers:{"X-KDN-Preview":ticket}});receipts.push(r.receipt);
    }
    if(closed)return;committing=true;notice(msg,"선택한 파트를 한 번에 반영하는 중…");
    const result=await api("/api/publish/commit",{method:"POST",body:{part,ticket,receipts}});
    converted=null;ticket="";notice(msg,result.changed?"저장소 반영 완료. GitHub Pages 배포가 끝나면 지도를 새로고침하세요.":"기존 지도와 동일해 변경하지 않았습니다.");
   }catch(e){converted=null;ticket="";if(!closed)notice(msg,e.message+(committing?" 최종 반영 여부를 확인한 뒤 다시 검사하세요.":" 다시 검사한 뒤 시도하세요."),true);}
   finally{busy=false;if(!closed)controls();}
  }
  controls();notice(msg,rule);
 }
 function workers(part=me.parts[0]){
  const gen=++seq,el=head("작업자관리","파트별 명단에서 작업자의 담당 범위와 사용 상태를 변경합니다.");
  let rows=[],pick="",regions=new Set(),busy=false;const rule=gate("workers");
  el.innerHTML='<div class="panel">'+partButtons(part)+'</div><div class="panes"><section class="panel"><div class="tinylabel">01 / DIRECTORY</div><div class="titleline spread"><h3>파트 작업자 <span id="total" class="badge">0</span></h3>'+btn("＋ 작업자 추가","addWorker","sub")+'</div>'+input("searchWorker","이름 검색",'type="search" placeholder="현재 명단에서 찾기"')+'<ul class="worklist"></ul></section><section class="panel"><div class="tinylabel">02 / ASSIGNMENT</div><h3>작업자 권한</h3>'+input("workerName","작업자 이름",'maxlength="45" autocomplete="off" placeholder="목록에서 선택하거나 이름 입력"')+'<div id="current" class="mini"></div><div id="regions"></div><hr class="line"><div class="actions">'+btn("권한 부여 · 저장","grant","primary")+btn("사용 제한","restrict","danger")+btn("제한 해제","restore","sub")+'</div><div class="notice" role="status"></div></section></div>';
  const q=el.querySelector("#searchWorker"),name=el.querySelector("#workerName"),list=el.querySelector(".worklist"),msg=el.querySelector(".notice");
  function selected(){return rows.find(r=>r.name===name.value.trim());}
  function showList(){const rr=rows.filter(r=>r.parts.includes(part)),visible=rr.filter(r=>r.name.includes(q.value.trim()));el.querySelector("#total").textContent=rr.length;list.replaceChildren();
   for(const r of visible){const li=document.createElement("li"),b=document.createElement("button");b.setAttribute("aria-pressed",String(pick===r.name));b.innerHTML='<span><b>'+esc(r.name)+'</b> <small>'+esc(r.regions.join(" · "))+'</small></span><span class="tag '+(r.blocked?"warn":"")+'">'+(r.pending?"계정 연결 대기":r.blocked?"사용 제한":"사용 중")+'</span>';b.onclick=()=>{name.value=r.name;select();};li.append(b);list.append(li);}
   if(!visible.length)list.textContent="표시할 작업자가 없습니다.";
  }
  function details(){const r=selected();el.querySelector("#current").textContent=r?PARTS[r.parts[0]]+" · "+(r.pending?"계정 연결 대기":r.blocked?"사용 제한":"사용 중"):"등록된 로그인 계정에 권한을 부여합니다.";
   const g=el.querySelector("#regions");g.innerHTML=part==="reinforcement"?'<label class="field">권역 선택 · 여러 개 선택 가능</label><div class="chips">'+REGIONS.map(n=>'<button type="button" aria-pressed="'+regions.has(n)+'" data-region="'+n+'">'+n+'</button>').join("")+'</div>':"";
   g.querySelectorAll("button").forEach(b=>{b.disabled=busy||!!rule;b.onclick=()=>{const n=b.dataset.region;regions.has(n)?regions.delete(n):regions.add(n);details();};});
   const disabled=busy||!!rule||!name.value.trim();el.querySelector('[data-act=grant]').disabled=disabled||(part==="reinforcement"&&!regions.size);
   el.querySelector('[data-act=restrict]').disabled=disabled||!r||!r.parts.includes(part)||r.blocked;el.querySelector('[data-act=restore]').disabled=disabled||!r||!r.parts.includes(part)||!r.blocked;
  }
  function select(){pick=name.value.trim();const r=selected();regions=new Set(r?.parts.includes(part)?r.regions:[]);showList();details();}
  async function load(){const data=connected?(await api("/api/workers")).workers:options.baseline;if(seq!==gen)return;rows=data;select();}
  async function save(act){if(busy||rule)return;const n=name.value.trim(),r=selected();const label=act==="grant"?(PARTS[part]+" "+[...regions].join(" ")+" 권한 부여"):act==="restrict"?"사용 제한":"사용 제한 해제";if(!window.confirm(n+" · "+label+(act==="grant"&&r&&!r.parts.includes(part)?" (이전 파트에서 이동)":"")+" 하시겠습니까?"))return;
   try{busy=true;details();const ver=r?.version??(await api("/api/person?name="+encodeURIComponent(n))).version;const res=await api("/api/workers",{method:"POST",body:{part,name:n,regions:[...regions],action:act,version:ver}});await load();notice(msg,n+(res.pending?" · 명단에 추가했습니다. 로그인 계정 등록 후 다시 저장하면 연결됩니다.":" · 저장되었습니다."));}catch(e){notice(msg,e.message,true);try{await load();}catch{}}finally{busy=false;details();}}
  const addBtn=action(el,"addWorker",()=>{name.value="";select();name.focus();notice(msg,"추가할 이름을 입력한 뒤 권한 부여 · 저장을 누르세요.");});addBtn.disabled=!!rule;
  bindParts(el,p=>workers(p));name.oninput=select;q.oninput=showList;["grant","restrict","restore"].forEach(k=>action(el,k,()=>save(k)));details();notice(msg,rule);load().catch(e=>notice(msg,e.message,true));
 }
 function permissions(){
  const gen=++seq,el=head("권한관리","관리자를 이름으로 추가하고, 관리할 파트와 사용할 도구를 지정합니다.");
  let admins=[],people=[],regions=new Set(),caps=new Set(),busy=false;const labels={upload:"엑셀업로드",workers:"작업자관리",reset:"Firebase 초기화"};
  el.innerHTML='<div class="panes"><section class="panel"><div class="tinylabel">01 / ADMINISTRATORS</div><div class="titleline spread"><h3>관리자 명단 <span id="atotal" class="badge"></span></h3>'+btn("＋ 관리자 추가","addAdmin")+'</div>'+input("findAdmin","이름 검색",'type="search" placeholder="관리자 찾기"')+'<ul class="worklist"></ul></section><section class="panel"><div class="tinylabel">02 / PERMISSIONS</div><h3>관리자 권한 설정</h3>'+input("adminName","관리자 이름",'maxlength="45" placeholder="목록에서 선택하거나 이름 입력"')+'<p class="mini" id="astate"></p><label class="field">담당 파트 · 여러 개 선택 가능</label><div class="chips" id="aparts"></div><label class="field">추가 관리 기능</label><div class="chips" id="acaps"></div><p class="mini">Firebase 초기화를 허용하면 위에서 선택한 담당 파트의 작업 상태를 초기화할 수 있습니다. 마커 메모는 유지됩니다. 권한관리는 김우진 전용입니다.</p><hr class="line"><div class="actions">'+btn("관리자 권한 저장","saveAdmin","primary")+btn("관리자 권한 회수","revokeAdmin","danger")+'</div><div class="notice" role="status"></div></section></div>';
  const field=el.querySelector("#adminName"),q=el.querySelector("#findAdmin"),msg=el.querySelector(".notice");
  const selected=()=>admins.find(r=>r.name===field.value.trim());
  function render(){
   const rr=selected(),immutable=field.value.trim()==="김우진",disabled=!connected||busy||immutable;
   el.querySelector("#atotal").textContent=admins.length;const list=el.querySelector(".worklist");list.replaceChildren();
   for(const r of admins.filter(x=>x.name.includes(q.value.trim()))){const li=document.createElement("li"),b=document.createElement("button");b.setAttribute("aria-pressed",String(r===rr));b.innerHTML='<span><b>'+esc(r.name)+'</b><br><small>'+esc(r.parts.map(p=>PARTS[p]).join(" · "))+'</small></span><span class="tag">'+(r.name==="김우진"?"총괄":r.pending?"연결 대기":"관리자")+'</span>';b.onclick=()=>{field.value=r.name;select();};li.append(b);list.append(li);}
   el.querySelector("#astate").textContent=immutable?"전체 권한 고정":rr?.pending?"계정 연결 대기 · 로그인 계정을 등록한 뒤 저장하세요.":rr?(rr.caps?.includes("reset")?"등록된 관리자 · Firebase 초기화 허용":"등록된 관리자 · Firebase 초기화 미허용"):"새 관리자를 명단에 추가합니다.";
   for(const [id,all,set] of [["aparts",PARTS,regions],["acaps",labels,caps]]){const box=el.querySelector("#"+id);box.replaceChildren();for(const [k,l] of Object.entries(all)){const b=document.createElement("button");b.type="button";b.textContent=l;b.setAttribute("aria-pressed",String(immutable||set.has(k)));b.disabled=disabled;b.onclick=()=>{set.has(k)?set.delete(k):set.add(k);render();};box.append(b);}}
   el.querySelector("[data-act=saveAdmin]").disabled=disabled||!field.value.trim()||!regions.size;el.querySelector("[data-act=revokeAdmin]").disabled=disabled||!rr;
  }
  function select(){const r=selected();regions=new Set(r?.parts||[]);caps=new Set(r?.caps||[]);render();}
  async function load(){const result=connected?await Promise.all([api("/api/admins"),api("/api/workers")]):[{admins:options.baselineAdmins||[]},{workers:options.baseline}];if(gen!==seq)return;admins=result[0].admins;people=result[1].workers;select();}
  async function save(actionType){if(busy||!connected)return;const n=field.value.trim(),r=selected()||people.find(x=>x.name===n);const grant=actionType==="grant";
   const change=grant&&caps.has("reset")?"\\nFirebase 초기화 허용: "+[...regions].map(k=>PARTS[k]).join(", "):r?.caps?.includes("reset")?"\\nFirebase 초기화 권한을 회수합니다.":"";
   if(!window.confirm(n+" · "+(grant?"담당 파트: "+[...regions].map(k=>PARTS[k]).join(", "):"관리자 권한 회수")+change+"\\n저장할까요?"))return;
   try{busy=true;render();const ver=r?.version??(await api("/api/person?name="+encodeURIComponent(n))).version;const out=await api("/api/admins",{method:"POST",body:{name:n,parts:[...regions],caps:[...caps],action:actionType,version:ver}});await load();notice(msg,n+(out.pending?" · 명단에 추가했습니다. 로그인 계정 등록 후 다시 저장해 연결하세요.":" · 변경되었습니다."));}catch(e){notice(msg,e.message,true);try{await load();}catch{}}finally{busy=false;render();}}
  action(el,"addAdmin",()=>{field.value="";select();field.focus();notice(msg,"추가할 관리자 이름과 담당 파트를 선택하세요.");}).disabled=!connected;
  action(el,"saveAdmin",()=>save("grant"));action(el,"revokeAdmin",()=>save("revoke"));field.oninput=select;q.oninput=render;
  render();if(!connected)notice(msg,"Firebase 관리 기능 연결 전입니다. 기존 명단을 표시합니다.");load().catch(e=>notice(msg,e.message,true));
 }
 function historyView(part=me.parts.length>1?"all":me.parts[0],which="any",value=""){
  const el=head("작업내역 확인","계기번호 또는 계약번호(고객번호)로 계기별 작업결과와 마지막 작업자를 확인합니다.");
  const ac=new AbortController();let service,items=[],page=0,busy=false;
  cleanup=()=>{ac.abort();service?.clear();};
  const parts=partButtons(part).replace('aria-label="파트 선택">','aria-label="파트 선택">'+(me.parts.length>1?'<button type="button" data-part="all" aria-pressed="'+(part==="all")+'">담당 전체</button>':""));
  el.innerHTML='<section class="panel"><div class="tinylabel">WORK RECORDS</div><h3>조회할 파트</h3>'+parts+
   '<form class="record-search"><div><label class="field" for="recordKind">검색 기준</label><select id="recordKind"><option value="any">계기번호 또는 계약번호</option><option value="meter">계기번호</option><option value="contract">계약번호(고객번호)</option></select></div>'+
   '<div><label class="field" for="recordValue">조회할 번호</label><input id="recordValue" type="search" maxlength="120" autocomplete="off" required placeholder="앞자리 0을 포함한 전체 번호"></div><button class="primary" type="submit">조회</button></form>'+
   '<p class="mini">'+(options.preview?"예시 계기번호 00101 · 계약번호 000123":"같은 계약의 계기가 여러 대이면 각 계기를 따로 표시합니다.")+'</p></section>'+
   '<section class="panel record-panel" aria-label="조회 결과"><h3>조회 결과</h3><div class="notice" role="status">번호를 입력하고 조회하세요.</div><div data-results></div></section>';
  const form=el.querySelector("form"),kind=el.querySelector("#recordKind"),val=el.querySelector("#recordValue"),msg=el.querySelector(".notice"),out=el.querySelector("[data-results]");
  kind.value=which;val.value=value;
  bindParts(el,p=>{cleanup();historyView(p,kind.value,val.value);});
  function paint(){
   out.replaceChildren();if(!items.length)return;
   const size=25, pages=Math.ceil(items.length/size);page=Math.max(0,Math.min(page,pages-1));
   const rowHtml=items.slice(page*size,(page+1)*size).map(it=>{
     const r=it.row,work=it.change||it.past, label=it.change?"변경됨":it.past?"이전 작업 기록":"현재 변경 없음";
     const sub=it.orphan?"현재 지도에 없는 기록":it.past?"현재 변경값 없음":it.pastUnknown?"이전 로그 확인 불가":"";
     return '<tr><td>'+esc(PARTS[it.part])+'</td><td><b>'+esc(r.meter||"—")+'</b><small>'+esc(r.branch||r.address)+'</small></td><td>'+esc(r.contract||"—")+'</td>'+
       '<td><span class="result-tag '+(it.change?"changed":it.past?"earlier":"")+'">'+label+'</span><small>'+esc(sub)+'</small></td>'+
       '<td>'+esc(work?(work.result||"상태 해제"):"—")+'</td><td>'+esc(work?(work.worker||"기록 없음"):"—")+'</td><td class="workdate">'+esc(work?.when||"—")+'</td></tr>';
   }).join("");
   out.innerHTML='<div class="record-table-scroll" tabindex="0" aria-label="계기별 작업내역"><table class="record-table"><thead><tr>'+["파트","계기번호","계약번호","변경 여부","작업결과","작업자","작업일시"].map(x=>'<th scope="col">'+x+'</th>').join("")+'</tr></thead><tbody>'+rowHtml+'</tbody></table></div>'+
    (pages>1?'<div class="record-pages">'+btn("이전","prevPage")+'<span>'+(page+1)+' / '+pages+'</span>'+btn("다음","nextPage")+'</div>':"");
   if(pages>1){action(out,"prevPage",()=>{page--;paint();}).disabled=page===0;action(out,"nextPage",()=>{page++;paint();}).disabled=page===pages-1;}
  }
  const clearResults=()=>{items=[];page=0;out.replaceChildren();notice(msg,"번호를 입력하고 조회하세요.");};kind.onchange=clearResults;val.oninput=clearResults;
  form.onsubmit=async event=>{
   event.preventDefault();const value=val.value.trim();if(!value||busy)return;
   busy=true;items=[];page=0;out.replaceChildren();for(const c of form.elements)c.disabled=true;
   try {
    service=await options.records();if(ac.signal.aborted)return;
    const errors=[];for(const p of (part==="all"?me.parts:[part])){
      try{notice(msg,PARTS[p]+" · 조회 중…");const rows=await service.lookup(p,kind.value,value,{signal:ac.signal,progress:t=>notice(msg,PARTS[p]+" · "+t)});for(const row of rows)items.push(row);}
      catch(e){if(ac.signal.aborted)return;errors.push(PARTS[p]+": "+e.message);}
    }
    if(ac.signal.aborted)return;
    items.sort((a,b)=>Number(!!b.change)-Number(!!a.change)||((b.change||b.past)?.time||0)-((a.change||a.past)?.time||0)||a.row.meter.localeCompare(b.row.meter,"ko"));
    const result=items.length?"일치하는 계기·기록 "+num(items.length)+"건 · 현재 변경 "+num(items.filter(r=>r.change).length)+"건":
      errors.length?"조회가 완료되지 않았습니다.":"현재 지도 자료와 저장된 변경값에서 일치하는 번호를 찾지 못했습니다.";
    notice(msg,result+(errors.length?" 확인하지 못한 파트: "+errors.join(" / "):""),!!errors.length);paint();
   }catch(e){if(!ac.signal.aborted)notice(msg,e.message,true);}
   finally{busy=false;if(!ac.signal.aborted)for(const c of form.elements)c.disabled=false;}
  };
 }
 function workFiles(part=me.parts[0]){
  const el=head("엑셀 다운로드","선택한 파트의 작업내역을 엑셀로 내려받습니다.");
  const allowed=has("reset"),ac=new AbortController();let busy=false,service;
  cleanup=()=>{ac.abort();service?.clear();window.removeEventListener("beforeunload",beforeLeave);};
  function beforeLeave(e){if(resetLock){e.preventDefault();e.returnValue="";}}
  el.innerHTML='<section class="panel"><h3>대상 파트</h3>'+partButtons(part)+'</section><div class="panes"><section class="panel"><div class="tinylabel">01 / EXPORT</div><h3>작업내역 엑셀</h3>'+
   '<p class="mini">상태를 변경한 계기만 포함합니다. 계기별 마지막 작업결과와 마커의 현재 메모를 함께 내려받습니다.</p><label class="field" for="resultFilter">작업결과</label>'+
   '<select id="resultFilter">'+["","모뎀설치","작업불가","재방문"].map(s=>'<option value="'+s+'">'+(s||"전체 변경상태")+'</option>').join("")+'</select>'+
   btn("엑셀 다운로드","downloadWork","primary wide")+'<div id="downloadNotice" class="notice" role="status"></div></section>'+
   (allowed?'<section class="panel reset-card"><div class="tinylabel">02 / RESET</div><h3>Firebase 초기화</h3><p>대상 파트: <b>'+esc(PARTS[part])+'</b></p><p class="mini">이 파트의 작업 상태를 최신 엑셀 기준으로 되돌립니다. 메모와 이전 작업 로그는 유지됩니다.</p>'+
    btn(PARTS[part]+" 변경값 초기화","resetPart","danger wide")+'<div id="resetNotice" class="notice" role="status"></div></section>':"")+'</div>';
  bindParts(el,p=>{if(!busy){cleanup();workFiles(p);}});
  const setBusy=v=>{busy=v;el.querySelectorAll("button,select").forEach(n=>n.disabled=v);};
  action(el,"downloadWork",async()=>{
   if(busy)return;const filter=el.querySelector("#resultFilter").value,msg=el.querySelector("#downloadNotice");
   setBusy(true);notice(msg,"작업내역 확인 중…");
   try{service=await options.records();if(ac.signal.aborted)return;
    const f=await service.download(part,filter,{signal:ac.signal,progress:t=>notice(msg,t)});if(ac.signal.aborted)return;
    if(!f.count){notice(msg,"선택한 조건에 해당하는 상태변경 내역이 없습니다.");return;}
    const url=URL.createObjectURL(f.blob),a=document.createElement("a");
    try{a.href=url;a.download=f.name;document.body.append(a);a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    notice(msg,num(f.count)+"건 다운로드 요청 완료"+(f.orphan?" · 현재 지도에 없는 "+num(f.orphan)+"건은 비고에 표시했습니다.":"."));
   }catch(e){if(!ac.signal.aborted)notice(msg,"다운로드 실패: "+e.message,true);}finally{if(!ac.signal.aborted)setBusy(false);}
  });
  action(el,"resetPart",async()=>{
   if(!allowed||busy||resetLock)return;
   const label=PARTS[part],msg=el.querySelector("#resetNotice");
   if(!confirm(label+" 파트의 작업 상태 변경값을 초기화할까요?\n메모와 작업 로그는 보존됩니다. 필요하면 먼저 작업내역 엑셀을 내려받으세요."))return;
   if(!confirm("정말로 "+label+" 파트만 초기화하시겠습니까? 삭제된 변경값은 복구할 수 없습니다."))return;
   resetLock=true;setBusy(true);host.querySelectorAll('[data-act="back"],[data-act="exit"]').forEach(b=>b.disabled=true);
   window.addEventListener("beforeunload",beforeLeave);notice(msg,"초기화 대상 확인 중…");
   try{service=await options.records();if(ac.signal.aborted)return;
    const r=await service.reset(part,{signal:ac.signal,progress:t=>notice(msg,t)});if(ac.signal.aborted)return;
    notice(msg,label+" 초기화 완료 · 변경값 "+num(r.deleted)+"건 삭제"+(r.newer?" · 초기화 도중 수정된 "+num(r.newer)+"건 유지":""));
   }catch(e){if(!ac.signal.aborted)notice(msg,e.message,true);}
   finally{resetLock=false;window.removeEventListener("beforeunload",beforeLeave);if(!ac.signal.aborted){setBusy(false);host.querySelectorAll('[data-act="back"],[data-act="exit"]').forEach(b=>b.disabled=false);}}
  });
 }

 function route(){if(resetLock){if(location.hash!=="#workfiles")history.replaceState(null,"","#workfiles");return;}++seq;cleanup();cleanup=()=>{};const h=location.hash.slice(1);if(h==="history")historyView();else if(h==="workfiles")workFiles();else if(h==="upload")upload();else if(h==="workers")workers();else if(h==="permissions"&&me.owner)permissions();else home();}
 window.addEventListener("hashchange",route);route();
}
