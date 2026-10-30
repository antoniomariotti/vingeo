#!/usr/bin/env python3
"""Genera index.html della web app multi-utente a partire dal file dell'app (app.html).
app.html è lo stesso file usato per la versione personale su claude.ai: qui si aggiungono
configurazione, client Supabase e lo strato piattaforma prima dello script dell'app."""
import pathlib, re, sys
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'app.html').read_text(encoding='utf-8')
tags = ('<link rel="manifest" href="manifest.webmanifest">\n'
        '<meta name="theme-color" content="#15706a">\n'
        '<script src="config.js"></script>\n'
        '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>\n'
        '<script src="piattaforma.js"></script>\n')
i = src.find('<script>')
assert i > 0, 'script dell\'app non trovato'
out = src[:i] + tags + src[i:]
(root / 'index.html').write_text(out, encoding='utf-8')
print('index.html scritto', len(out), 'byte')
