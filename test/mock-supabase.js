/* Finto client Supabase per i test end-to-end nel browser (nessun server).
   Riproduce il sottoinsieme di API usato da piattaforma.js; i dati restano in localStorage. */
(function(){
const KEY='mocksb';
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||null}catch(e){return null}};
let DB=load()||{users:[],session:null,aziende:[],membri:[],documenti:[],inviti:[],foto:{}};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(DB))}catch(e){}};
const uuid=()=>crypto.randomUUID();
const ok=data=>({data,error:null}), ko=m=>({data:null,error:{message:m}});
const uid=()=>DB.session&&DB.session.user.id;
const ruolo=az=>{const m=DB.membri.find(x=>x.azienda_id===az&&x.user_id===uid());return m?{titolare:3,collaboratore:2,lettore:1}[m.ruolo]:0};
const listeners=[];
function emit(ev){ listeners.forEach(f=>setTimeout(()=>f(ev,DB.session),0)); }
const auth={
  async getSession(){ return ok({session:DB.session}); },
  onAuthStateChange(cb){ listeners.push(cb); setTimeout(()=>cb('INITIAL_SESSION',DB.session),0); return {data:{subscription:{unsubscribe(){const i=listeners.indexOf(cb); if(i>=0) listeners.splice(i,1)}}}}; },
  async signUp({email,password}){ if(DB.users.some(u=>u.email===email)) return ko('User already registered'); if(password.length<8) return ko('Password should be at least 8 characters'); const u={id:uuid(),email,password}; DB.users.push(u); DB.session={user:{id:u.id,email}}; save(); emit('SIGNED_IN'); return ok({session:DB.session,user:DB.session.user}); },
  async signInWithPassword({email,password}){ const u=DB.users.find(x=>x.email===email&&x.password===password); if(!u) return ko('Invalid login credentials'); DB.session={user:{id:u.id,email}}; save(); emit('SIGNED_IN'); return ok({session:DB.session}); },
  async signOut(){ DB.session=null; save(); emit('SIGNED_OUT'); return ok(null); },
  async resetPasswordForEmail(){ return ok({}); },
  async updateUser(){ return ok({}); }
};
function table(name){
  let op='select', filters=[], payload=null, single=false, embed=false, rng=null, opts={};
  const rows=()=>DB[name];
  const visible=r=>{
    if(name==='aziende') return ruolo(r.id)>0||r.creata_da===uid();
    if(name==='membri') return ruolo(r.azienda_id)>0;
    if(name==='documenti') return ruolo(r.azienda_id)>0;
    if(name==='inviti') return ruolo(r.azienda_id)===3;
    return true; };
  const match=r=>filters.every(([k,v,t])=>t==='is'?(r[k]??null)===v:r[k]===v);
  const b={
    select(cols){ if(op==='select'||op==='insert') { if(cols&&cols.includes('aziende(')) embed=true; } return b; },
    eq(k,v){filters.push([k,v]);return b}, is(k,v){filters.push([k,v,'is']);return b}, match(o){Object.entries(o).forEach(([k,v])=>filters.push([k,v]));return b},
    order(){return b}, range(a,z){rng=[a,z];return b}, single(){single=true;return b},
    insert(p){op='insert';payload=[].concat(p);return b}, upsert(p,o){op='upsert';payload=[].concat(p);opts=o||{};return b},
    update(p){op='update';payload=p;return b}, delete(){op='delete';return b},
    then(res,rej){ try{ res(exec()) }catch(e){ rej(e) } }
  };
  function exec(){
    if(!uid()) return ko('permission denied');
    if(op==='select'){ let R=rows().filter(visible).filter(match); if(rng) R=R.slice(rng[0],rng[1]+1);
      if(embed) R=R.map(r=>({...r,aziende:DB.aziende.find(a=>a.id===r.azienda_id)||null}));
      R=JSON.parse(JSON.stringify(R)); return ok(single?R[0]||null:R); }
    if(op==='insert'){ const out=[];
      for(const p of payload){ let r={...p};
        if(name==='aziende'){ r={id:uuid(),creata:new Date().toISOString(),...r}; DB.aziende.push(r); DB.membri.push({azienda_id:r.id,user_id:uid(),ruolo:'titolare',aggiunto:new Date().toISOString()}); }
        else if(name==='inviti'){ if(ruolo(r.azienda_id)!==3) return ko('new row violates row-level security policy'); r={codice:uuid().replace(/-/g,''),creato:new Date().toISOString(),scade:new Date(Date.now()+14*864e5).toISOString(),usato:null,...r}; DB.inviti.push(r); }
        else rows().push(r);
        out.push(r); }
      save(); return ok(single?out[0]:out); }
    if(op==='upsert'){ for(const p of payload){ if(name==='documenti'&&ruolo(p.azienda_id)<2) return ko('new row violates row-level security policy for table "documenti"');
        const i=rows().findIndex(r=>r.azienda_id===p.azienda_id&&r.col===p.col&&r.id===p.id); const r={...p,aggiornato:new Date().toISOString(),aggiornato_da:uid()}; if(i>=0) rows()[i]=r; else rows().push(r); }
      save(); return ok(null); }
    if(op==='update'){ const R=rows().filter(visible).filter(match); if(name==='documenti'&&R.some(r=>ruolo(r.azienda_id)<2)) return ok([]); if((name==='aziende'||name==='membri')&&R.some(r=>ruolo(r.azienda_id||r.id)<3)) return ok([]); R.forEach(r=>Object.assign(r,payload)); save(); return ok(R); }
    if(op==='delete'){ const R=rows().filter(visible).filter(match);
      if(name==='documenti'&&R.some(r=>ruolo(r.azienda_id)<2)) return ok([]);
      if(name==='membri'&&R.some(r=>r.ruolo==='titolare'&&!DB.membri.some(m=>m.azienda_id===r.azienda_id&&m.ruolo==='titolare'&&m.user_id!==r.user_id))) return ko("L'azienda deve avere almeno un titolare");
      if(name==='aziende'){ R.forEach(a=>{ if(ruolo(a.id)!==3) return; DB.documenti=DB.documenti.filter(d=>d.azienda_id!==a.id); DB.membri=DB.membri.filter(m=>m.azienda_id!==a.id); DB.inviti=DB.inviti.filter(m=>m.azienda_id!==a.id); }); }
      DB[name]=rows().filter(r=>!R.includes(r)); save(); return ok(R); }
  }
  return b;
}
async function rpc(fn,args){
  if(fn==='accetta_invito'){ const i=DB.inviti.find(x=>x.codice===args.p_codice); if(!i) return ko('Invito non valido'); if(i.usato) return ko('Invito già usato');
    if(!DB.membri.some(m=>m.azienda_id===i.azienda_id&&m.user_id===uid())) DB.membri.push({azienda_id:i.azienda_id,user_id:uid(),ruolo:i.ruolo,aggiunto:new Date().toISOString()});
    i.usato=new Date().toISOString(); i.usato_da=uid(); save(); return ok(i.azienda_id); }
  if(fn==='membri_azienda'){ if(!ruolo(args.az)) return ok([]); return ok(DB.membri.filter(m=>m.azienda_id===args.az).map(m=>({user_id:m.user_id,email:(DB.users.find(u=>u.id===m.user_id)||{}).email,ruolo:m.ruolo,aggiunto:m.aggiunto}))); }
  return ko('rpc sconosciuta');
}
const storage={ from(){ return {
  async upload(path,blob){ const r=new FileReader(); const url=await new Promise(res=>{r.onload=()=>res(r.result); r.readAsDataURL(blob)}); DB.foto[path]=url; save(); return ok({path}); },
  async createSignedUrls(paths){ return ok(paths.map(p=>({path:p,signedUrl:DB.foto[p]||null}))); },
  async createSignedUrl(p){ return ok({signedUrl:DB.foto[p]}); },
  async remove(paths){ paths.forEach(p=>delete DB.foto[p]); save(); return ok(null); },
  async list(prefix){ return ok(Object.keys(DB.foto).filter(p=>p.startsWith(prefix+'/')).map(p=>({name:p.slice(prefix.length+1)}))); }
}; } };
function channel(){ const c={on(){return c}, subscribe(){return c}}; return c; }
window.supabase={ createClient(){ return {auth, from:table, rpc, channel, storage}; } };
window.__mockDB=()=>DB;
})();
