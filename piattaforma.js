/* =====================================================================
   VINGEO — piattaforma multi-utente
   Accesso, aziende, membri e inviti su Supabase. Espone all'app le stesse
   interfacce dell'ambiente claude.ai (window.claude.use('db'|'assets'|
   'user'|'downloads')), così il codice dell'app resta unico.
   Si occupa anche dei servizi che nella versione personale facevano le
   attività pianificate: meteo orario (Open-Meteo) e bollettini regionali.
   ===================================================================== */
(function(){
'use strict';
const CFG=window.VINGEO_CONFIG||{};
const LS={get(k){try{return localStorage.getItem('vingeo.'+k)}catch(e){return null}},set(k,v){try{v==null?localStorage.removeItem('vingeo.'+k):localStorage.setItem('vingeo.'+k,v)}catch(e){}}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addD=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const RUOLI={titolare:3,collaboratore:2,lettore:1};
const RUOLO_TXT={titolare:'Titolare',collaboratore:'Collaboratore (può modificare)',lettore:'Lettore (solo consultazione)'};

let sb=null, sessione=null, azienda=null, ruolo=null, store=null;
const params=new URLSearchParams(location.search);

/* ---------------------------------------------------------------- overlay */
let ov=null;
function overlay(html){
  if(!ov){ ov=document.createElement('div'); ov.id='plat'; document.body.appendChild(ov);
    const st=document.createElement('style'); st.textContent=`
#plat{position:fixed;inset:0;z-index:50;background:var(--bg);overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:48px 16px}
#plat .pbox{width:100%;max-width:420px;display:flex;flex-direction:column;gap:16px}
#plat .pbrand{display:flex;align-items:center;gap:12px}
#plat .pbrand b{font-family:var(--f-display);font-size:1.7rem;letter-spacing:-.02em}
#plat .pbrand small{display:block;color:var(--muted);font-size:.72rem;letter-spacing:.04em;text-transform:uppercase}
#plat .card{display:flex;flex-direction:column;gap:12px}
#plat .ptabs{display:flex;gap:4px;border-bottom:1px solid var(--line)}
#plat .ptabs button{background:none;border:0;padding:8px 12px;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px}
#plat .ptabs button.on{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
#plat .perr{color:var(--crit);font-size:.88rem;min-height:1em}
#plat .pok{color:var(--accent);font-size:.88rem}
#plat .plink{background:none;border:0;color:var(--accent);cursor:pointer;padding:0;font-size:.88rem;text-align:left}
#plat .plist{display:flex;flex-direction:column;gap:8px}
#plat .plist button{display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left;width:100%}
#plat .presults{display:flex;flex-direction:column;gap:4px;max-height:220px;overflow:auto}
#plat .presults button{text-align:left;justify-content:flex-start}
#plat .pnote{color:var(--muted);font-size:.82rem;line-height:1.45}
.pmenu{display:flex;flex-direction:column;gap:6px}
.pmenu b{font-weight:600;color:var(--fg)}
.pmenu .prow{display:flex;gap:6px;flex-wrap:wrap}
.pmenu button{background:none;border:0;color:var(--accent);cursor:pointer;padding:0;font:inherit;font-size:.8rem}
.pmembers{display:flex;flex-direction:column;gap:8px}
.pmember{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:8px}
.pacct{display:none;margin-left:auto;align-items:center;gap:6px;border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 10px;font:inherit;font-size:.8rem;color:var(--fg);cursor:pointer;max-width:45vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:860px){.pacct{display:inline-block}}
.pinv{word-break:break-all;background:var(--surface-2);border-radius:8px;padding:8px;font-family:var(--f-mono);font-size:.8rem}`;
    document.head.appendChild(st); }
  ov.hidden=false;
  const logo=document.querySelector('.brand svg');
  ov.innerHTML=`<div class="pbox"><div class="pbrand">${logo?logo.outerHTML.replace('width="34" height="34"','width="44" height="44"'):''}<div><b>VinGeo</b><small>Quaderno di campagna</small></div></div>${html}</div>`;
}
function chiudiOverlay(){ if(ov){ ov.hidden=true; ov.innerHTML=''; } }
const $p=s=>ov&&ov.querySelector(s);
function errore(t){ const e=$p('.perr'); if(e) e.textContent=t||''; }
function msgErr(e){ const m=String(e&&e.message||e||'');
  if(/Invalid login credentials/i.test(m)) return 'Email o password non corretti.';
  if(/Email not confirmed/i.test(m)) return 'Conferma prima l\'indirizzo email: ti abbiamo mandato un link.';
  if(/User already registered/i.test(m)) return 'Esiste già un account con questa email: accedi.';
  if(/Password should be at least/i.test(m)) return 'La password deve avere almeno 8 caratteri.';
  if(/rate limit/i.test(m)) return 'Troppi tentativi: riprova tra qualche minuto.';
  if(/Failed to fetch|NetworkError/i.test(m)) return 'Connessione assente o servizio non raggiungibile.';
  return m||'Errore imprevisto.'; }

/* ---------------------------------------------------------------- accesso */
function schermataAccesso(tab='accedi', nota=''){
  const reg=tab==='registrati';
  overlay(`<div class="card">
    <div class="ptabs"><button class="${!reg?'on':''}" data-p="tab" data-v="accedi">Accedi</button><button class="${reg?'on':''}" data-p="tab" data-v="registrati">Crea un account</button></div>
    ${nota?`<div class="pok">${esc(nota)}</div>`:''}
    <label class="field"><span>Email</span><input id="p_email" type="email" autocomplete="email" value="${esc(LS.get('email')||'')}"></label>
    <label class="field"><span>Password</span><input id="p_pass" type="password" autocomplete="${reg?'new-password':'current-password'}" ${reg?'minlength="8"':''}></label>
    ${reg?`<label class="field"><span>Ripeti la password</span><input id="p_pass2" type="password" autocomplete="new-password"></label>
      <p class="pnote">Creando l'account accetti che i dati delle tue aziende siano conservati sul server dell'app (Unione Europea) per farla funzionare. Puoi esportarli o cancellarli quando vuoi.</p>`:''}
    <div class="perr"></div>
    <button class="btn primary" data-p="${reg?'registrati':'accedi'}" style="justify-content:center">${reg?'Crea account':'Accedi'}</button>
    ${!reg?`<button class="plink" data-p="reset">Password dimenticata?</button>`:''}
  </div>
  ${params.get('invito')?`<p class="pnote">Hai ricevuto un invito: accedi o crea un account per entrare nell'azienda.</p>`:''}`);
  setTimeout(()=>{const e=$p(LS.get('email')?'#p_pass':'#p_email'); e&&e.focus()},30);
}
async function accedi(){
  const email=$p('#p_email').value.trim(), password=$p('#p_pass').value;
  if(!email||!password) return errore('Inserisci email e password.');
  LS.set('email',email); errore('');
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error) errore(msgErr(error));
}
async function registrati(){
  const email=$p('#p_email').value.trim(), password=$p('#p_pass').value, p2=$p('#p_pass2').value;
  if(!email||!password) return errore('Inserisci email e password.');
  if(password.length<8) return errore('La password deve avere almeno 8 caratteri.');
  if(password!==p2) return errore('Le due password non coincidono.');
  LS.set('email',email); errore('');
  const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname+location.search}});
  if(error) return errore(msgErr(error));
  if(!data.session) schermataAccesso('accedi','Ti abbiamo mandato un\'email: apri il link per confermare l\'indirizzo, poi accedi.');
}
async function resetPassword(){
  const email=$p('#p_email').value.trim(); if(!email) return errore('Scrivi la tua email, poi premi di nuovo.');
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  if(error) return errore(msgErr(error));
  schermataAccesso('accedi','Se l\'email è registrata riceverai un link per scegliere una nuova password.');
}
function schermataNuovaPassword(){
  overlay(`<div class="card"><b>Scegli una nuova password</b>
    <label class="field"><span>Nuova password</span><input id="p_pass" type="password" autocomplete="new-password" minlength="8"></label>
    <div class="perr"></div><button class="btn primary" data-p="nuovapass" style="justify-content:center">Salva</button></div>`);
}
async function nuovaPassword(){
  const password=$p('#p_pass').value; if(password.length<8) return errore('Almeno 8 caratteri.');
  const {error}=await sb.auth.updateUser({password}); if(error) return errore(msgErr(error));
  location.replace(location.pathname);
}

