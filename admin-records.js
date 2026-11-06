import { stableRowKey, safeDocId, markerMemoKey, displayWorker, formatWorkTime } from "./work-keys.js?v=51";
export const PART_INFO = Object.freeze({
  reinforcement:["보강공사",""], low_voltage:["저압","low_"],
  high_voltage:["고압","high_"], relay_table:["보강공사_중계표","relay_"]
});
const RESULTS = ["모뎀설치","작업불가","재방문"];
const fieldNames = {meter:"meterNo",contract:"contractNo"};
const num = n => n.toLocaleString("ko-KR");
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const text = v => String(v ?? "");
export const normalizeNumber = v => text(v).normalize("NFKC").toUpperCase().replace(/[\s\u2010-\u2015\u2212-]/g,"");
function currentStatus(part,v) {
  const value=text(v).trim(), compact=value.replace(/\s+/g,"").toUpperCase();
  if(part==="low_voltage" && compact==="PPA")return "사전협의";
  const known=part==="reinforcement"?[]:part==="high_voltage"?["점검","험로","긴급","초긴급",...RESULTS]:
    ["MKAMI",part==="low_voltage"?"사전협의":"PPA","기타","긴급","점검","험로",...RESULTS];
  return known.includes(compact)?compact:value;
}
function belongs(part,d) {
  if (!d || typeof d.key!=="string" || !d.key || (d.workType || "reinforcement")!==part) return false;
  return !Object.keys(PART_INFO).some(k=>k!==part && d.key.startsWith(k+"|"));
}
function memo(d) { return d.kind==="markerMemo" || d.key.startsWith("markerMemo|") || (typeof d.status!=="string" && own(d,"memo")); }
function record(part,d) {
  if(!belongs(part,d) || memo(d) || typeof d.status!=="string") return null;
  const ms=d.updatedAt?.toMillis?.() || 0;
  return {key:d.key, when:ms?formatWorkTime(ms).slice(0,16):"기록 없음", result:currentStatus(part,d.status), worker:displayWorker(d.updatedByEmail),
    time:ms, meter:text(d.meterNo), contract:text(d.contractNo),
    address:text(d.address), branch:text(d.branch)};
}
function numbers(which,q,row) {
  return (which!=="contract" && normalizeNumber(row.meter)===q) ||
    (which!=="meter" && normalizeNumber(row.contract)===q);
}
function collectLatest(part,docs) {
  const map=new Map();
  for(const d of docs){const r=record(part,d);if(r && (!map.has(r.key) || map.get(r.key).time<r.time))map.set(r.key,r);}
  return map;
}
function chunks(a,size=30) {return Array.from({length:Math.ceil(a.length/size)},(_,i)=>a.slice(i*size,(i+1)*size));}
function fileFor(part,name) {
  const prefix=PART_INFO[part][1];
  if(!/^(?:(?:low|high|relay)_)?tile_[A-Za-z0-9_.-]+\.json$/.test(name) || name.includes(".."))
    throw Error("파트의 지도 자료 파일명을 확인하세요.");
  const used=/^(low_|high_|relay_)/.exec(name)?.[1];
  if(used && used!==prefix)throw Error("다른 파트의 지도 자료가 포함되어 있습니다.");
  return used?name:prefix+name;
}
async function readJson(file,signal) {
  const r=await fetch(file,{cache:"no-cache",credentials:"same-origin",signal});
  if(!r.ok)throw Error("지도 자료를 불러오지 못했습니다: "+file);
  return r.json();
}
// Keep compact meter records only, never the full set of tile objects or a persistent customer cache.
async function loadCatalog(part,json,signal,check,progress) {
  const manifest=await json(PART_INFO[part][1]+"tiles_index.json",signal);check();
  if(!Array.isArray(manifest?.tiles) || (manifest.workType && manifest.workType!==part))
    throw Error("파트의 지도 자료 목록을 확인하세요.");
  const files=[...new Set(manifest.tiles.map(t=>fileFor(part,text(t?.file))))], rows=new Map(), pieces=new Map();
  for(const [i,file] of files.entries()) {
    check();progress("계기 자료 확인 중 · "+(i+1)+" / "+files.length);
    const groups=await json(file,signal); check();
    if(!Array.isArray(groups))throw Error("지도 자료 형식이 올바르지 않습니다: "+file);
    let processed=0;
    for(const g of groups) {
      if(!g || !g.n || !Array.isArray(g.rows))throw Error("계기 목록을 확인할 수 없습니다: "+file);
      if(g.workType && g.workType!==part)throw Error("지도 자료의 파트가 일치하지 않습니다.");
      const fragmented=g.rowOffset!==undefined || g.rowTotal!==undefined, offset=fragmented?g.rowOffset:0;
      if(fragmented) {
        if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(g.rowTotal)||g.rowTotal<offset+g.rows.length)
          throw Error("분할된 계기 자료의 행 위치가 올바르지 않습니다.");
        const piece=pieces.get(g.n) || {total:g.rowTotal,spans:[]};
        if(piece.total!==g.rowTotal)throw Error("분할된 계기 자료의 크기가 일치하지 않습니다.");
        piece.spans.push([offset,offset+g.rows.length]);pieces.set(g.n,piece);
      }
      for(const [j,r] of g.rows.entries()) {
        if(!r || typeof r!=="object")throw Error("지도 자료의 계기 행을 확인하세요.");
        const key=stableRowKey(part,g.n,offset+j,r), prev=rows.get(key);
        if(prev) {if(!prev.groups.includes(g.n))prev.groups.push(g.n);}
        else rows.set(key,{key,meter:text(r.m),contract:text(r.c),original:(part==="low_voltage"?currentStatus(part,r.k):text(r.k)).replace(/\s+/g,""),
          address:text(r.f),branch:text(r.branch||g.branch),groups:[g.n]});
        if(++processed%4096===0){await new Promise(done=>setTimeout(done,0));check();}
      }
    }
  }
  for(const {total,spans} of pieces.values()){
    let end=0;for(const [start,next] of spans.sort((a,b)=>a[0]-b[0])){
      if(start!==end)throw Error("분할된 계기 자료에 누락 또는 중복이 있습니다.");end=next;
    }
    if(end!==total)throw Error("분할된 계기 자료를 모두 읽지 못했습니다.");
  }
  return rows;
}

