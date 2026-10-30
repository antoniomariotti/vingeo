"""Test end-to-end della web app multi-utente con un Supabase finto (test/mock-supabase.js)
e risposte registrate di Open-Meteo e del sito dei bollettini. Uso: python3 test/e2e.py"""
import asyncio, json, pathlib, subprocess, time, sys, urllib.parse
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
FX = ROOT / 'test' / 'fixture'
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'test' / 'out'
OUT.mkdir(parents=True, exist_ok=True)
PORT = 8790
srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '--directory', str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
STORICO = json.loads((FX / 'storico.json').read_text())
fails = []
def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

async def routes(ctx):
    async def supa(route): await route.fulfill(path=str(ROOT / 'test' / 'mock-supabase.js'), content_type='application/javascript')
    await ctx.route('**/supabase-js@*/**', supa)
    async def meteo(route):
        u = urllib.parse.urlparse(route.request.url); q = urllib.parse.parse_qs(u.query)
        if 'historical' in u.netloc:
            a, z = q['start_date'][0], q['end_date'][0]; H = STORICO['hourly']
            idx = [i for i, t in enumerate(H['time']) if a <= t[:10] <= z]
            body = {'hourly': {k: [v[i] for i in idx] for k, v in H.items()}}
            return await route.fulfill(body=json.dumps(body), content_type='application/json')
        f = 'meteoA.json' if 'models=italia' in route.request.url else 'meteoB.json'
        await route.fulfill(path=str(FX / f), content_type='application/json')
    await ctx.route('https://api.open-meteo.com/**', meteo)
    await ctx.route('https://historical-forecast-api.open-meteo.com/**', meteo)
    async def geo(route):
        await route.fulfill(body=json.dumps({'results': [{'name': 'Pollutri', 'latitude': 42.1356, 'longitude': 14.5935, 'admin1': 'Abruzzo', 'admin2': 'Chieti'}]}), content_type='application/json')
    await ctx.route('https://geocoding-api.open-meteo.com/**', geo)
    async def bol(route):
        u = route.request.url
        if u.endswith('/node/3'): return await route.fulfill(path=str(FX / 'bol-elenco.html'), content_type='text/html')
        n = u.rsplit('/', 1)[-1]; f = FX / f'bol-{n}.html'
        if f.exists(): return await route.fulfill(path=str(f), content_type='text/html')
        await route.fulfill(status=404, body='')
    await ctx.route('https://agroambiente.regione.abruzzo.it/**', bol)
    await ctx.route('https://server.arcgisonline.com/**', lambda r: r.fulfill(status=404, body=''))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 860})
        await routes(ctx)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        base = f'http://127.0.0.1:{PORT}/index.html'
        await pg.goto(base); await pg.wait_for_timeout(600)
        check(await pg.is_visible('#plat'), 'schermata di accesso visibile')
        await pg.screenshot(path=str(OUT / '01-accesso.png'))
        # registrazione
        await pg.click('[data-p=tab][data-v=registrati]')
        await pg.fill('#p_email', 'antonio@example.it'); await pg.fill('#p_pass', 'password123'); await pg.fill('#p_pass2', 'password123')
        await pg.click('[data-p=registrati]')
        try: await pg.wait_for_selector('#p_nome', timeout=8000)
        except Exception: pass
        if not await pg.is_visible('#p_nome'):
            await pg.screenshot(path=str(OUT / '00-blocco.png')); print('   PLAT:', (await pg.inner_text('#plat'))[:300].replace('\n',' | ')); print('   DB:', await pg.evaluate("()=>JSON.stringify(window.__mockDB&&{u:__mockDB().users.length,s:!!__mockDB().session})"), errs)
        check(await pg.is_visible('#p_nome'), 'dopo la registrazione: creazione azienda')
        await pg.fill('#p_nome', 'Azienda Mariotti'); await pg.fill('#p_comune', 'Pollu'); await pg.wait_for_timeout(600)
        await pg.click('[data-p=luogo]'); await pg.screenshot(path=str(OUT / '02-nuova-azienda.png'))
        await pg.click('[data-p=crea]'); await pg.wait_for_timeout(1500)
        check(not await pg.is_visible('#plat'), 'app aperta dopo la creazione')
        side = await pg.inner_text('#sideFoot'); check('Azienda Mariotti' in side, 'nome azienda nel menu laterale')
        # meteo e bollettini in background
        for _ in range(40):
            n = await pg.evaluate("()=>({o:S.meteoOre.length,a:S.meteoArchivio.length,b:S.bollettini.length})")
            if n['o'] and n['a'] >= 9 and n['b']: break
            await pg.wait_for_timeout(500)
        print('   dati:', n)
        check(n['o'] > 0, 'meteo orario salvato')
        check(n['a'] >= 9, 'archivio meteo della stagione recuperato')
        check(n['b'] >= 1, 'bollettini regionali importati')
        # un vigneto e un trattamento di prova
        await pg.evaluate("""async()=>{ await put('appezzamenti','a1',{codice:'CHD',nome:'Chardo',varieta:'Chardonnay',colore:'bianca',ettari:0.5,anno:2005}); }""")
        await pg.evaluate("()=>{location.hash='difesa'}"); await pg.wait_for_timeout(1500)
        t = await pg.inner_text('main'); check('Bollettino fitosanitario regionale' in t and 'Pollutri' in t, 'pagina difesa con bollettino e luogo dell\'azienda')
        await pg.screenshot(path=str(OUT / '03-difesa.png'), full_page=False)
        # pannello azienda e invito
        await pg.click('#sideFoot [data-act=plat-azienda]'); await pg.wait_for_timeout(400)
        await pg.click('[data-act=plat-invita]'); await pg.wait_for_timeout(500)
        link = await pg.evaluate("()=>document.querySelector('[data-act=plat-copia]').dataset.v")
        check('?invito=' in link, 'link di invito creato')
        await pg.screenshot(path=str(OUT / '04-utenti.png'))
        await pg.evaluate("()=>closeModal()")
        # esporta
        async with pg.expect_download() as dl:
            await pg.click('#sideFoot [data-act=plat-azienda]'); await pg.wait_for_timeout(300); await pg.click('[data-act=plat-esporta]')
        d = await dl.value; data = json.loads(open(await d.path()).read())
        check(any(r['col'] == 'appezzamenti' for r in data), 'esportazione JSON con i dati')
        await pg.evaluate("()=>closeModal()")
        # esce; un collaboratore entra con l'invito
        await pg.click('#sideFoot [data-act=plat-esci]'); await pg.wait_for_timeout(800)
        await pg.goto(link); await pg.wait_for_timeout(600)
        check(await pg.is_visible('#p_pass2'), 'link di invito apre la registrazione')
        await pg.fill('#p_email', 'collega@example.it'); await pg.fill('#p_pass', 'password456'); await pg.fill('#p_pass2', 'password456')
        await pg.click('[data-p=registrati]'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=str(OUT / '04b-collaboratore.png'))
        check(not await pg.is_visible('#plat'), 'il collaboratore entra direttamente nell\'azienda')
        apps = await pg.evaluate("()=>S.appezzamenti.map(a=>a.codice)"); check(apps == ['CHD'], 'il collaboratore vede i vigneti')
        cw = await pg.evaluate("()=>canWrite"); check(cw is True, 'il collaboratore può modificare')
        await pg.evaluate("""async()=>{ await put('lavorazioni','l1',{appId:'a1',tipo:'Potatura secca',data:'2026-01-20',ore:12}); }"""); await pg.wait_for_timeout(300)
        check(await pg.evaluate("()=>S.lavorazioni.length") == 1, 'il collaboratore registra una lavorazione')
        # il titolare rientra e trasforma un invito in lettore
        await pg.click('#sideFoot [data-act=plat-esci]'); await pg.wait_for_timeout(800)
        await pg.goto(base); await pg.wait_for_timeout(500)
        await pg.fill('#p_email', 'antonio@example.it'); await pg.fill('#p_pass', 'password123'); await pg.click('[data-p=accedi]'); await pg.wait_for_timeout(1500)
        check(await pg.evaluate("()=>S.lavorazioni.length") == 1, 'il titolare vede la lavorazione del collaboratore')
        await pg.click('#sideFoot [data-act=plat-azienda]'); await pg.wait_for_timeout(400)
        await pg.select_option('#pa_ruolo', 'lettore'); await pg.click('[data-act=plat-invita]'); await pg.wait_for_timeout(500)
        link2 = await pg.evaluate("()=>[...document.querySelectorAll('.pinv')].find(x=>x.textContent.includes('lettore')).querySelector('[data-act=plat-copia]').dataset.v")
        await pg.evaluate("()=>closeModal()"); await pg.click('#sideFoot [data-act=plat-esci]'); await pg.wait_for_timeout(800)
        await pg.goto(link2); await pg.wait_for_timeout(500)
        await pg.fill('#p_email', 'consulente@example.it'); await pg.fill('#p_pass', 'password789'); await pg.fill('#p_pass2', 'password789')
        await pg.click('[data-p=registrati]'); await pg.wait_for_timeout(1500)
        cw = await pg.evaluate("()=>canWrite"); check(cw is False, 'il lettore non può modificare')
        t = await pg.inner_text('main'); check('non può salvare' not in t, 'nessun avviso da claude.ai per il lettore')
        await pg.screenshot(path=str(OUT / '05-lettore.png'))
        # telefono
        m = await ctx.new_page(); await m.set_viewport_size({'width': 390, 'height': 844})
        await m.goto(base); await m.wait_for_timeout(1500); await m.screenshot(path=str(OUT / '06-telefono.png'))
        await m.click('.pacct'); await m.wait_for_timeout(400); await m.screenshot(path=str(OUT / '06b-telefono-account.png'))
        await m.click('.dlg [data-act=plat-esci]'); await m.wait_for_timeout(800); await m.screenshot(path=str(OUT / '07-telefono-accesso.png'))
        check(not errs, 'nessun errore JavaScript' + ('' if not errs else ': ' + '; '.join(errs[:3])))
        await b.close()
try: asyncio.run(main())
finally: srv.terminate()
print(f"\n{'TUTTO OK' if not fails else str(len(fails)) + ' FALLITI'}")
sys.exit(1 if fails else 0)
