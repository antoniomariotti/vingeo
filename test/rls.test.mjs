import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','a@x.it'),('00000000-0000-0000-0000-00000000000b','b@x.it'),('00000000-0000-0000-0000-00000000000c','c@x.it');
`);
await db.exec(fs.readFileSync(''+new URL('../supabase/migrations/0001_schema.sql', import.meta.url).pathname+'','utf8'));
await db.exec(fs.readFileSync(''+new URL('../supabase/migrations/0001_schema.sql', import.meta.url).pathname+'','utf8')); // idempotente
const U={A:'00000000-0000-0000-0000-00000000000a',B:'00000000-0000-0000-0000-00000000000b',C:'00000000-0000-0000-0000-00000000000c'};
async function as(u, sql, params=[]) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${u||''}',false); set role ${u?'authenticated':'anon'};`);
  try { const r = await db.query(sql, params); return r.rows; } finally { await db.exec('reset role'); }
}
let ok=0, ko=0;
async function expect(name, fn, should) { try { const r=await fn(); const pass = should==='error'?false:should(r); if(pass){ok++;console.log('ok  ',name)} else {ko++;console.log('FAIL',name,JSON.stringify(r))} } catch(e){ if(should==='error'){ok++;console.log('ok  ',name,'→',e.message.slice(0,60))} else {ko++;console.log('FAIL',name,e.message)} } }
const az=(await as(U.A,`insert into aziende(nome,regione,lat,lon) values('Cantina A','abruzzo',42.13,14.62) returning id`))[0].id;
await expect('A titolare', ()=>as(U.A,`select ruolo from membri where azienda_id=$1`,[az]), r=>r.length===1&&r[0].ruolo==='titolare');
await expect('B non vede azienda', ()=>as(U.B,`select * from aziende`), r=>r.length===0);
await expect('A scrive documento', ()=>as(U.A,`insert into documenti(azienda_id,col,id,data) values($1,'appezzamenti','a1','{"nome":"Chardo"}') returning aggiornato_da`,[az]), r=>r[0].aggiornato_da===U.A);
await expect('B non legge documenti', ()=>as(U.B,`select * from documenti`), r=>r.length===0);
await expect('B non scrive documenti', ()=>as(U.B,`insert into documenti(azienda_id,col,id,data) values($1,'appezzamenti','x','{}')`,[az]), 'error');
await expect('anon non legge', ()=>as(null,`select * from documenti`), 'error');
await expect('B non crea inviti', ()=>as(U.B,`insert into inviti(azienda_id,ruolo) values($1,'lettore')`,[az]), 'error');
const inv=(await as(U.A,`insert into inviti(azienda_id,ruolo) values($1,'lettore') returning codice`,[az]))[0].codice;
await expect('B accetta invito', ()=>as(U.B,`select accetta_invito($1) as a`,[inv]), r=>r[0].a===az);
await expect('invito non riusabile', ()=>as(U.C,`select accetta_invito($1)`,[inv]), 'error');
await expect('B lettore legge', ()=>as(U.B,`select * from documenti`), r=>r.length===1);
await expect('B lettore non scrive', ()=>as(U.B,`update documenti set data='{}' where id='a1' returning id`), r=>r.length===0);
await expect('B vede membri con email', ()=>as(U.B,`select * from membri_azienda($1)`,[az]), r=>r.length===2&&r.some(x=>x.email==='a@x.it'));
await expect('C non vede membri', ()=>as(U.C,`select * from membri_azienda($1)`,[az]), r=>r.length===0);
const inv2=(await as(U.A,`insert into inviti(azienda_id,ruolo) values($1,'collaboratore') returning codice`,[az]))[0].codice;
await as(U.C,`select accetta_invito($1)`,[inv2]);
await expect('C collaboratore scrive', ()=>as(U.C,`update documenti set data='{"nome":"Chardo 2"}' where id='a1' returning aggiornato_da`), r=>r.length===1&&r[0].aggiornato_da===U.C);
await expect('C non cambia ruoli', ()=>as(U.C,`update membri set ruolo='titolare' where user_id=$1 returning *`,[U.C]), r=>r.length===0);
await expect('C non cancella azienda', ()=>as(U.C,`delete from aziende where id=$1 returning id`,[az]), r=>r.length===0);
await expect('A non si toglie (ultimo titolare)', ()=>as(U.A,`delete from membri where user_id=$1`,[U.A]), 'error');
await expect('B lascia azienda', ()=>as(U.B,`delete from membri where user_id=$1 returning user_id`,[U.B]), r=>r.length===1);
await expect('B non legge più', ()=>as(U.B,`select * from documenti`), r=>r.length===0);
await expect('id non valido rifiutato', ()=>as(U.A,`insert into documenti(azienda_id,col,id,data) values($1,'appezzamenti','a b','{}')`,[az]), 'error');
await expect('A cancella azienda (cascade)', ()=>as(U.A,`delete from aziende where id=$1 returning id`,[az]), r=>r.length===1);
await expect('documenti spariti', async()=>(await db.query('select count(*)::int n from documenti')).rows, r=>r[0].n===0);
console.log(`\n${ok} ok, ${ko} falliti`);
