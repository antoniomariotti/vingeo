# Email di VinGeo (Supabase → Authentication → Emails)

Prima di invitare altre persone serve un servizio email esterno (vedi README, sezione "Email"). Qui ci sono oggetto e testo in italiano da incollare in **Authentication → Emails → Templates** di Supabase. Le parti tra doppie graffe vanno lasciate così: Supabase le sostituisce con il link vero.

## Confirm signup

**Oggetto:** Conferma il tuo account VinGeo

```html
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1b221e">
  <p style="font-size:20px;font-weight:700;margin:0 0 4px">VinGeo</p>
  <p style="font-size:12px;letter-spacing:.08em;color:#5a645d;margin:0 0 24px">QUADERNO DI CAMPAGNA</p>
  <h2 style="font-size:18px;margin:0 0 12px">Conferma il tuo indirizzo email</h2>
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px">Hai creato un account su VinGeo con l'indirizzo {{ .Email }}. Per attivarlo premi il pulsante qui sotto.</p>
  <p style="margin:0 0 24px"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#15706a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Conferma l'email</a></p>
  <p style="font-size:13px;color:#5a645d;line-height:1.5;margin:0">Se non sei stato tu, ignora questa email: non succede niente.</p>
</div>
```

## Reset Password

**Oggetto:** Nuova password per VinGeo

```html
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1b221e">
  <p style="font-size:20px;font-weight:700;margin:0 0 4px">VinGeo</p>
  <p style="font-size:12px;letter-spacing:.08em;color:#5a645d;margin:0 0 24px">QUADERNO DI CAMPAGNA</p>
  <h2 style="font-size:18px;margin:0 0 12px">Scegli una nuova password</h2>
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px">Abbiamo ricevuto una richiesta di cambio password per {{ .Email }}. Premi il pulsante per sceglierne una nuova: il link vale per poco tempo.</p>
  <p style="margin:0 0 24px"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#15706a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Scegli la nuova password</a></p>
  <p style="font-size:13px;color:#5a645d;line-height:1.5;margin:0">Se non sei stato tu, ignora questa email: non succede niente.</p>
</div>
```

## Change Email Address

**Oggetto:** Conferma il nuovo indirizzo email

```html
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1b221e">
  <p style="font-size:20px;font-weight:700;margin:0 0 4px">VinGeo</p>
  <p style="font-size:12px;letter-spacing:.08em;color:#5a645d;margin:0 0 24px">QUADERNO DI CAMPAGNA</p>
  <h2 style="font-size:18px;margin:0 0 12px">Conferma il cambio di email</h2>
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px">Hai chiesto di usare {{ .NewEmail }} al posto di {{ .Email }} per accedere a VinGeo.</p>
  <p style="margin:0 0 24px"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#15706a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Conferma il nuovo indirizzo</a></p>
  <p style="font-size:13px;color:#5a645d;line-height:1.5;margin:0">Se non sei stato tu, ignora questa email: non succede niente.</p>
</div>
```

## Magic Link

**Oggetto:** Il tuo link di accesso a VinGeo

```html
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1b221e">
  <p style="font-size:20px;font-weight:700;margin:0 0 4px">VinGeo</p>
  <p style="font-size:12px;letter-spacing:.08em;color:#5a645d;margin:0 0 24px">QUADERNO DI CAMPAGNA</p>
  <h2 style="font-size:18px;margin:0 0 12px">Accedi a VinGeo</h2>
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px">Premi il pulsante per entrare senza password.</p>
  <p style="margin:0 0 24px"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#15706a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Accedi</a></p>
  <p style="font-size:13px;color:#5a645d;line-height:1.5;margin:0">Se non sei stato tu, ignora questa email: non succede niente.</p>
</div>
```

