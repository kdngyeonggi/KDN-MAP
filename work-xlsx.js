// 외부 라이브러리/CDN 없이 표준 XLSX(OOXML + ZIP)를 생성합니다.
// 모든 데이터 셀을 문자열로 저장해 계약/계기번호의 앞자리 0과 긴 번호를 보존합니다.
function workExcelXmlText(value) {
  const text = String(value ?? "");
  if (text.length > 32767) throw new Error("엑셀 한 셀의 최대 글자 수(32,767자)를 넘는 내용이 있습니다.");
  return text.replace(/_x[0-9a-fA-F]{4}_/g, match => "_x005F_" + match.slice(1))
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g,
      char => `_x${char.charCodeAt(0).toString(16).padStart(4, "0")}_`)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;")
    .replaceAll("\r", "&#13;");
}

export function createWorkExportWorkbook(rows) {
  if (rows.length > 1048575) throw new Error("전체 변경내역이 엑셀 한 시트의 최대 데이터 행 수(1,048,575개)를 초과했습니다.");
  const header = ["파트", "계약번호", "계기번호", "기존상태", "작업결과", "작업자", "작업일자(한국시간)", "메모", "지번주소", "비고"];
  const xmlStart = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const sheetRows = [header, ...rows].map((row, index) => {
    const cells = row.map((value, col) => `<c r="${String.fromCharCode(65 + col)}${index + 1}" s="${index === 0 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${workExcelXmlText(value)}</t></is></c>`).join("");
    return `<row r="${index + 1}"${index === 0 ? ' ht="24" customHeight="1"' : ""}>${cells}</row>`;
  }).join("");
  const sheet = xmlStart + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:J${rows.length + 1}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${[20,24,24,18,18,18,24,55,45,45].map((width,i)=>`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:J${rows.length+1}"/></worksheet>`;
  const files = {
    "[Content_Types].xml": xmlStart + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels": xmlStart + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": xmlStart + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="작업내역" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": xmlStart + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml": xmlStart + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3A5F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    "xl/worksheets/sheet1.xml": sheet
  };
  return createWorkExcelZip(files);
}

function createWorkExcelZip(files) {
  const encoder = new TextEncoder();
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let k = 0; k < 8; k++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  const parts = [], directory = [];
  let offset = 0, directorySize = 0;
  for (const [filename, xml] of Object.entries(files)) {
    const name = encoder.encode(filename), data = encoder.encode(xml);
    let crc = 0xffffffff;
    for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    if (offset + data.length + name.length + 30 > 0xffffffff) throw new Error("전체 변경내역이 엑셀 파일로 생성할 수 있는 크기를 초과했습니다.");
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true);
    lv.setUint16(12, 33, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true);
    cv.setUint16(14, 33, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); central.set(name, 46);
    parts.push(local, data); directory.push(central);
    offset += local.length + data.length; directorySize += central.length;
  }
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, directory.length, true); view.setUint16(10, directory.length, true);
  view.setUint32(12, directorySize, true); view.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
