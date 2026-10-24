#!/usr/bin/env python3
"""Renders public/img/cases/*.svg to PNG (tools/case-png/) for the Word activity documents. Needs Python Playwright + Chromium."""
import glob, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tools', 'case-png'); os.makedirs(OUT, exist_ok=True)
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={'width': 240, 'height': 240}, device_scale_factor=1)
    for f in sorted(glob.glob(os.path.join(ROOT, 'public', 'img', 'cases', '*.svg'))):
        pg.set_content(f'<html><body style="margin:0;background:transparent"><img id="i" src="data:image/svg+xml;base64,{__import__("base64").b64encode(open(f,"rb").read()).decode()}" width="240" height="240"></body></html>')
        pg.wait_for_timeout(50); pg.locator('#i').screenshot(path=os.path.join(OUT, os.path.basename(f)[:-4] + '.png'), omit_background=True)
    b.close()
print('PNG icons written to tools/case-png')
