/* Runs only when an administrator explicitly inspects a workbook. No address lookup or network upload. */
"use strict";
const runtime=new URL("./excel-runtime/",self.location.href).href;
const send=t=>postMessage({type:"status",text:t});
const python=String.raw`
import os, sys, json, zipfile, gc
sys.path.insert(0, '/app')
sys.path.insert(0, '/wheels')
from openpyxl import load_workbook
from converter import convert_sheet, SHEET_CONFIG
labels = {v['work_type']:k for k,v in SHEET_CONFIG.items()}
lab = labels[part_code]
source='/input/source.xlsx'
with zipfile.ZipFile(source) as archive:
    items=archive.infolist()
    if len(items)>16000 or sum(i.file_size for i in items)>3_000_000_000:
        raise ValueError('엑셀 압축을 푼 크기가 너무 큽니다.')
    if 'xl/workbook.xml' not in archive.namelist() or any('vbaproject' in i.filename.lower() for i in items):
        raise ValueError('매크로가 없는 .xlsx 파일을 선택하세요.')
wb=load_workbook(source,read_only=True,data_only=True,keep_links=False)
try:
    if len(wb.sheetnames)!=1 or len(wb.worksheets)!=1:raise ValueError('선택한 파트의 시트 한 장만 넣어주세요.')
    sheet=wb.worksheets[0]
    known={k:k for k in labels.values()}
    known['중계표']='보강공사_중계표'
    if sheet.title.strip() in known and known[sheet.title.strip()]!=lab:
        raise ValueError('선택한 파트와 엑셀 시트 이름이 다릅니다.')
    result=convert_sheet(sheet,lab,dict(SHEET_CONFIG[lab],output_dir='/out'))
    if result['rows']<=0:raise ValueError('반영할 계기가 0건입니다. 기존 데이터는 유지됩니다.')
    result.pop('output_dir',None);result['source_sheet']=sheet.title
finally:wb.close()
gc.collect()
json.dumps(result,ensure_ascii=False)
`;
async function get(path){const res=await fetch(path);if(!res.ok)throw Error("엑셀 변환 파일을 불러오지 못했습니다. web 폴더 전체를 확인하세요.");return res;}
self.onmessage=async({data})=>{
 try{
  const {file,part}=data;
  if(!(file instanceof Blob)||!file.size||file.size>160*1024*1024)throw Error("160 MiB 이하의 .xlsx 파일을 선택하세요.");
  send("브라우저에서 엑셀 변환기를 여는 중…");
  importScripts(runtime+"pyodide.js");
  const py=await loadPyodide({indexURL:runtime,stdout:()=>{},stderr:()=>{}});
  await py.loadPackage(["hashlib"],{messageCallback:()=>{}});
  py.FS.mkdirTree("/wheels");py.FS.mkdirTree("/app");py.FS.mkdirTree("/out");py.FS.mkdirTree("/input");
  await Promise.all(["openpyxl-3.1.5-py2.py3-none-any.whl","et_xmlfile-2.0.0-py3-none-any.whl","defusedxml-0.7.1-py2.py3-none-any.whl"].map(async n=>py.unpackArchive(await(await get(runtime+n)).arrayBuffer(),"zip",{extractDir:"/wheels"})));
  const code=await(await get(new URL("./converter.py?v=47",self.location.href))).text();
  py.FS.writeFile("/app/converter.py",code);
  if(py.FS.filesystems.WORKERFS)py.FS.mount(py.FS.filesystems.WORKERFS,{blobs:[{name:"source.xlsx",data:file}]},"/input");
  else py.FS.writeFile("/input/source.xlsx",new Uint8Array(await file.arrayBuffer()));
  py.globals.set("part_code",part);send("선택한 시트의 계기와 좌표를 검사하는 중…");
  const report=JSON.parse(await py.runPythonAsync(python));
  const files=py.FS.readdir("/out").filter(n=>n.endsWith(".json")).sort().map(name=>({name,bytes:py.FS.readFile("/out/"+name).slice().buffer}));
  self.postMessage({type:"done",report,files},files.map(f=>f.bytes));
 }catch(e){
  const s=String(e?.message||e),match=s.match(/(?:ValueError|BadZipFile|KeyError|InvalidFileException): ([^\n]+)/g);
  postMessage({type:"error",text:match?match.at(-1).replace(/^\w+: /,""):"엑셀을 변환할 수 없습니다. 파일 형식·크기와 변환 파일 설치 상태를 확인하세요."});
  if(!match)console.warn("KDN workbook runtime:",s.slice(0,2500));
 }
};
