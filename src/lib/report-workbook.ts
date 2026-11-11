import 'server-only';
import { crc32,deflateRawSync } from 'node:zlib';

type Sheet = {name:string;rows:(string|number)[][]};
const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const sheetNamespace='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relationships='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRelationships='http://schemas.openxmlformats.org/package/2006/relationships';
const xml=(text:string)=>text.replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu,'')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function zip(entries:{name:string;contents:string}[]) {
  const local:Buffer[]=[];
  const index:Buffer[]=[];
  let offset=0;
  for (const {name,contents} of entries) {
    const filename=Buffer.from(name);
    const source=Buffer.from(contents);
    const data=deflateRawSync(source);
    const checksum=crc32(source);
    const header=Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20,4);
    header.writeUInt16LE(8,8);
    header.writeUInt16LE(33,12);
    header.writeUInt32LE(checksum,14);
    header.writeUInt32LE(data.length,18);
    header.writeUInt32LE(source.length,22);
    header.writeUInt16LE(filename.length,26);
    local.push(header,filename,data);

    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20,4);
    header.copy(central,6,4,28);
    central.writeUInt32LE(offset,42);
    index.push(central,filename);
    offset+=header.length+filename.length+data.length;
  }
  const directory=Buffer.concat(index);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length,8);
  end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(directory.length,12);
  end.writeUInt32LE(offset,16);
  return Uint8Array.from(Buffer.concat([...local,directory,end]));
}

export function reportWorkbook(sheets:Sheet[]) {
  const sheetFiles=sheets.map(({rows},index)=>{
    const rowData=rows.map((row,number)=>{
      const cells=row.map(value=>typeof value==='number'&&Number.isFinite(value)
        ?`<c><v>${value}</v></c>`
        :`<c t="inlineStr"><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`).join('');
      return `<row r="${number+1}">${cells}</row>`;
    }).join('');
    return {name:`xl/worksheets/sheet${index+1}.xml`,contents:`${declaration}<worksheet xmlns="${sheetNamespace}">
      <sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
      <cols><col min="1" max="${rows[0]?.length??1}" width="25" customWidth="1"/></cols>
      <sheetData>${rowData}</sheetData></worksheet>`};
  });
  const sheetTags=sheets.map((sheet,index)=>`<sheet name="${xml(sheet.name)}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('');
  const contentTypes=sheetFiles.map(file=>`<Override PartName="/${file.name}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  return zip([
    {name:'[Content_Types].xml',contents:`${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentTypes}</Types>`},
    {name:'_rels/.rels',contents:`${declaration}<Relationships xmlns="${packageRelationships}">
      <Relationship Id="rId1" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:'xl/workbook.xml',contents:`${declaration}<workbook xmlns="${sheetNamespace}" xmlns:r="${relationships}">
      <bookViews><workbookView/></bookViews><sheets>${sheetTags}</sheets></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',contents:`${declaration}<Relationships xmlns="${packageRelationships}">
      ${sheetFiles.map((file,index)=>`<Relationship Id="rId${index+1}" Type="${relationships}/worksheet" Target="${file.name.slice(3)}"/>`).join('')}</Relationships>`},
    ...sheetFiles,
  ]);
}
