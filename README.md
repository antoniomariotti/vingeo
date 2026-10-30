# Vingeo – Quaderno di campagna

Web app per la gestione del vigneto: appezzamenti con confini catastali, fenologia, lavorazioni, trattamenti con carenze e rientri, magazzino, concimazione secondo il disciplinare, monitoraggio con foto e trappole, e modelli di difesa (peronospora, oidio, botrite) calcolati ora per ora sul meteo dell'azienda e confrontati con i bollettini fitosanitari regionali.

Ogni utente crea la propria azienda e può invitare collaboratori (che possono modificare) o lettori (solo consultazione, ad esempio un consulente).

## Com'è fatta

| File | Cosa contiene |
|---|---|
| `app.html` | L'app vera e propria (un solo file HTML con stile e script). È lo stesso file della versione personale su claude.ai. |
| `piattaforma.js` | Accesso, aziende, membri e inviti su Supabase; meteo orario da Open-Meteo e bollettini regionali scaricati dal browser. |
| `index.html` | Generato da `tools/build.py`: `app.html` + configurazione + Supabase + piattaforma. **Non modificarlo a mano.** |
| `config.js` | Indirizzo del progetto Supabase e chiave pubblica (anon). |
| `fitofarmaci.json` | Banca dati dei prodotti fitosanitari del Ministero della Salute (open data IODL 2.0). |
| `supabase/migrations/0001_schema.sql` | Tabelle, regole di sicurezza per riga (RLS), inviti, archivio foto. |
| `test/` | Test del database (PGlite) e test end-to-end nel browser con un Supabase simulato. |

I dati di ogni azienda stanno nella tabella `documenti` (una riga per documento, raggruppati per collezione: `appezzamenti`, `trattamenti`, `meteoOre`, …). Le regole RLS fanno sì che ognuno veda solo le aziende di cui è membro: lettori in sola lettura, collaboratori e titolari anche in scrittura, solo i titolari gestiscono persone e inviti.

## Messa in linea (una volta sola)

### 1. Supabase (database e accessi)
1. Crea un progetto su [supabase.com](https://supabase.com), regione **Frankfurt (eu-central-1)**.
2. In **SQL Editor** incolla ed esegui tutto `supabase/migrations/0001_schema.sql`.
3. In **Authentication → URL Configuration** imposta come *Site URL* l'indirizzo pubblico dell'app (es. `https://<utente>.github.io/vingeo/`) e aggiungilo anche tra i *Redirect URLs*.
4. In **Authentication → Providers → Email** lascia attivo "Confirm email" (consigliato).
5. Facoltativo: in **Authentication → Email Templates** traduci i testi in italiano.
6. Copia da **Settings → API** il *Project URL* e la chiave *anon public* in `config.js`. La chiave *service_role* non va mai messa nel codice.

### 2. Pubblicazione del sito (GitHub Pages)
1. Carica il repository su GitHub.
2. **Settings → Pages → Build and deployment**: *Deploy from a branch*, branch `main`, cartella `/ (root)`.
3. Dopo un minuto l'app è su `https://<utente>.github.io/<repository>/`.

Qualsiasi hosting statico va bene (Netlify, Cloudflare Pages, Vercel): non serve un server.

### 3. Primo accesso
Apri l'app, crea l'account, crea l'azienda scegliendo il comune (serve per il meteo). Al primo avvio l'app scarica da sola il meteo orario dal 1° gennaio e, per l'Abruzzo, i bollettini "Difesa vite" della stagione.

Per portare dentro i dati della versione personale: **Azienda e utenti → Importa da file JSON**.

## Sviluppo

```bash
python3 tools/build.py        # rigenera index.html dopo ogni modifica ad app.html
npm install && npm run test:db   # regole di sicurezza del database
python3 test/e2e.py              # flusso completo: registrazione, azienda, meteo, bollettini, inviti, ruoli
python3 -m http.server 8000      # prova in locale (serve un config.js con un progetto Supabase reale)
```

## Fonti dei dati e licenze
- **Meteo**: [Open-Meteo](https://open-meteo.com) (CC BY 4.0). L'API gratuita è per uso non commerciale e ha un limite di richieste giornaliere per indirizzo IP: per un servizio commerciale serve un piano a pagamento.
- **Prodotti fitosanitari**: Ministero della Salute, open data (IODL 2.0).
- **Bollettini fitosanitari**: Regione Abruzzo, AgroAmbiente (citati con link all'originale).
- **Catasto**: Agenzia delle Entrate, servizio WFS INSPIRE (CC BY 4.0). Dal browser non è raggiungibile direttamente: va previsto un piccolo servizio intermedio (Supabase Edge Function).
- **Foto aeree**: le immagini Esri usate nella versione personale non vanno usate in un servizio pubblico senza licenza ArcGIS. Alternative: ortofoto AGEA/regionali (WMS) o Sentinel-2 (Copernicus).

## Avvertenza
I modelli di difesa e i calcoli di concimazione sono un supporto alla decisione, non una prescrizione. Vanno confrontati con i bollettini regionali, con l'etichetta dei prodotti e con quello che si vede in campo.
