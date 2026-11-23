"""Generate the exercise bank after checking the official answer keys."""
import hashlib
import json
import re
import unicodedata
from pathlib import Path

import fitz

ROOT = Path(__file__).parent
SOURCES = ROOT / 'dist/sources'
IPA = 'https://www.ipa.go.jp/shiken/mondai-kaiotu/'
FOLDERS = {
    2019: 'gmcbt8000000ddiw-att',
    2020: 'gmcbt8000000d05l-att',
    2021: 'gmcbt8000000apad-att',
    2022: 'gmcbt80000008smf-att',
    2023: 'ps6vr70000010d6y-att',
    2024: 'm42obm000000afqx-att',
    2025: 'nl10bi0000009lh8-att',
}
SESSIONS = {2019: '2019h31h', 2020: '2020r02o'}
TOPICS = {
    'アジャイル': '開発・品質',
    'サービス管理': 'サービス・セキュリティ',
    'セキュリティ': 'サービス・セキュリティ',
}

def read_json(name):
    return json.loads((ROOT / name).read_text())

def official_answers(path):
    with fitz.open(path) as doc:
        text = unicodedata.normalize('NFKC', '\n'.join(page.get_text() for page in doc))
    entries = re.findall(r'問\s*(\d+)\s*([アイウエ])', text)
    assert sorted(int(n) for n, _ in entries) == list(range(1, 26)), path
    return {int(n): 'アイウエ'.index(letter) for n, letter in entries}

bank = []
provenance = {}
for year, folder in sorted(FOLDERS.items(), reverse=True):
    session = SESSIONS.get(year, f'{year}r{year-2018:02}a')
    prefix = f'{IPA}{folder}/{session}_pm_am2_'
    question_url = prefix + 'qs.pdf'
    answer_url = prefix + 'ans.pdf'
    question_path = SOURCES / f'{year}-questions.pdf'
    answer_path = SOURCES / f'{year}-answers.pdf'
    with fitz.open(question_path) as doc:
        page_count = len(doc)
    answers = official_answers(answer_path)
    questions = read_json('first.json') + read_json('later.json') if year == 2025 else read_json(f'year{year}.json')
    assert sorted(q['n'] for q in questions) == list(range(1, 26)), year
    for q in sorted(questions, key=lambda item: item['n']):
        identifier = year, q['n']
        assert q.get('year', year) == year, identifier
        assert q.get('questionUrl', question_url) == question_url, identifier
        assert q.get('answerUrl', answer_url) == answer_url, identifier
        q.update(year=year, questionUrl=question_url, answerUrl=answer_url)
        q['figureText'] = q.get('figureText', q.get('figureAlt', ''))
        q['topic'] = TOPICS.get(q['topic'], q['topic'])
        if identifier == (2025, 18):
            q['options'] = ['アのグラフ', 'イのグラフ', 'ウのグラフ', 'エのグラフ']
        assert 1 <= q['page'] <= page_count, identifier
        assert q['answer'] == answers[q['n']], identifier
        assert len(q['options']) == len(q['explanations']) == 4, identifier
        assert all(isinstance(v, str) and v.strip() for v in [q['text'], q['topic'], q['keypoint'], *q['options'], *q['explanations']]), identifier
        if q.get('figure'):
            assert (ROOT / 'dist' / q['figure']).is_file() and q['figureText'].strip(), identifier
        bank.append(q)
    provenance[str(year)] = {
        'questionUrl': question_url, 'answerUrl': answer_url,
        'sha256': hashlib.sha256(question_path.read_bytes()).hexdigest(),
        'answerSha256': hashlib.sha256(answer_path.read_bytes()).hexdigest(),
    }

(ROOT / 'dist/data.js').write_text('window.QUESTIONS = ' + json.dumps(bank, ensure_ascii=False, indent=2) + ';\n')
(SOURCES / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
print(f'{len(bank)} questions matched to IPA answer keys')