/* ---------------------------------------------------------------- aziende */
async function mieAziende(){
  const {data,error}=await sb.from('membri').select('ruolo, aziende(id,nome,regione,comune,lat,lon)').eq('user_id',sessione.user.id);
  if(error) throw error;
  return (data||[]).filter(r=>r.aziende).map(r=>({...r.aziende,ruolo:r.ruolo})).sort((a,b)=>a.nome.localeCompare(b.nome,'it'));
}
async function scegliAzienda(){
  // invito nel link
  const inv=params.get('invito');
  if(inv){ const {data,error}=await sb.rpc('accetta_invito',{p_codice:inv});
    params.delete('invito'); history.replaceState(null,'',location.pathname+(params.toString()?'?'+params:'')+location.hash);
    if(error){ overlay(`<div class="card"><b>Invito non valido</b><p class="pnote">${esc(msgErr(error))}</p><button class="btn" data-p="continua">Continua</button></div>`); await attendi('continua'); }
    else LS.set('azienda',data); }
  const L=await mieAziende();
  const ult=LS.get('azienda'); const sc=L.find(a=>a.id===ult);
  if(sc&&!params.has('scegli')) return sc;
  if(L.length===1&&!params.has('scegli')) return L[0];
  if(!L.length) return await nuovaAzienda(true);
  overlay(`<div class="card"><b>Scegli l'azienda</b><div class="plist">${L.map(a=>`<button class="btn" data-p="azienda" data-v="${a.id}"><span><b>${esc(a.nome)}</b><br><span class="pnote">${esc(a.comune||'')} · ${esc(RUOLO_TXT[a.ruolo]||a.ruolo)}</span></span><span>›</span></button>`).join('')}</div>
    <button class="plink" data-p="nuova">+ Nuova azienda</button></div>
    <button class="plink" data-p="esci">Esci (${esc(sessione.user.email)})</button>`);
  const v=await attendi(['azienda','nuova']);
  if(v.p==='nuova') return await nuovaAzienda(false);
  return L.find(a=>a.id===v.v);
}
let luogoScelto=null;
async function nuovaAzienda(prima){
  luogoScelto=null;
  overlay(`<div class="card"><b>${prima?'Benvenuto! Crea la tua azienda':'Nuova azienda'}</b>
    <p class="pnote">Il comune serve per il meteo orario e per i modelli di difesa: puoi cambiarlo dopo. I vigneti li aggiungi dentro l'app.</p>
    <label class="field"><span>Nome dell'azienda</span><input id="p_nome" placeholder="es. Azienda agricola Rossi"></label>
    <label class="field"><span>Comune del centro aziendale</span><input id="p_comune" placeholder="es. Pollutri" autocomplete="off"></label>
    <div class="presults" id="p_res"></div>
    <div id="p_luogo" class="pnote"></div>
    <div class="perr"></div>
    <button class="btn primary" data-p="crea" style="justify-content:center">Crea l'azienda</button>
    ${!prima?`<button class="plink" data-p="annulla">Annulla</button>`:''}</div>
    <button class="plink" data-p="esci">Esci (${esc(sessione.user.email)})</button>`);
  let t=null; $p('#p_comune').addEventListener('input',e=>{clearTimeout(t); luogoScelto=null; $p('#p_luogo').textContent=''; const q=e.target.value.trim(); if(q.length<2){$p('#p_res').innerHTML='';return} t=setTimeout(()=>cercaComune(q),300)});
  for(;;){
    const v=await attendi(['crea','annulla']);
    if(v.p==='annulla') return await scegliAzienda();
    const nome=$p('#p_nome').value.trim();
    if(!nome){errore('Scrivi il nome dell\'azienda.');continue}
    if(!luogoScelto){errore('Scegli il comune dall\'elenco.');continue}
    const {data,error}=await sb.from('aziende').insert({nome,comune:luogoScelto.nome,regione:luogoScelto.regione,lat:luogoScelto.lat,lon:luogoScelto.lon,creata_da:sessione.user.id}).select().single();
    if(error){errore(msgErr(error));continue}
    LS.set('azienda',data.id); return {...data,ruolo:'titolare',nuova:true};
  }
}
async function cercaComune(q){
  try{ const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=it&countryCode=IT&format=json`); const d=await r.json();
    const R=(d.results||[]); const box=$p('#p_res'); if(!box) return;
    box.innerHTML=R.length?R.map((x,i)=>`<button class="btn small" data-p="luogo" data-v="${i}">${esc(x.name)} <span class="pnote">${esc([x.admin3&&x.admin3!==x.name?x.admin3:'',x.admin2,x.admin1].filter(Boolean).join(' · '))}</span></button>`).join(''):'<span class="pnote">Nessun comune trovato.</span>';
    box._R=R;
  }catch(e){ const box=$p('#p_res'); if(box) box.innerHTML='<span class="pnote">Ricerca non disponibile: controlla la connessione.</span>'; }
}
function regioneSlug(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z]+/g,'-').replace(/^-|-$/g,''); }

/* ---------------------------------------------------------------- attesa di un click nell'overlay */
let attesa=null;
function attendi(azioni){ azioni=[].concat(azioni); return new Promise(res=>{ attesa={azioni,res}; }); }
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-p]'); if(!b||!ov||!ov.contains(b)) return;
  const p=b.dataset.p, v=b.dataset.v;
  if(p==='tab') return schermataAccesso(v);
  if(p==='accedi') return accedi();
  if(p==='registrati') return registrati();
  if(p==='reset') return resetPassword();
  if(p==='nuovapass') return nuovaPassword();
  if(p==='esci'){ await sb.auth.signOut(); LS.set('azienda',null); location.replace(location.pathname); return; }
  if(p==='luogo'){ const x=$p('#p_res')._R[+v]; luogoScelto={nome:x.name,regione:regioneSlug(x.admin1),lat:+x.latitude.toFixed(4),lon:+x.longitude.toFixed(4)}; $p('#p_comune').value=x.name; $p('#p_res').innerHTML=''; $p('#p_luogo').textContent=`${x.name} (${x.admin2||''}, ${x.admin1||''}) · ${luogoScelto.lat}, ${luogoScelto.lon}`; errore(''); return; }
  if(attesa&&attesa.azioni.includes(p)){ const a=attesa; attesa=null; a.res({p,v}); }
});
document.addEventListener('keydown',e=>{ if(e.key!=='Enter'||!ov||ov.hidden||!ov.contains(e.target)) return; const b=ov.querySelector('.btn.primary'); if(b){e.preventDefault(); b.click()} });

/* ---------------------------------------------------------------- archivio dati (adattatore db) */
function creaStore(azId){
  const dati=new Map(); const ascolti=new Map(); let pronto=false; const inAttesa=[];
  const col=c=>{ if(!dati.has(c)) dati.set(c,new Map()); return dati.get(c); };
  const pend=new Set(); let tm=null;
  const notifica=c=>{ pend.add(c); clearTimeout(tm); tm=setTimeout(()=>{ const P=[...pend]; pend.clear(); P.forEach(emetti) },30); };
  const emetti=c=>{ const L=ascolti.get(c); if(!L) return; const m=col(c); const snap={docs:[...m.entries()].map(([id,d])=>({id,data:()=>d}))}; L.forEach(f=>{try{f(snap)}catch(e){console.error(e)}}); };
  async function carica(){
    let da=0; const passo=1000;
    for(;;){ const {data,error}=await sb.from('documenti').select('col,id,data').eq('azienda_id',azId).order('col').order('id').range(da,da+passo-1);
      if(error) throw error; for(const r of data) col(r.col).set(r.id,r.data); if(data.length<passo) break; da+=passo; }
    pronto=true; inAttesa.splice(0).forEach(f=>f());
    sb.channel('documenti-'+azId).on('postgres_changes',{event:'*',schema:'public',table:'documenti',filter:'azienda_id=eq.'+azId},p=>{
      if(p.eventType==='DELETE'){ const o=p.old||{}; if(o.col&&o.id){ col(o.col).delete(o.id); notifica(o.col) } }
      else { const n=p.new; if(n&&n.col){ col(n.col).set(n.id,n.data); notifica(n.col) } }
    }).subscribe();
  }
  const api={
    collection(c){ return {
      onSnapshot(cb,err){ if(!ascolti.has(c)) ascolti.set(c,new Set()); ascolti.get(c).add(cb); const go=()=>emetti(c); pronto?setTimeout(go,0):inAttesa.push(go); return ()=>ascolti.get(c).delete(cb); },
      doc(id){ return {
        async set(body){ const prima=col(c).get(id); col(c).set(id,body); notifica(c);
          const {error}=await sb.from('documenti').upsert({azienda_id:azId,col:c,id,data:body},{onConflict:'azienda_id,col,id'});
          if(error){ prima===undefined?col(c).delete(id):col(c).set(id,prima); notifica(c); throw new Error(msgErr(error)); } },
        async delete(){ const prima=col(c).get(id); col(c).delete(id); notifica(c);
          const {error}=await sb.from('documenti').delete().match({azienda_id:azId,col:c,id});
          if(error){ if(prima!==undefined){col(c).set(id,prima); notifica(c)} throw new Error(msgErr(error)); } },
        async get(){ return col(c).get(id); }
      }; }
    }; },
    // scrittura di molti documenti in un colpo (meteo, importazioni)
    async setMany(rows){ for(let i=0;i<rows.length;i+=200){ const chunk=rows.slice(i,i+200);
        const {error}=await sb.from('documenti').upsert(chunk.map(r=>({azienda_id:azId,col:r.col,id:r.id,data:r.data})),{onConflict:'azienda_id,col,id'}); if(error) throw new Error(msgErr(error));
        chunk.forEach(r=>{col(r.col).set(r.id,r.data); notifica(r.col)}); } },
    async deleteMany(rows){ for(const r of rows){ const {error}=await sb.from('documenti').delete().match({azienda_id:azId,col:r.col,id:r.id}); if(error) throw new Error(msgErr(error)); col(r.col).delete(r.id); notifica(r.col); } },
    tutti(c){ return [...col(c).entries()].map(([id,d])=>({id,...d})); },
    tuttoExport(){ const out=[]; for(const [c,m] of dati) for(const [id,d] of m) out.push({col:c,id,data:d}); return out; },
    carica
  };
  return api;
}

/* ---------------------------------------------------------------- foto (Storage) */
const URLF=new Map(); const daFirmare=new Set(); let tf=null;
function fotoUrl(id){
  if(!id) return '';
  const u=URLF.get(id); if(u&&u.scade>Date.now()) return u.url;
  daFirmare.add(id); clearTimeout(tf); tf=setTimeout(firma,20);
  return 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
}
async function firma(){
  const ids=[...daFirmare]; daFirmare.clear(); if(!ids.length) return;
  const {data,error}=await sb.storage.from('foto').createSignedUrls(ids,3600*24);
  if(error||!data) return;
  data.forEach(x=>{ if(x.signedUrl) URLF.set(x.path,{url:x.signedUrl,scade:Date.now()+3600*23*1000}) });
  if(typeof render==='function') render();
}
const assetsApi={
  async upload(blob,opts={}){
    if(RUOLI[ruolo]<2) throw new Error('Non hai i permessi per caricare foto.');
    const ext=(blob.type||opts.type||'image/jpeg').includes('png')?'png':(blob.type||'').includes('webp')?'webp':'jpg';
    const path=`${azienda.id}/${(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2))}.${ext}`;
    const {error}=await sb.storage.from('foto').upload(path,blob,{contentType:blob.type||'image/jpeg',upsert:false});
    if(error) throw new Error(msgErr(error));
    const {data}=await sb.storage.from('foto').createSignedUrl(path,3600*24); if(data) URLF.set(path,{url:data.signedUrl,scade:Date.now()+3600*23*1000});
    return {id:path,url:data?data.signedUrl:'',sizeBytes:blob.size,contentType:blob.type};
  },
  async delete(id){ const {error}=await sb.storage.from('foto').remove([id]); if(error) throw new Error(msgErr(error)); URLF.delete(id); },
  async list(){ const {data}=await sb.storage.from('foto').list(azienda.id,{limit:1000}); return {assets:(data||[]).map(f=>({id:azienda.id+'/'+f.name,sizeBytes:f.metadata&&f.metadata.size})),usage:null}; }
};
const downloadsApi={ async save({filename,data}){ const blob=data instanceof Blob?data:new Blob([data],{type:/\.json$/i.test(filename)?'application/json':/\.csv$/i.test(filename)?'text/csv;charset=utf-8':'application/octet-stream'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500); } };

/* ---------------------------------------------------------------- meteo orario (Open-Meteo) */
const DIR8=['N','NE','E','SE','S','SO','O','NO'];
const r1=v=>v==null?null:Math.round(v*10)/10, r2=v=>v==null?null:Math.round(v*100)/100;
function oreDaRisposta(js,conPP){
  const H=js&&js.hourly; if(!H) return new Map(); const m=new Map();
  H.time.forEach((t,i)=>{ const d=t.slice(0,10), h=+t.slice(11,13);
    const o={h,t:r1(H.temperature_2m[i]),rh:r1(H.relative_humidity_2m[i]),td:r1(H.dew_point_2m[i]),p:r1(H.precipitation[i]),pp:conPP&&H.precipitation_probability?H.precipitation_probability[i]:null,v:r1(H.wind_speed_10m[i]),dir:H.wind_direction_10m[i]==null?null:DIR8[Math.round(H.wind_direction_10m[i]/45)%8],g:r1(H.wind_gusts_10m[i]),et0:r2(H.et0_fao_evapotranspiration[i]),cc:H.cloud_cover?H.cloud_cover[i]:null};
    if(!m.has(d)) m.set(d,[]); m.get(d)[h]=o; });
  return m;
}
const completo=ore=>ore&&ore.length===24&&ore.every(o=>o&&o.t!=null);
function giornaliero(data,ore){ const T=ore.map(o=>o.t).filter(v=>v!=null), U=ore.map(o=>o.rh).filter(v=>v!=null);
  return {data,tmin:T.length?Math.min(...T):null,tmax:T.length?Math.max(...T):null,pioggia:r1(ore.reduce((s,o)=>s+(o.p||0),0)),umidita:U.length?Math.round(U.reduce((a,b)=>a+b,0)/U.length):null}; }
const VARS='temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,et0_fao_evapotranspiration,cloud_cover';
async function aggiornaMeteo(forza){
  if(azienda.lat==null||RUOLI[ruolo]<2) return;
  const ultimo=Math.max(0,...store.tutti('meteoOre').map(d=>Date.parse(d.aggiornato)||0));
  if(!forza&&Date.now()-ultimo<3*3600e3) return;
  const base=`latitude=${azienda.lat}&longitude=${azienda.lon}&timezone=Europe%2FRome`;
  const [A,B]=await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${base}&past_days=7&forecast_days=3&models=italia_meteo_arpae_icon_2i&hourly=${VARS}`).then(r=>r.ok?r.json():null).catch(()=>null),
    fetch(`https://api.open-meteo.com/v1/forecast?${base}&past_days=7&forecast_days=8&hourly=${VARS},precipitation_probability`).then(r=>r.ok?r.json():null).catch(()=>null)]);
  if(!B&&!A) return;
  const mA=oreDaRisposta(A,false), mB=oreDaRisposta(B,true); const oggi=iso(new Date()); const ora=new Date().toISOString();
  const giorni=[...new Set([...mA.keys(),...mB.keys()])].sort(); const rows=[];
  for(const d of giorni){ const a=mA.get(d)||[], b=mB.get(d)||[]; let daA=0;
    const ore=Array.from({length:24},(_,h)=>{ const x=a[h], y=b[h]; if(x&&x.t!=null){daA++; return {...x,pp:y?y.pp:null}} return y||null; });
    if(!ore.some(Boolean)) continue;
    const ore2=ore.map((o,h)=>o||{h,t:null,rh:null,td:null,p:null,pp:null,v:null,dir:null,g:null,et0:null,cc:null});
    rows.push({col:'meteoOre',id:'h'+d,data:{data:d,ore:ore2,fonte:'open-meteo',modello:daA>=12?'ICON-2I':'globale',aggiornato:ora}});
    rows.push({col:'meteo',id:'d'+d,data:{...giornaliero(d,ore2),fonte:d<oggi?'stima':'previsione',mb:true}});
  }
  await store.setMany(rows);
  await archivia();
  await recuperaStagione();
}
// i giorni orari più vecchi di 30 giorni vanno nell'archivio mensile
async function archivia(){
  const lim=iso(addD(new Date(),-30)); const vecchi=store.tutti('meteoOre').filter(d=>d.data&&d.data<lim);
  if(!vecchi.length) return;
  const perMese=new Map(); vecchi.forEach(d=>{const m=d.data.slice(0,7); if(!perMese.has(m)) perMese.set(m,[]); perMese.get(m).push(d)});
  const rows=[];
  for(const [m,L] of perMese){ const arc=store.tutti('meteoArchivio').find(a=>a.id==='a'+m)||{mese:m,fonte:'open-meteo',giorni:[],giornaliero:[]};
    const g=new Map((arc.giorni||[]).map(x=>[x.data,x])), gg=new Map((arc.giornaliero||[]).map(x=>[x.data,x]));
    L.forEach(d=>{ if(!g.has(d.data)) g.set(d.data,{data:d.data,modello:d.modello,ore:d.ore}); if(!gg.has(d.data)) gg.set(d.data,giornaliero(d.data,d.ore)); });
    const doc={...arc,giorni:[...g.values()].sort((a,b)=>a.data.localeCompare(b.data)),giornaliero:[...gg.values()].sort((a,b)=>a.data.localeCompare(b.data)),aggiornato:new Date().toISOString()}; delete doc.id;
    rows.push({col:'meteoArchivio',id:'a'+m,data:doc}); }
  await store.setMany(rows);
  await store.deleteMany(vecchi.flatMap(d=>[{col:'meteoOre',id:d.id},{col:'meteo',id:'d'+d.data}]).filter(r=>r.col==='meteoOre'||store.tutti('meteo').some(x=>x.id===r.id)));
}
// recupera il meteo orario della stagione dal 1° gennaio (serve ai modelli: maturazione oospore, gradi giorno)
async function recuperaStagione(){
  const presenti=new Set(); store.tutti('meteoArchivio').forEach(a=>(a.giorni||[]).forEach(g=>{if(completo(g.ore)) presenti.add(g.data)})); store.tutti('meteoOre').forEach(d=>presenti.add(d.data));
  const anno=new Date().getFullYear(); const inizio=new Date(anno,0,1), fine=addD(new Date(),-8);
  const mancanti=[]; for(let d=new Date(inizio); d<=fine; d=addD(d,1)){ const s=iso(d); if(!presenti.has(s)) mancanti.push(s); }
  if(!mancanti.length) return;
  const mesi=[...new Set(mancanti.map(s=>s.slice(0,7)))];
  for(const m of mesi){
    const da=mancanti.find(s=>s.startsWith(m)), a=[...mancanti].reverse().find(s=>s.startsWith(m));
    const js=await fetch(`https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${azienda.lat}&longitude=${azienda.lon}&timezone=Europe%2FRome&start_date=${da}&end_date=${a}&hourly=${VARS}`).then(r=>r.ok?r.json():null).catch(()=>null);
    if(!js) continue; const mm=oreDaRisposta(js,false);
    const arc=store.tutti('meteoArchivio').find(x=>x.id==='a'+m)||{mese:m,fonte:'open-meteo',giorni:[],giornaliero:[]};
    const g=new Map((arc.giorni||[]).map(x=>[x.data,x])), gg=new Map((arc.giornaliero||[]).map(x=>[x.data,x]));
    for(const [d,ore] of mm){ if(!completo(ore)) continue; g.set(d,{data:d,modello:'storico',ore}); gg.set(d,giornaliero(d,ore)); }
    const doc={...arc,giorni:[...g.values()].sort((x,y)=>x.data.localeCompare(y.data)),giornaliero:[...gg.values()].sort((x,y)=>x.data.localeCompare(y.data)),aggiornato:new Date().toISOString()}; delete doc.id;
    await store.setMany([{col:'meteoArchivio',id:'a'+m,data:doc}]);
  }
}

