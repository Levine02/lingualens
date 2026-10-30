#!/usr/bin/env python3
"""静态冒烟校验：manifest / HTML 引用 / JS import 路径是否都对得上。"""
import json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
problems = []
checked = 0


def exists(rel):
    return os.path.isfile(os.path.join(ROOT, rel))


def note_missing(rel, where):
    problems.append(f"[缺失] {rel}  <- 被 {where} 引用")


def check_ref(rel, where):
    global checked
    checked += 1
    if not exists(rel):
        note_missing(rel, where)


# 1) manifest
mf = os.path.join(ROOT, "manifest.json")
manifest = json.load(open(mf, encoding="utf-8"))
check_ref(manifest["background"]["service_worker"], "manifest.background")
for cs in manifest.get("content_scripts", []):
    for js in cs.get("js", []):
        check_ref(js, "manifest.content_scripts")
    for css in cs.get("css", []):
        check_ref(css, "manifest.content_scripts")
for size, path in manifest.get("icons", {}).items():
    check_ref(path, "manifest.icons")
for path in manifest.get("action", {}).get("default_icon", {}).values():
    check_ref(path, "manifest.action.default_icon")
if "default_popup" in manifest.get("action", {}):
    check_ref(manifest["action"]["default_popup"], "manifest.action")
if "page" in manifest.get("options_ui", {}):
    check_ref(manifest["options_ui"]["page"], "manifest.options_ui")

# 2) HTML 引用
html_files = []
for base, _dirs, files in os.walk(ROOT):
    for f in files:
        if f.endswith(".html"):
            html_files.append(os.path.join(base, f))

for html in html_files:
    rel_html = os.path.relpath(html, ROOT)
    content = open(html, encoding="utf-8").read()
    for attr in ("src", "href"):
        for m in re.finditer(rf'{attr}="([^"]+)"', content):
            url = m.group(1)
            if url.startswith(("http", "https", "#", "data:", "chrome-extension:")):
                continue
            target = os.path.normpath(os.path.join(os.path.dirname(rel_html), url))
            check_ref(target, rel_html)
    # inline script 检查（MV3 CSP 禁止）
    if re.search(r"<script(?![^>]*\bsrc=)", content) or re.search(r"\son(click|change|input|load)\s*=", content):
        problems.append(f"[CSP] {rel_html} 含内联脚本或内联事件处理器")

# 3) JS import 路径
for base, _dirs, files in os.walk(ROOT):
    if ".git" in base:
        continue
    for f in files:
        if not f.endswith(".js"):
            continue
        p = os.path.join(base, f)
        rel = os.path.relpath(p, ROOT)
        src = open(p, encoding="utf-8").read()
        for m in re.finditer(r"""(?:from|import)\s+['"](\.[^'"]+)['"]""", src):
            target = os.path.normpath(os.path.join(os.path.dirname(rel), m.group(1)))
            check_ref(target, rel)
        # scripting.executeScript 注入的相对文件名
        for m in re.finditer(r"""files:\s*\[\s*['"]([^'"]+)['"]""", src):
            check_ref(m.group(1), rel + " (executeScript)")

print(f"检查引用 {checked} 处")
if problems:
    print("\n发现问题：")
    for p in problems:
        print("  " + p)
    sys.exit(1)
print("✅ 所有引用路径有效，无内联脚本违规")