// The portal uses the same default DB, document IDs, and permitted part scopes as the field map.
// Firestore is imported only upon an explicit lookup/export; these screens do not load Kakao.
export async function makeFirebaseReader() {
  const f=await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
  const db=f.getFirestore(),status=f.collection(db,"statusOverrides"),logs=f.collection(db,"statusLogs"),id=f.documentId();
  async function read(ref,constraints,check) {
    check();const snap=await f.getDocsFromServer(f.query(ref,...constraints));check();
    if(snap.metadata.fromCache || snap.metadata.hasPendingWrites)throw Error("서버의 최신 작업내역을 확인한 뒤 다시 시도하세요.");
    return snap.docs.map(doc=>doc.data());
  }
  const range=p=>[f.where(id,">=",p),f.where(id,"<",p+"\uf8ff")];
  const scope=part=>part==="reinforcement"?range(safeDocId("v2|")):[f.where("workType","==",part)];
  async function partDocs(part,withMemos,check) {
    const refs=[scope(part)];
    if(part==="reinforcement" && withMemos)refs.push(range(safeDocId("markerMemo|reinforcement|")));
    return (await Promise.all(refs.map(c=>read(status,c,check)))).flat().filter(d=>belongs(part,d));
  }
  return {
    all:(part,check)=>partDocs(part,true,check),
    async matched(part,needles,known,check) {
      const docs=[],keys=new Set();
      try {
        for(const [field,values] of needles)for(const batch of chunks(values)) {
          docs.push(...await read(status,[...scope(part),f.where(field,batch.length===1?"==":"in",batch.length===1?batch[0]:batch)],check));
        }
      } catch(e) {
        // Older projects need no new indexes: fall back only to this part's existing map query.
        if(e?.code!=="failed-precondition" || !/index/i.test(e.message||""))throw e;
        return partDocs(part,false,check);
      }
      for(const d of docs)if(belongs(part,d) && !memo(d))keys.add(d.key);
      // Some historic overrides have only the stable key, not searchable meter/contract fields.
      for(const batch of chunks(known.filter(k=>!keys.has(k))))
        docs.push(...await read(status,[f.where(id,"in",batch.map(safeDocId))],check));
      return docs.filter(d=>belongs(part,d));
    },
    async past(part,keys,check) {
      // Exact keys come exclusively from rows in the authorized part's static manifest.
      const docs=[];for(const batch of chunks(keys))docs.push(...await read(logs,[f.where("key","in",batch)],check));
      return docs.filter(d=>belongs(part,d));
    }
  };
}
export function createRecordService({authorize,active,api,reader=makeFirebaseReader,json=readJson,workbook}) {
  let cached=null,dbPromise=null;
  const db=()=>dbPromise || (dbPromise=Promise.resolve().then(reader).catch(e=>{dbPromise=null;throw e;}));
  function start(part,opt) {
    if(!own(PART_INFO,part))throw Error("파트를 다시 선택하세요.");
    const check=()=>{if(opt.signal?.aborted || !active())throw Error("화면 또는 로그인 계정이 변경되었습니다.");};
    const progress=t=>{check();opt.progress?.(t);};check();return {check,progress};
  }
  async function catalog(part,opt,check,progress) {
    if(cached?.part===part && Date.now()-cached.at<90000)return cached.rows;
    cached=null;
    const rows=await loadCatalog(part,json,opt.signal,check,progress);check();cached={part,rows,at:Date.now()};return rows;
  }
  async function lookup(part,which,raw,opt={}) {
    const {check,progress}=start(part,opt),q=normalizeNumber(raw);
    if(!["any","meter","contract"].includes(which)||!q||String(raw).length>120)throw Error("조회할 계기번호 또는 계약번호를 입력하세요.");
    await authorize(part);check();
    const cat=await catalog(part,opt,check,progress), matched=[];
    for(const row of cat.values())if(numbers(which,q,row))matched.push(row);
    const needles=[];
    for(const field of Object.keys(fieldNames))if(which==="any"||which===field) {
      const values=new Set([text(raw).trim(),q,...matched.filter(r=>normalizeNumber(r[field])===q).map(r=>r[field])]);
      needles.push([fieldNames[field],[...values].filter(Boolean)]);
    }
    progress("저장된 작업내역 확인 중…");
    const store=await db();check();
    const changes=collectLatest(part,await store.matched(part,needles,matched.map(r=>r.key),check));check();
    const keySet=new Set(matched.map(r=>r.key));
    const missing=matched.filter(r=>!changes.has(r.key)).map(r=>r.key);
    let historic=new Map(),pastUnavailable=false;
    if(missing.length)try {historic=collectLatest(part,await store.past(part,missing,check));check();}
    catch(e){check();if(e?.code==="unauthenticated")throw e;pastUnavailable=true;}
    const items=matched.map(row=>({part,row,change:changes.get(row.key)||null,past:historic.get(row.key)||null,
      pastUnknown:pastUnavailable && !changes.has(row.key),orphan:false}));
    for(const [key,r] of changes)if(!keySet.has(key) && numbers(which,q,r))
      items.push({part,row:cat.get(key)||{...r,original:""},change:r,past:null,pastUnknown:false,orphan:!cat.has(key)});
    return items;
  }
  async function download(part,filter,opt={}) {
    const {check,progress}=start(part,opt);
    if(filter && !RESULTS.includes(filter))throw Error("작업결과를 다시 선택하세요.");
    await authorize(part);check();progress("선택한 파트의 작업내역 확인 중…");
    const store=await db();check();
    const docs=await store.all(part,check);check();
    const changes=[...collectLatest(part,docs).values()].filter(r=>!filter || r.result===filter)
      .sort((a,b)=>b.time-a.time || a.key.localeCompare(b.key));
    if(!changes.length)return {count:0};
    const memos=new Map(docs.filter(d=>belongs(part,d)&&memo(d)).map(d=>[d.key,text(d.memo??d.text)]));
    const cat=await catalog(part,opt,check,progress);
    let orphan=0;
    const label=PART_INFO[part][0], rows=changes.map(ch=>{
      const r=cat.get(ch.key);if(!r)orphan++;
      const notes=r?[...new Set(r.groups.map(g=>memos.get(markerMemoKey(part,g))).filter(Boolean))]:[];
      return [label,r?.contract??ch.contract,r?.meter??ch.meter,r?r.original:"확인 불가",ch.result,ch.worker,
        ch.time?formatWorkTime(ch.time):"",notes.join("\n\n"),r?.address||ch.address,r?"":"현재 지도 데이터에 없는 기록 · 메모 연결 불가"];
    });
    progress(num(rows.length)+"건의 엑셀 생성 중…");await new Promise(resolve=>setTimeout(resolve,0));check();
    const writer=workbook || (await import("./work-xlsx.js?v=51")).createWorkExportWorkbook;check();
    const stamp=formatWorkTime(Date.now()).replace(/[-:]/g,"").replace(" ","_");
    return {count:rows.length,orphan,blob:writer(rows),name:"KDN_MAP_"+label+"_"+(filter||"전체변경")+"_"+stamp+".xlsx"};
  }
  async function reset(part,opt={}) {
    const {check,progress}=start(part,opt);await authorize(part,"reset");check();
    let deleted=0,newer=0,cursor=null;const seen=new Set();
    try {
      do {
        check();const p=await api("/api/status/reset",{method:"POST",body:{part,cursor}});
        if(!Number.isSafeInteger(p?.deleted)||p.deleted<0||!Number.isSafeInteger(p.newer)||p.newer<0||
          !(p.next===null || (typeof p.next==="string" && p.next && !seen.has(p.next))))throw Error("초기화 응답을 확인할 수 없습니다.");
        deleted+=p.deleted;newer+=p.newer;cursor=p.next;seen.add(cursor);
        progress("초기화 중 · "+num(deleted)+"건 삭제");
      }while(cursor!==null);
      return {deleted,newer};
    }catch(e){throw Error("초기화 중단 · 서버에서 확인한 삭제 "+num(deleted)+"건. "+e.message);}
    finally{cached=null;}
  }
  return {lookup,download,reset,clear:()=>{cached=null;}};
}