/* ---------------------------------------------------------------- bollettini fitosanitari regionali */
const FONTI_BOL={
  abruzzo:{elenco:'https://agroambiente.regione.abruzzo.it/node/3',nodo:n=>`https://agroambiente.regione.abruzzo.it/node/${n}`,tipo:/difesa vite/i}
};
function testoBlocchi(el){
  el.querySelectorAll('br').forEach(b=>b.replaceWith('\n'));
  el.querySelectorAll('p,h1,h2,h3,h4,h5,li,tr,div,table').forEach(b=>b.after('\n'));
  return el.textContent.replace(/[ \t ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n+/g,'\n').trim();
}
async function aggiornaBollettini(forza){
  const F=FONTI_BOL[azienda.regione]; if(!F||RUOLI[ruolo]<2) return;
  const chiave='bol.'+azienda.id; const ult=+LS.get(chiave)||0; if(!forza&&Date.now()-ult<12*3600e3) return;
  const html=await fetch(F.elenco).then(r=>r.ok?r.text():null).catch(()=>null); if(!html) return;
  LS.set(chiave,String(Date.now()));
  const doc=new DOMParser().parseFromString(html,'text/html');
  const presenti=new Set(store.tutti('bollettini').map(b=>b.node));
  const maxN=Math.max(0,...presenti);
  const anno=String(new Date().getFullYear()-(new Date().getMonth()<2?1:0));
  let nodi=[...new Set([...doc.querySelectorAll('a[href*="/node/"]')].map(a=>+((a.getAttribute('href')||'').match(/\/node\/(\d+)$/)||[])[1]).filter(Boolean))];
  nodi=nodi.filter(n=>!presenti.has(n)&&(maxN?n>maxN:true)).sort((a,b)=>a-b);
  const rows=[];
  for(const n of nodi.slice(-60)){
    const h=await fetch(F.nodo(n)).then(r=>r.ok?r.text():null).catch(()=>null); if(!h) continue;
    const d=new DOMParser().parseFromString(h,'text/html');
    const tipo=(d.querySelector('.field-name-field-tipo .field-item')||{}).textContent||''; if(!F.tipo.test(tipo)) continue;
    const dataEl=d.querySelector('.field-name-field-date [content]'); const data=(dataEl&&dataEl.getAttribute('content')||'').slice(0,10); if(!data) continue;
    if(!maxN&&data.slice(0,4)<anno) continue;
    const corpo=d.querySelector('.field-name-body .field-item'); if(!corpo) continue;
    const titolo=((d.querySelector('h1.title,h1#page-title,h1')||{}).textContent||'Bollettino').trim();
    rows.push({col:'bollettini',id:'b-'+n,data:{regione:azienda.regione,coltura:'vite',data,titolo,url:F.nodo(n),node:n,testo:testoBlocchi(corpo),importato:iso(new Date())}});
  }
  if(rows.length) await store.setMany(rows);
}

/* ---------------------------------------------------------------- menu, membri, inviti, importazione */
window.vingeoMenuHtml=function(){
  if(!azienda) return '';
  return `<div class="pmenu"><b>${esc(azienda.nome)}</b><span>${esc(sessione.user.email)}</span>
   <div class="prow"><button data-act="plat-azienda">Azienda e utenti</button>·<button data-act="plat-cambia">Cambia azienda</button>·<button data-act="plat-esci">Esci</button></div></div>`;
};
async function pannelloAzienda(){
  const tit=RUOLI[ruolo]===3;
  const {data:M}=await sb.rpc('membri_azienda',{az:azienda.id});
  const {data:I}=tit?await sb.from('inviti').select('*').eq('azienda_id',azienda.id).is('usato',null).order('creato',{ascending:false}):{data:[]};
  const link=c=>location.origin+location.pathname+'?invito='+c;
  openModal(`${dlgHead('Azienda e utenti')}<div class="dlg-b" style="display:flex;flex-direction:column;gap:16px">
    <section style="display:flex;flex-direction:column;gap:8px"><h3 style="margin:0">Azienda</h3>
      ${tit?`<div class="fg">${fld('Nome',`<input id="pa_nome" value="${esc(azienda.nome)}">`)}${fld('Comune (punto meteo)',`<input id="pa_comune" value="${esc(azienda.comune||'')}" disabled>`)}</div>
      <div class="pnote" style="font-size:.82rem;color:var(--muted)">Coordinate meteo: ${azienda.lat??'—'}, ${azienda.lon??'—'} · regione: ${esc(azienda.regione||'—')}</div>
      <div><button class="btn small" data-act="plat-salva-az">Salva nome</button></div>`:`<p>${esc(azienda.nome)} · ${esc(azienda.comune||'')}</p>`}
    </section>
    <section style="display:flex;flex-direction:column;gap:8px"><h3 style="margin:0">Persone</h3>
      <div class="pmembers">${(M||[]).map(m=>`<div class="pmember"><span>${esc(m.email)}${m.user_id===sessione.user.id?' <span class="muted small">(tu)</span>':''}<br><span class="muted small">${esc(RUOLO_TXT[m.ruolo]||m.ruolo)}</span></span>
        ${tit&&m.user_id!==sessione.user.id?`<span style="display:flex;gap:6px"><select data-plat-ruolo="${m.user_id}">${['titolare','collaboratore','lettore'].map(r=>`<option value="${r}" ${r===m.ruolo?'selected':''}>${r}</option>`).join('')}</select><button class="btn small danger" data-act="plat-rimuovi" data-id="${m.user_id}">Rimuovi</button></span>`:''}</div>`).join('')}</div>
      ${tit?`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select id="pa_ruolo"><option value="collaboratore">Collaboratore (può modificare)</option><option value="lettore">Lettore (solo consultazione)</option></select><button class="btn small primary" data-act="plat-invita">Crea link di invito</button></div>
      ${(I||[]).length?`<div style="display:flex;flex-direction:column;gap:6px"><span class="muted small">Inviti aperti (validi 14 giorni, ognuno vale per una persona):</span>${I.map(i=>`<div class="pinv">${esc(link(i.codice))}<br><span class="muted small">${esc(i.ruolo)} · scade il ${new Date(i.scade).toLocaleDateString('it-IT')}</span> <button class="btn small" data-act="plat-copia" data-v="${esc(link(i.codice))}">Copia</button> <button class="btn small" data-act="plat-del-invito" data-id="${esc(i.codice)}">Annulla</button></div>`).join('')}</div>`:''}`:''}
      ${!tit?`<div><button class="btn small danger" data-act="plat-lascia">Lascia questa azienda</button></div>`:''}
    </section>
    <section style="display:flex;flex-direction:column;gap:8px"><h3 style="margin:0">Account</h3>
      <div class="muted small">${esc(sessione.user.email)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" data-act="plat-cambia">Cambia o crea azienda</button><button class="btn small" data-act="plat-esci">Esci</button></div>
    </section>
    <section style="display:flex;flex-direction:column;gap:8px"><h3 style="margin:0">Dati</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" data-act="plat-esporta">Esporta tutti i dati (JSON)</button>${RUOLI[ruolo]>=2?`<label class="btn small">Importa da file JSON<input type="file" id="pa_import" accept=".json,application/json" hidden></label><button class="btn small" data-act="plat-meteo">Aggiorna meteo e bollettini</button>`:''}</div>
      ${tit?`<div><button class="btn small danger" data-act="plat-elimina-az">Elimina l'azienda e tutti i suoi dati</button></div>`:''}
    </section></div>`);
  const fi=document.getElementById('pa_import'); if(fi) fi.addEventListener('change',()=>importa(fi.files[0]));
  document.querySelectorAll('[data-plat-ruolo]').forEach(s=>s.addEventListener('change',async()=>{ const {error}=await sb.from('membri').update({ruolo:s.value}).match({azienda_id:azienda.id,user_id:s.dataset.platRuolo}); toast(error?msgErr(error):'Ruolo aggiornato'); pannelloAzienda(); }));
}
async function importa(file){
  if(!file) return; let js; try{ js=JSON.parse(await file.text()) }catch(e){ return toast('File non valido') }
  // formati accettati: [{col,id,data}] oppure {collezione:[{id,...}]} oppure {collezione:{id:{...}}}
  let rows=[];
  if(Array.isArray(js)) rows=js.filter(r=>r&&r.col&&r.id).map(r=>({col:r.col,id:String(r.id),data:r.data||{}}));
  else for(const [c,v] of Object.entries(js)){ if(!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(c)) continue;
    if(Array.isArray(v)) v.forEach(d=>{ if(d&&d.id!=null){const {id,...r}=d; rows.push({col:c,id:String(id),data:r})} });
    else if(v&&typeof v==='object') Object.entries(v).forEach(([id,d])=>rows.push({col:c,id,data:d})); }
  rows=rows.filter(r=>/^[A-Za-z0-9_.:@+~-]{1,200}$/.test(r.id)).map(r=>{const d={...r.data}; for(const k of Object.keys(d)) if(k.startsWith('_')) delete d[k]; return {...r,data:d}});
  if(!rows.length) return toast('Nessun dato riconosciuto nel file');
  if(!confirm(`Importare ${rows.length} documenti? Quelli con lo stesso identificativo verranno sovrascritti.`)) return;
  try{ await store.setMany(rows); toast(`Importati ${rows.length} documenti`); closeModal(); }catch(e){ toast(e.message) }
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-act^="plat-"]'); if(!b) return; e.preventDefault(); e.stopPropagation();
  const a=b.dataset.act;
  try{
    if(a==='plat-azienda') return pannelloAzienda();
    if(a==='plat-cambia'){ location.href=location.pathname+'?scegli=1'; return; }
    if(a==='plat-esci'){ await sb.auth.signOut(); LS.set('azienda',null); location.replace(location.pathname); return; }
    if(a==='plat-salva-az'){ const nome=document.getElementById('pa_nome').value.trim(); if(!nome) return; const {error}=await sb.from('aziende').update({nome}).eq('id',azienda.id); if(error) return toast(msgErr(error)); azienda.nome=nome; toast('Salvato'); render(); return pannelloAzienda(); }
    if(a==='plat-invita'){ const r=document.getElementById('pa_ruolo').value; const {error}=await sb.from('inviti').insert({azienda_id:azienda.id,ruolo:r,creato_da:sessione.user.id}); if(error) return toast(msgErr(error)); return pannelloAzienda(); }
    if(a==='plat-copia'){ try{ await navigator.clipboard.writeText(b.dataset.v); toast('Link copiato') }catch(err){ toast('Copia il link a mano') } return; }
    if(a==='plat-del-invito'){ await sb.from('inviti').delete().eq('codice',b.dataset.id); return pannelloAzienda(); }
    if(a==='plat-rimuovi'){ if(!confirm('Togliere questa persona dall\'azienda?')) return; const {error}=await sb.from('membri').delete().match({azienda_id:azienda.id,user_id:b.dataset.id}); if(error) return toast(msgErr(error)); return pannelloAzienda(); }
    if(a==='plat-lascia'){ if(!confirm('Lasciare questa azienda? Non vedrai più i suoi dati.')) return; const {error}=await sb.from('membri').delete().match({azienda_id:azienda.id,user_id:sessione.user.id}); if(error) return toast(msgErr(error)); LS.set('azienda',null); location.replace(location.pathname); return; }
    if(a==='plat-esporta'){ await downloadsApi.save({filename:`vingeo-${azienda.nome.replace(/[^\w]+/g,'-').toLowerCase()}-${iso(new Date())}.json`,data:JSON.stringify(store.tuttoExport())}); return; }
    if(a==='plat-meteo'){ toast('Aggiornamento in corso…'); await aggiornaMeteo(true); await aggiornaBollettini(true); toast('Meteo e bollettini aggiornati'); return; }
    if(a==='plat-elimina-az'){ const t=prompt(`Per eliminare definitivamente "${azienda.nome}" e tutti i suoi dati scrivi il nome dell'azienda:`); if(t!==azienda.nome) return toast('Eliminazione annullata');
      const {data:F}=await sb.storage.from('foto').list(azienda.id,{limit:1000}); if(F&&F.length) await sb.storage.from('foto').remove(F.map(f=>azienda.id+'/'+f.name));
      const {error}=await sb.from('aziende').delete().eq('id',azienda.id); if(error) return toast(msgErr(error)); LS.set('azienda',null); location.replace(location.pathname); return; }
  }catch(err){ toast(msgErr(err)) }
},true);

