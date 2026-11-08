import {API_BASE,FIREBASE_CONFIG,MAP_SDK} from "./portal-config.js?v=map-key-v50";
import {initializeApp} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {getAuth,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {mount} from "./portal-ui.js?v=memo-reset-v52";
const auth=getAuth(initializeApp(FIREBASE_CONFIG)),host=document.querySelector("#portal");
const idleKey="kdn_last_activity_at_v1",timeout=10800000;let serial=0,uid=null,blocked=false,rechecking=false,stamp="";
const base=API_BASE.replace(/\/$/,"");
function logout(restricted=false){blocked=restricted;localStorage.removeItem(idleKey);return signOut(auth).finally(()=>location.replace("login.html"+(blocked?"?restricted=1":"")));}
async function api(path,opt={}){
 if(!base)throw Error("Firebase 관리 함수를 먼저 설정하세요.");
 const endpoint=new URL(base);if(endpoint.protocol!=="https:" && !["localhost","127.0.0.1"].includes(endpoint.hostname))throw Error("Firebase 관리 함수의 HTTPS 주소를 확인하세요.");
 const user=auth.currentUser;if(!user)throw Error("다시 로그인하세요.");
 const token=await user.getIdToken(), headers={...(opt.headers||{}),Authorization:"Bearer "+token};let body=opt.body;if(body instanceof Blob)headers["Content-Type"]=body.type||"application/octet-stream";
 if(body!=null && !(body instanceof Blob)){headers["Content-Type"]="application/json";body=JSON.stringify(body);}
 const res=await fetch(base+path,{method:opt.method||"GET",headers,body,cache:"no-store",referrerPolicy:"no-referrer",redirect:"error"});
 if(!res.ok){const j=await res.json().catch(()=>({}));if(j.error==="KDN MAP 사용이 제한된 계정입니다")void logout(true);throw Error(j.error||"Firebase 관리 기능을 연결할 수 없습니다. 배포 상태를 확인하세요.");}
 return opt.blob ? res.blob() : res.json();
}
function fail(e){
 document.querySelector("#map").hidden=true;
 host.hidden=false;const b=document.createElement("div");b.className="boot";const h=document.createElement("h2");h.textContent="업무 공간에 접속할 수 없습니다";const p=document.createElement("p");p.textContent=e.message;const retry=document.createElement("button");retry.textContent="다시 연결";retry.onclick=()=>location.reload();const out=document.createElement("button");out.textContent="로그아웃";out.onclick=()=>logout();b.append(h,p,retry,out);host.replaceChildren(b);
}
function mapSdk(){return new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=MAP_SDK+"&autoload=false";s.onload=()=>window.kakao?.maps?.load?window.kakao.maps.load(resolve):reject(Error("지도 SDK 설정을 확인하세요."));s.onerror=()=>reject(Error("카카오 지도를 불러오지 못했습니다."));document.head.append(s);});}
function expired(){const last=Number(localStorage.getItem(idleKey)||0);return last>0&&Date.now()-last>=timeout;}
async function recheck(){
 if(!base||!uid||!stamp||rechecking||document.hidden)return;rechecking=true;
 try{const me=await api("/api/me");if(JSON.stringify(me)!==stamp)location.reload();}
 catch(e){if(!blocked){location.replace("index.html");}}
 finally{rechecking=false;}
}
onAuthStateChanged(auth,async user=>{
 const n=++serial;if(!user){location.replace("login.html"+(blocked?"?restricted=1":""));return;}
 if(uid && uid!==user.uid){location.replace("index.html");return;}uid=user.uid;
 if(expired()){await logout();return;}if(!localStorage.getItem(idleKey))localStorage.setItem(idleKey,String(Date.now()));
 try{
   const name=(user.email||"").replace(/@kdn\.local$/i,"").replace(/\s+/g,"").normalize("NFC");
   const ctx={me:await api("/api/me"),roster:null};if(n!==serial)return;
   const me=ctx.me;if(me.blocked){await logout(true);return;}if(!me.parts?.length)throw Error("아직 배정된 파트가 없습니다. 관리자에게 문의하세요.");
   window.KDN_CONTEXT={...ctx,uid:user.uid};stamp=JSON.stringify(me);
   if(me.role==="admin" && new URLSearchParams(location.search).get("view")!=="map"){
     let recordsPromise;
     const active=()=>auth.currentUser?.uid===user.uid && window.KDN_CONTEXT?.uid===user.uid && !blocked;
     const records=()=>recordsPromise || (recordsPromise=import("./admin-records.js?v=memo-reset-v52").then(mod=>mod.createRecordService({
       api,active,authorize:async(part,cap)=>{
         if(!active() || !me.parts.includes(part))throw Error("담당 파트의 관리자만 조회할 수 있습니다.");
         const fresh=await api("/api/me");
         if(!active() || fresh.name!==me.name || fresh.role!=="admin" || fresh.blocked || !fresh.parts?.includes(part) || (cap&&!fresh.capabilities?.includes(cap)))
           throw Error("현재 계정에 이 파트의 작업 권한이 없습니다.");
       }
     })).catch(e=>{recordsPromise=null;throw e;}));
     mount(host,{me,api,records,connected:!!base,baseline:ctx.roster||[],baselineAdmins:ctx.admins||[],logout:()=>logout(),openMap:()=>location.assign("index.html?view=map")});
   }else{
     if(base&&me.role==="admin"){
      window.KDN_CONTEXT.roster=(await api("/api/workers")).workers;
     }
     await mapSdk();if(n!==serial)return;host.hidden=true;document.querySelector("#map").hidden=false;document.body.classList.add("map-screen");
     await import("./app.js?v=memo-reset-v52");
   }
 }catch(e){if(!blocked)fail(e);}
});
function activity(){if(!uid)return;if(expired()){void logout();return;}localStorage.setItem(idleKey,String(Date.now()));}
for(const ev of ["pointerdown","keydown","touchstart","scroll"])window.addEventListener(ev,activity,{passive:true});
window.addEventListener("focus",()=>{if(uid&&expired())void logout();else void recheck();});
setInterval(()=>{if(uid&&expired())void logout();else void recheck();},60000);
