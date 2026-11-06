import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { workerPayrollWeek, workerPayrollPeriod, buildWorkerPayrollReport } from "../shared/workerPayrollReports.js";
import { reportAccount, reportWorker } from "./helpers/workerPayrollReportFixture.js";
globalThis.localStorage = { getItem: () => "ar" };
let failFonts = false;
globalThis.fetch = async url => failFonts ? new Response(null, { status: 503 }) : new Response(await readFile(new URL(url)));
const { createWorkerPayrollPDF } = await import("../src/composent/Khadama/workerPayrollPDF.js");
const issuedAt = new Date("2026-11-06T10:30:00Z");

test("weeks run Monday to Sunday across month, year and daylight-saving boundaries", () => {
  assert.deepEqual(workerPayrollWeek("2026-11-06"), {start:"2026-11-02",end:"2026-11-08"});
  assert.deepEqual(workerPayrollWeek("2026-01-01"), {start:"2025-12-29",end:"2026-01-04"});
  assert.deepEqual(workerPayrollWeek("2026-03-29"), {start:"2026-03-23",end:"2026-03-29"});
  for(const day of ["2026-02-30","",null,"2026-13-01","9999-12-31"])assert.throws(()=>workerPayrollWeek(day),/invalidPayrollPeriod/);
  for(const filter of [{mode:"month",month:"2026-13"},{mode:"year",year:"bad"},{mode:"day"}])assert.throws(()=>workerPayrollPeriod(filter),/invalidPayrollPeriod/);
});
test("monthly and yearly reports retain entitlement months and do not offset another month's advance", () => {
  const account=reportAccount(),nov=buildWorkerPayrollReport(account,{mode:"month",month:"2026-11"});
  assert.equal(nov.totals.earned,201);assert.equal(nov.totals.paid,0);assert.equal(nov.totals.unpriced,1);
  const year=buildWorkerPayrollReport(account,{mode:"year",year:"2026"});
  assert.equal(year.totals.earned,401);assert.equal(year.totals.paid,160);assert.equal(year.totals.due,301);assert.equal(year.totals.advance,60);assert.equal(year.totals.balance,241);assert.deepEqual(year.accountTotals,account.totals);
  const empty=buildWorkerPayrollReport(account,{mode:"year",year:"2025"});assert.equal(empty.entries.length,0);assert.equal(empty.totals.earned,0);assert.equal(empty.accountTotals.due,301);
});
test("weekly reports use payment day and Paris earning day while entry filters leave totals complete", () => {
  const account=reportAccount(),week=buildWorkerPayrollReport(account,{mode:"week",week:"2026-11-06"});
  assert.equal(week.totals.earned,50.75);assert.equal(week.totals.paid,160);assert.equal(week.totals.balance,-109.25);
  assert.ok(week.entries.some(row=>row.id==="settlement"));assert.ok(!week.entries.some(row=>row.id==="boundary"));
  const prior=buildWorkerPayrollReport(account,{mode:"week",week:"2026-11-01"});assert.equal(prior.totals.earned,150.25);
  const filtered=buildWorkerPayrollReport(account,{mode:"week",week:"2026-11-06",kind:"payment"});assert.equal(filtered.entries.length,2);assert.deepEqual(filtered.totals,week.totals);assert.equal(account.entries.length,6);
});

async function inspect(doc) {
  const task=getDocument({data:new Uint8Array(doc.output("arraybuffer"))}),pdf=await task.promise,pages=[];
  try{for(let n=1;n<=pdf.numPages;n++){
    const page=await pdf.getPage(n),content=await page.getTextContent(),ops=await page.getOperatorList();
    const runs=ops.argsArray.filter((_,i)=>ops.fnArray[i]===OPS.showText).map(([glyphs])=>glyphs.filter(glyph=>typeof glyph==="object"));
    for(const glyph of runs.flat()){if(glyph.unicode.trim())assert.equal(glyph.isInFont,true,"Missing font glyph: "+glyph.unicode);assert.doesNotMatch(glyph.unicode,/[\u200e\u200f\uFFFD]/);}
    for(const item of content.items.filter(item=>item.str.trim())){assert.ok(item.transform[4]>=30,"Left clip: "+item.str);assert.ok(item.transform[4]+item.width<=page.view[2]-30,"Right clip: "+item.str);assert.ok(item.transform[5]>=25,"Bottom clip: "+item.str);}
    pages.push({text:content.items.map(item=>item.str.normalize("NFKC")).join(" "),visual:runs.map(run=>run.map(glyph=>glyph.unicode).join("").normalize("NFKC"))});
  }return pages;}finally{await task.destroy();}
}
test("PDF font loading can be retried after a failure", async () => {
  failFonts=true;await assert.rejects(createWorkerPayrollPDF({worker:reportWorker,account:reportAccount(),issuedAt}),/invoice font/);failFonts=false;
  assert.ok(await createWorkerPayrollPDF({worker:reportWorker,account:reportAccount(),issuedAt}));
});
for(const language of ["ar","fr"])test(language+": PDF embeds Arabic fonts and contains full account and selected-week statistics",async()=>{
  const doc=await createWorkerPayrollPDF({worker:reportWorker,account:reportAccount(),filter:{mode:"week",week:"2026-11-06"},language,issuedAt});
  assert.equal((doc.output().match(/\/FontFile2 /g)||[]).length,2);
  const pages=await inspect(doc),text=pages.map(page=>page.text).join(" "),visual=pages.flatMap(page=>page.visual);
  for(const expected of ["401.00 DH","160.00 DH","301.00 DH","50.75 DH","-109.25 DH","2026-11-02","2026-11-08"])assert.ok(text.includes(expected)||visual.some(run=>run.includes(expected)),"Missing: "+expected);
  assert.ok(text.includes("أمينة العلوي Atelier 12"));assert.ok(text.includes("0612345678"));assert.ok(text.includes("تسديد مستحقات أكتوبر"));assert.ok(!text.includes("150.25 DH"));
});
test("long reports paginate, repeat headers, retain final rows and render an empty selected period",async()=>{
  const extra=Array.from({length:65},(_,index)=>({id:"row-"+index,kind:"earning",month:"2026-11",date:"2026-11-06T10:00:00Z",amount:1.25,category:"machine",productName:"جلابيب المحل قماش من القطن الممتاز مع تفاصيل الخياطة المطلوبة للزبون Atelier "+index,quantity:1}));
  const pages=await inspect(await createWorkerPayrollPDF({worker:{...reportWorker,name:"أمينة ".repeat(25)},account:reportAccount(extra),language:"ar",issuedAt}));assert.ok(pages.length>=3);assert.ok(pages.every(page=>page.text.includes("كشف حساب العامل")));assert.ok(pages.map(page=>page.text).join(" ").includes("Atelier 64"));
  const empty=await inspect(await createWorkerPayrollPDF({worker:reportWorker,account:reportAccount(),filter:{mode:"year",year:"2025"},language:"fr",issuedAt}));assert.ok(empty.map(page=>page.text).join(" ").includes("Aucune écriture"));
});