/* ---------------------------------------------------------------- avvio */
async function avvio(){
  if(!window.supabase||!CFG.supabaseUrl||!CFG.supabaseAnonKey){
    overlay(`<div class="card"><b>Configurazione mancante</b><p class="pnote">Imposta l'indirizzo del progetto Supabase e la chiave pubblica in config.js (vedi README).</p></div>`);
    return new Promise(()=>{});
  }
  sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  window.vingeoSupabase=sb;
  const recupero=new Promise(res=>{ sb.auth.onAuthStateChange((ev,s)=>{ if(ev==='PASSWORD_RECOVERY') res(true); if(ev==='SIGNED_OUT'&&azienda) location.replace(location.pathname); }); setTimeout(()=>res(false),400); });
  let {data:{session}}=await sb.auth.getSession();
  if(await recupero){ schermataNuovaPassword(); return new Promise(()=>{}); }
  if(!session){
    schermataAccesso(params.get('invito')?'registrati':'accedi');
    session=await new Promise(res=>{ const {data:{subscription}}=sb.auth.onAuthStateChange((ev,s)=>{ if(s&&(ev==='SIGNED_IN'||ev==='INITIAL_SESSION'||ev==='TOKEN_REFRESHED')){ subscription.unsubscribe(); res(s) } }); });
  }
  sessione=session;
  azienda=await scegliAzienda(); ruolo=azienda.ruolo; LS.set('azienda',azienda.id);
  if(params.has('scegli')){ params.delete('scegli'); history.replaceState(null,'',location.pathname+(params.toString()?'?'+params:'')+location.hash); }
  overlay(`<div class="card"><b>Caricamento di ${esc(azienda.nome)}…</b><span class="pnote">Recupero vigneti, trattamenti e meteo.</span></div>`);
  window.vingeoAzienda={id:azienda.id,nome:azienda.nome,comune:azienda.comune,regione:azienda.regione,lat:azienda.lat,lon:azienda.lon,ruolo};
  store=creaStore(azienda.id); await store.carica();
  // prima apertura di un'azienda nuova: impostazioni di base
  if(RUOLI[ruolo]>=2&&!store.tutti('impostazioni').some(x=>x.id==='main')) await store.setMany([{col:'impostazioni',id:'main',data:{nome:azienda.nome,inizio:'01-01'}}]);
  window.vingeoFotoUrl=fotoUrl;
  window.claude={ use: async name=>{
    if(name==='db') return store;
    if(name==='assets') return RUOLI[ruolo]>=2?assetsApi:null;
    if(name==='downloads') return downloadsApi;
    if(name==='user') return { can:async k=>k==='data.write'?RUOLI[ruolo]>=2:RUOLI[ruolo]>=1, isOwner:()=>ruolo==='titolare', canEdit:()=>RUOLI[ruolo]>=2, id:async()=>sessione.user.id };
    return null; } };
  chiudiOverlay();
  const br=document.querySelector('.brand'); if(br&&!br.querySelector('.pacct')){ const bt=document.createElement('button'); bt.className='pacct'; bt.dataset.act='plat-azienda'; bt.textContent=azienda.nome; bt.setAttribute('aria-label','Azienda e account'); br.appendChild(bt); }
  // servizi in background: meteo e bollettini
  setTimeout(async()=>{ try{ await aggiornaMeteo(false) }catch(e){ console.warn('meteo',e) } try{ await aggiornaBollettini(false) }catch(e){ console.warn('bollettini',e) } },500);
  setInterval(()=>{ aggiornaMeteo(false).catch(()=>{}) },3600e3);
}
window.vingeoPronto=avvio();
window.vingeoTest={ oreDaRisposta, giornaliero, testoBlocchi, regioneSlug };
})();
