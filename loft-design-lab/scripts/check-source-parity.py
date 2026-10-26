#!/usr/bin/env python3
"""Compare the redesigned local project with its recorded original-site baseline."""
import argparse
from collections import Counter
from copy import deepcopy
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'migration' / 'source-manifest.json'
CONTENT_OVERRIDES = ROOT / 'migration' / 'content-overrides.json'
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
PAGES = ['index.html', 'production.html', 'smm.html', 'branding.html', 'web.html', 'booking-stars.html', 'order.html']


def normal(text):
    return ' '.join(text.split())


class Node:
    def __init__(self, tag, attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def text(self):
        if self.tag == 'br':
            return ' '
        return ''.join(child.text() if isinstance(child, Node) else child for child in self.children)

    def nodes(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.nodes()


class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node('document')
        self.stack = [self.root]
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                self.stack = self.stack[:index]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def meaningful_body_text(node):
    if node.tag in {'script', 'style', 'svg', 'noscript'} or node.attrs.get('id') == 'loader':
        return []
    result = []
    for child in node.children:
        if isinstance(child, Node):
            result.extend(meaningful_body_text(child))
        else:
            text = normal(child)
            if text and any(character.isalnum() for character in text):
                result.append(text)
    return result


def page_snapshot(path):
    nodes = list(Document(path.read_text()).root.nodes())
    head = next(node for node in nodes if node.tag == 'head')
    head_nodes = list(head.nodes())
    body = next(node for node in nodes if node.tag == 'body')
    title = next(node for node in head_nodes if node.tag == 'title')
    lang_blocks = []
    for node in nodes:
        classes = node.attrs.get('class', '').split()
        if 'lang' in classes:
            language = next((value[5:] for value in classes if value in ('lang-ru', 'lang-en')), '')
            text = normal(node.text())
            if text:
                lang_blocks.append({'language': language, 'text': text})
    schemas = []
    for node in nodes:
        if node.tag == 'script' and node.attrs.get('type') == 'application/ld+json':
            schemas.append(json.loads(node.text()))
    forms = []
    controls = []
    for node in nodes:
        if node.tag == 'form':
            forms.append({key: node.attrs[key] for key in ('id', 'action', 'method', 'onsubmit') if key in node.attrs})
        if node.tag in ('input', 'select', 'textarea', 'option'):
            controls.append({'tag': node.tag, **{key: node.attrs[key] for key in ('id', 'name', 'type', 'value', 'required', 'multiple', 'placeholder') if key in node.attrs}, **({'text': normal(node.text())} if node.tag == 'option' else {})})
    return {
        'route': '/' if path.name == 'index.html' else '/' + path.stem,
        'title': normal(title.text()),
        'meta': [node.attrs for node in head_nodes if node.tag == 'meta'],
        'canonical': [node.attrs['href'] for node in head_nodes if node.tag == 'link' and node.attrs.get('rel') == 'canonical'],
        'h1': [normal(node.text()) for node in nodes if node.tag == 'h1'],
        'schemas': schemas,
        'languageBlocks': lang_blocks,
        'bodyTextNodes': dict(sorted(Counter(meaningful_body_text(body)).items())),
        'ids': sorted({node.attrs['id'] for node in nodes if node.attrs.get('id')}),
        'links': [node.attrs['href'] for node in nodes if node.tag == 'a' and node.attrs.get('href')],
        'forms': forms,
        'controls': controls,
    }


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def frozen(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def exact_file(path):
    return path.startswith(('assets/', 'fonts/', 'logo/', 'api/')) or path in {
        'styles.css', 'robots.txt', 'sitemap.xml', 'app.js', 'index.js',
        'local-server.js', 'favicon.ico', 'favicon.png', 'apple-touch-icon.png',
    }


def record_source(source):
    source = source.resolve()
    commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    files = subprocess.check_output(['git', '-C', str(source), 'ls-files', '-z']).decode().split('\0')
    manifest = {
        'schemaVersion': 1,
        'source': {
            'repository': 'https://github.com/persimon-pro/loft-creative-house',
            'commit': commit,
            'referenceDomain': 'https://www.loft.tj',
            'recordedOn': '2026-10-26',
            'verification': 'Repository main confirmed at this commit; live loft.tj deployment was not accessible from this environment.',
        },
        'intentionalDifferences': [
            'New cinematic presentation, generated artwork, brush intro and four-device interlude.',
            'Original hero background presentation replaced; its original asset remains copied unchanged.',
            'Russian initial document language matches the current default interface.',
            'Staging X-Robots-Tag noindex,nofollow overrides source HTML index directives until separately approved production migration.',
            'New build dependencies, presentation scripts/styles and local documentation.',
        ],
        'files': [
            {'path': filename, 'sha256': digest(source / filename), 'bytes': (source / filename).stat().st_size, 'enforceExact': exact_file(filename)}
            for filename in sorted(filter(None, files))
        ],
        'pages': {filename: page_snapshot(source / filename) for filename in PAGES},
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'Recorded {len(manifest["files"])} source files and {len(manifest["pages"])} pages at {commit}.')


def approved_headline(filename, expected, override):
    if not override:
        return expected, 0
    replacements = override.get('replacements', [])
    if (filename != 'index.html' or len(replacements) != 4
            or not override.get('reason') or not override.get('approvedOn')):
        raise ValueError('Only the documented four-fragment homepage headline change is allowed')
    old_fragments = [replacement['from'] for replacement in replacements]
    if len(set(old_fragments)) != 4:
        raise ValueError('Headline source fragments must be distinct')
    for replacement in replacements:
        old, new = replacement['from'], replacement['to']
        if not old or not new or old == new:
            raise ValueError('Headline replacements require distinct nonempty source and target text')
        if (expected['bodyTextNodes'].get(old) != 1
                or sum(text.count(old) for text in expected['h1']) != 1
                or sum(block['text'].count(old) for block in expected['languageBlocks']) != 1):
            raise ValueError(f'Approved headline fragment must occur exactly once in the original H1, language blocks and body: {old}')
    adjusted = deepcopy(expected)
    for replacement in replacements:
        old, new = replacement['from'], replacement['to']
        adjusted['h1'] = [text.replace(old, new) for text in adjusted['h1']]
        for block in adjusted['languageBlocks']:
            block['text'] = block['text'].replace(old, new)
        adjusted['bodyTextNodes'].pop(old)
        adjusted['bodyTextNodes'][new] = adjusted['bodyTextNodes'].get(new, 0) + 1
    return adjusted, len(replacements)


def check():
    manifest = json.loads(MANIFEST.read_text())
    overrides = json.loads(CONTENT_OVERRIDES.read_text())
    failures = []
    if overrides.get('schemaVersion') != 1 or set(overrides.get('pages', {})) - {'index.html'}:
        failures.append('Content overrides must use schema version 1 and only the homepage')
    approved_pages = approved_fragments = 0
    exact = 0
    for entry in manifest['files']:
        path = ROOT / entry['path']
        if not path.is_file():
            failures.append(f'Missing source file: {entry["path"]}')
        elif entry['enforceExact']:
            exact += 1
            if digest(path) != entry['sha256']:
                failures.append(f'Original asset/API/base file changed: {entry["path"]}')
    text_count = 0
    for filename, expected in manifest['pages'].items():
        try:
            expected, count = approved_headline(filename, expected, overrides.get('pages', {}).get(filename))
            approved_pages += bool(count)
            approved_fragments += count
        except (KeyError, ValueError) as error:
            failures.append(f'{filename}: invalid approved headline override: {error}')
        actual = page_snapshot(ROOT / filename)
        for key in ('title', 'canonical', 'h1'):
            if actual[key] != expected[key]:
                failures.append(f'{filename}: original {key} differs')
        for key in ('meta', 'schemas', 'languageBlocks', 'links', 'forms', 'controls'):
            missing = Counter(map(frozen, expected[key])) - Counter(map(frozen, actual[key]))
            if missing:
                examples = list(missing.elements())[:3]
                failures.append(f'{filename}: missing original {key}: {examples}')
        missing_body = Counter(expected['bodyTextNodes']) - Counter(actual['bodyTextNodes'])
        if missing_body:
            failures.append(f'{filename}: missing original meaningful body text: {list(missing_body.elements())[:3]}')
        missing_ids = set(expected['ids']) - set(actual['ids'])
        if missing_ids:
            failures.append(f'{filename}: missing original anchor IDs: {sorted(missing_ids)}')
        text_count += len(expected['languageBlocks'])
    if failures:
        for failure in failures:
            print(f'FAIL: {failure}', file=sys.stderr)
        return 1
    print(f'PASS: {len(manifest["files"])} source files present; {exact} assets/API/base files unchanged; {len(manifest["pages"])} pages checked against original SEO and content with {approved_pages} approved H1 copy change ({approved_fragments} text fragments).')
    print(f'{text_count} bilingual blocks checked; all other headings, meaningful body text, schemas, links, forms and anchors retain their original requirements.')
    print('Staging indexing protection is verified separately by HTTP tests. Live rankings and live deployment parity are not asserted.')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record-source', type=Path, help='Explicitly record a new reviewed original repository baseline (writes only this project).')
    args = parser.parse_args()
    if args.record_source:
        record_source(args.record_source)
    else:
        raise SystemExit(check())
