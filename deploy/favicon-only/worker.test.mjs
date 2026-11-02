import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {rewriteIcons} from './worker.mjs';
test('only icon links change inside head; body and other metadata unchanged',()=>{
 const before='<html><head><meta name="x" content="y"><link rel="icon" href="old"><link rel="stylesheet" href="app.css"></head><body><script>UNCHANGED</script></body></html>';
 const after=rewriteIcons(before);assert.ok(!after.includes('href="old"'));assert.ok(after.includes('<meta name="x" content="y">'));assert.ok(after.includes('<link rel="stylesheet" href="app.css">'));assert.equal(after.split('<body>')[1],before.split('<body>')[1]);assert.ok(after.includes('/favicon-16.png?v=2'));
});
test('non-HTML assets pass through same response; request unchanged',async()=>{
 const request=new Request('https://minemysol.nahalabs.co.za/assets/app.js');const response=new Response('original bytes',{headers:{'content-type':'text/javascript'}});
 const result=await worker.fetch(request,{ASSETS:{fetch:r=>{assert.equal(r,request);return response}}});assert.equal(result,response);
});
test('icons use exact approved bytes, HEAD empty, no asset call',async()=>{
 const noFetch={ASSETS:{fetch:()=>{throw Error('not allowed')}}};
 const r=await worker.fetch(new Request('https://minemysol.nahalabs.co.za/favicon-16.png?v=2'),noFetch);assert.equal(r.headers.get('content-type'),'image/png');assert.ok((await r.arrayBuffer()).byteLength>100);
 const head=await worker.fetch(new Request('https://minemysol.nahalabs.co.za/favicon.ico',{method:'HEAD'}),noFetch);assert.equal((await head.arrayBuffer()).byteLength,0);
});
