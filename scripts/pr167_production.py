#!/usr/bin/env python3
"""PR167: freeze live sources, patch only security inputs, deploy explicit targets.

Cloud mutations exist only in deploy(). Credentials and signed URLs are never logged.
Rollback uses the per-function source recorded AFTER COM-153, never an older tree.
"""
import argparse
import base64
import concurrent.futures
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

PROJECT = 'calycompta'
REGION = 'europe-west1'
PREFIX = f'projects/{PROJECT}/locations/{REGION}'
API = 'https://cloudfunctions.googleapis.com/v2/'
ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {'package.json', 'package-lock.json', 'src/utils/communicationTemplates.js'}
SECURITY = {'handlebars': '4.7.10', 'proxy-addr': '2.0.8', 'body-parser': '2.4.0',
            'qs': '6.17.1', 'follow-redirects': '1.16.2'}
TOKEN_LOCK = threading.Lock()
TOKEN = None
TOKEN_AT = 0


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    temp.chmod(0o600)
    temp.replace(path)


def read(path):
    return json.loads(path.read_text())


def request(url, method='GET', body=None, signed=False):
    global TOKEN, TOKEN_AT
    headers = {}
    if not signed:
        with TOKEN_LOCK:
            if TOKEN is None or time.monotonic() - TOKEN_AT > 2700:
                TOKEN = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
                TOKEN_AT = time.monotonic()
        headers['Authorization'] = 'Bearer ' + TOKEN
    if body is not None:
        headers['Content-Type'] = 'application/zip' if signed else 'application/json'
        if not signed:
            body = encoded(body)
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            data = response.read()
    except urllib.error.HTTPError as error:
        # Do not include response bodies, signed URLs or configuration in errors.
        raise RuntimeError(f'Cloud HTTP {error.code} ({method})') from None
    except urllib.error.URLError:
        raise RuntimeError(f'Cloud connection failed ({method})') from None
    return data if signed or '/download/' in url else json.loads(data or b'{}')


def inventory():
    result = subprocess.run(['gcloud', 'functions', 'list', '--project', PROJECT, '--format=json'],
                            capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def source(function):
    return function['buildConfig']['sourceProvenance']['resolvedStorageSource']


def source_url(ref, download=False):
    base = 'https://storage.googleapis.com/' + ('download/' if download else '')
    url = base + 'storage/v1/b/' + ref['bucket'] + '/o/' + urllib.parse.quote(ref['object'], safe='')
    return url + '?generation=' + str(ref['generation']) + ('&alt=media' if download else '&fields=md5Hash,size')


def config_hash(function):
    value = copy.deepcopy(function)
    for key in ['updateTime', 'createTime', 'state', 'stateMessages', 'url', 'upgradeInfo']:
        value.pop(key, None)
    build = value.get('buildConfig', {})
    for key in ['source', 'sourceProvenance', 'build']:
        build.pop(key, None)
    service = value.get('serviceConfig', {})
    for key in ['revision', 'uri']:
        service.pop(key, None)
    # The list and get endpoints return semantically unordered filters in different orders.
    for owner, key in [(value.get('eventTrigger', {}), 'eventFilters'),
                       (service, 'secretEnvironmentVariables'), (service, 'secretVolumes')]:
        if isinstance(owner.get(key), list):
            owner[key].sort(key=encoded)
    return sha(encoded(value))


def versions(lock):
    return {name: sorted({v['version'] for key, v in lock['packages'].items()
                          if key.endswith('node_modules/' + name)}) for name in SECURITY}


def snapshot(folder):
    if (folder / 'snapshot.json').exists():
        raise RuntimeError('Snapshot already exists; use a new directory to retain rollback evidence')
    functions = inventory()
    rows = [f for f in functions if f.get('environment') == 'GEN_2']
    manifest = read(ROOT / 'functions/config/function-inventory.json')
    expected = {f['name'] for f in manifest['firebaseFunctions'] if f['generation'] == 'GEN_2'}
    if len(functions) != 127 or {f['name'].split('/')[-1] for f in rows} != expected:
        raise RuntimeError('Inventory count changed; reconcile COM-155 before continuing')
    groups = {}
    targets = []
    for function in rows:
        name = function['name'].split('/')[-1]
        if not function['name'].startswith(PREFIX + '/functions/') or function['state'] != 'ACTIVE':
            raise RuntimeError('Unexpected location or inactive function: ' + name)
        ref = source(function)
        md5 = request(source_url(ref))['md5Hash']
        if md5 not in groups:
            data = request(source_url(ref, True))
            if base64.b64encode(hashlib.md5(data).digest()).decode() != md5:
                raise RuntimeError('Source checksum mismatch')
            group = f'group-{len(groups):02d}'
            archive = folder / 'rollback' / (group + '.zip')
            archive.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            archive.write_bytes(data)
            archive.chmod(0o600)
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                lock = json.loads(z.read('package-lock.json'))
                helper = z.read('src/utils/communicationTemplates.js')
            actual = versions(lock)
            affected = any(actual[p] != [v] for p, v in SECURITY.items()) or helper != patch_helper(
                helper, (ROOT / 'functions/src/utils/communicationTemplates.js').read_bytes())
            groups[md5] = {'group': group, 'archiveSha256': sha(data), 'source': ref,
                           'versions': actual, 'affected': affected}
        if not groups[md5]['affected']:
            continue
        target = {'name': function['name'], 'group': groups[md5]['group'], 'source': ref,
                  'revision': function['serviceConfig']['revision'], 'updateTime': function['updateTime'],
                  'configurationSha256': config_hash(function)}
        targets.append(target)
        save(folder / 'before' / (name + '.json'), function)
    target_names = {t['name'] for t in targets}
    non_targets = [f for f in functions if f['name'] not in target_names]
    save(folder / 'snapshot.json', {'project': PROJECT, 'recordedAt': time.time(), 'targets': targets,
                                  'groups': [g for g in groups.values() if g['affected']], 'nonTargets': non_targets})
    print(f'Rollback frozen: {len(targets)} functions, {len(groups)} source archives', flush=True)


def patch_helper(original, candidate):
    start = b'function renderCommunicationTemplate(template, data) {'
    end = b'  const unreplacedVariables = '
    if original.count(start) != 1 or candidate.count(start) != 1:
        raise ValueError('Unexpected template helper shape')
    left = original.index(start)
    right = original.index(end, left)
    new_left = candidate.index(start)
    new_right = candidate.index(end, new_left)
    old_head = original[left:right]
    new_head = candidate[new_left:new_right]
    unguarded = (b"function renderCommunicationTemplate(template, data) {\n"
                 b"  const subject = Handlebars.compile(template.subject || '')(data);\n"
                 b"  const html = Handlebars.compile(template.htmlContent || '')(data);\n")
    if old_head not in [unguarded, new_head]:
        raise ValueError('Unknown production template guard; manual review required')
    return original[:left] + new_head + original[right:]


def rewrite_archive(data, replacements):
    if not set(replacements) <= ALLOWED:
        raise ValueError('Unapproved source change')
    result = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as before, zipfile.ZipFile(result, 'w') as after:
        names = before.namelist()
        if len(names) != len(set(names)) or not set(replacements) <= set(names):
            raise ValueError('Invalid archive entries')
        for info in before.infolist():
            after.writestr(info, replacements.get(info.filename, before.read(info.filename)))
    output = result.getvalue()
    with zipfile.ZipFile(io.BytesIO(data)) as a, zipfile.ZipFile(io.BytesIO(output)) as b:
        changed = [name for name in a.namelist() if a.read(name) != b.read(name)]
        if not set(changed) <= ALLOWED or a.namelist() != b.namelist():
            raise ValueError('Production-only source was modified')
    return output, changed


def merge_manifest(original, current):
    result = copy.deepcopy(original)
    result['dependencies'].update(current['dependencies'])
    result.setdefault('overrides', {}).update(current['overrides'])
    return result


def supply_com153_tests(archive, work):
    """The sealed COM153 deploy excludes tests; add its reviewed tests only to the harness."""
    if any(name.endswith('.test.js') for name in archive.namelist()):
        return 'deployed synthetic tests'
    sealed = ROOT / 'releases/com153-borg/functions'
    runtime = ['index.js', 'src/payment/materialLoanPayment.js', 'src/loans/materialLoanRoles.js',
               'src/utils/communicationTemplates.js', 'src/utils/emailDelivery.js']
    for name in runtime:
        if name not in archive.namelist() or archive.read(name) != (sealed / name).read_bytes():
            raise RuntimeError('Test-free archive does not match the reviewed COM153 runtime')
    for name in ['src/loans/materialLoanRoles.test.js', 'src/payment/materialLoanPayment.test.js',
                 'src/payment/materialLoanPayment.authorization.test.js']:
        path = work / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes((sealed / name).read_bytes())
    return 'reviewed COM153 sealed-bundle synthetic tests (harness only)'


def run_npm(args, cwd, log, extra_env=None):
    env = dict(os.environ)
    for key, value in (extra_env or {}).items():
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
    env['PATH'] = str(Path(env['PR167_NODE_BIN'])) + os.pathsep + env['PATH']
    with log.open('ab') as stream:
        result = subprocess.run(['npm'] + args, cwd=cwd, env=env, stdout=stream, stderr=stream)
    if result.returncode:
        raise RuntimeError(f'npm command failed; inspect restricted log {log.name}')


def prepare(folder):
    snap = read(folder / 'snapshot.json')
    current = read(ROOT / 'functions/package.json')
    helper = (ROOT / 'functions/src/utils/communicationTemplates.js').read_bytes()
    fixture_dir = folder / 'tests/test/fixtures'
    fixture_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Firebase deploy archives omit repository-level synthetic test fixtures.
    for name in ['unread_contract_v1.json', 'mil_depth_cumulative.json', 'boutique_payment_context.json']:
        local = ROOT / 'test/fixtures' / name
        data = local.read_bytes() if local.exists() else subprocess.check_output(
            ['git', 'show', 'origin/dev:test/fixtures/' + name], cwd=ROOT)
        (fixture_dir / name).write_bytes(data)
    candidates = []
    for group in snap['groups']:
        group_name = group['group']
        data = (folder / 'rollback' / (group_name + '.zip')).read_bytes()
        if sha(data) != group['archiveSha256']:
            raise RuntimeError('Rollback archive changed')
        work = folder / 'tests' / group_name
        work.mkdir(parents=True, exist_ok=True, mode=0o700)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            manifest = json.loads(z.read('package.json'))
            # Keep production-only dependencies such as cheerio and all other manifest settings.
            manifest = merge_manifest(manifest, current)
            (work / 'package.json').write_text(json.dumps(manifest, indent=2) + '\n')
            (work / 'package-lock.json').write_bytes(z.read('package-lock.json'))
            patched = patch_helper(z.read('src/utils/communicationTemplates.js'), helper)
            for name in z.namelist():
                p = Path(name)
                if p.is_absolute() or '..' in p.parts:
                    raise ValueError('Unsafe archive path')
                # Synthetic tests never receive deployed .env or account/signing material.
                if any(part.startswith('.') for part in p.parts) or any(
                        part in p.name.lower() for part in ['service-account', 'service_account', 'private-key']):
                    continue
                if p.suffix not in ['.js', '.cjs', '.json', '.ttf', '.otf', '.pdf', '.png', '.jpg']:
                    continue
                if name in ['package.json', 'package-lock.json']:
                    continue
                target = work / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(patched if name == 'src/utils/communicationTemplates.js' else z.read(name))
            test_source = supply_com153_tests(z, work)
        log = folder / (group_name + '-test.log')
        run_npm(['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], work, log)
        run_npm(['audit', 'fix', '--package-lock-only', '--ignore-scripts', '--omit=dev', '--no-fund'], work, log)
        run_npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], work, log)
        run_npm(['audit', '--omit=dev'], work, log)
        run_npm(['test', '--', '--runInBand'], work, log, {
            'GOOGLE_APPLICATION_CREDENTIALS': '/dev/null', 'GCLOUD_PROJECT': 'pr167-synthetic',
            'GOOGLE_CLOUD_PROJECT': 'pr167-synthetic', 'FIREBASE_CONFIG': '{"projectId":"pr167-synthetic"}',
            'FIRESTORE_EMULATOR_HOST': None, 'FIREBASE_AUTH_EMULATOR_HOST': None,
        })
        lock = read(work / 'package-lock.json')
        actual = versions(lock)
        for package, expected in SECURITY.items():
            if actual[package] != [expected]:
                raise RuntimeError('Unexpected security version: ' + package)
        replacements = {'package.json': (work / 'package.json').read_bytes(),
                        'package-lock.json': (work / 'package-lock.json').read_bytes(),
                        'src/utils/communicationTemplates.js': patched}
        output, changed = rewrite_archive(data, replacements)
        dest = folder / 'candidates' / (group_name + '.zip')
        dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        dest.write_bytes(output)
        dest.chmod(0o600)
        candidates.append({'group': group_name, 'archiveSha256': sha(output), 'changed': changed,
                           'versions': actual, 'runtimeAudit': 0, 'syntheticTests': 'passed',
                           'testHarnessFrom': test_source})
        save(folder / 'candidates.json', candidates)
        print(f'{group_name}: frozen code preserved, runtime audit 0, synthetic tests passed', flush=True)


def deploy(folder):
    snap = read(folder / 'snapshot.json')
    candidates = {c['group']: c for c in read(folder / 'candidates.json')}
    if set(candidates) != {g['group'] for g in snap['groups']}:
        raise RuntimeError('Not all source bundles are validated')
    # Human-authorized prerequisite receipt is recorded only after COM-153 live verification.
    receipt = read(folder / 'com153-live.json')
    if receipt.get('verifiedLive') is not True or receipt.get('snapshotAfterCom153') is not True:
        raise RuntimeError('COM-153 completion not verified')
    live = {f['name']: f for f in inventory()}
    for target in snap['targets']:
        f = live[target['name']]
        if f['state'] != 'ACTIVE' or source(f) != target['source'] or config_hash(f) != target['configurationSha256']:
            raise RuntimeError('Live source/config drift before rollout: ' + target['name'].split('/')[-1])
    # One allowlist release, at most eight in-flight targets; no discovery, deletion, IAM or trigger mutation.
    uploaded = {}
    journal = read(folder / 'rollout.json') if (folder / 'rollout.json').exists() else []
    if journal:
        raise RuntimeError('Rollout already started; reconcile journal before any retry')
    for group in snap['groups']:
        group_name = group['group']
        data = (folder / 'candidates' / (group_name + '.zip')).read_bytes()
        if sha(data) != candidates[group_name]['archiveSha256']:
            raise RuntimeError('Candidate archive changed')
        upload = request(API + PREFIX + '/functions:generateUploadUrl', 'POST', {'environment': 'GEN_2'})
        request(upload['uploadUrl'], 'PUT', data, signed=True)
        uploaded[group_name] = upload['storageSource']
    save(folder / 'uploaded-sources.json', uploaded)
    journal_lock = threading.Lock()
    stop = threading.Event()

    def update_target(target):
        if stop.is_set():
            return
        # Recheck the exact target immediately before its one-field update.
        f = request(API + target['name'])
        if source(f) != target['source'] or config_hash(f) != target['configurationSha256'] or f['state'] != 'ACTIVE':
            raise RuntimeError('Target drift detected; rollout halted')
        if stop.is_set():
            return
        operation = request(API + target['name'] + '?updateMask=buildConfig.source', 'PATCH',
                            {'name': target['name'], 'buildConfig': {'source': {
                                'storageSource': uploaded[target['group']]}}})
        row = {'name': target['name'], 'group': target['group'], 'operation': operation['name'], 'state': 'started'}
        with journal_lock:
            journal.append(row)
            save(folder / 'rollout.json', journal)
        while not operation.get('done'):
            time.sleep(10)
            operation = request(API + operation['name'])
        if operation.get('error'):
            with journal_lock:
                row['state'] = 'failed'
                row['errorCode'] = operation['error'].get('code')
                save(folder / 'rollout.json', journal)
            raise RuntimeError('Deployment failed; journal retained, no further targets submitted')
        with journal_lock:
            row['state'] = 'completed'
            save(folder / 'rollout.json', journal)
            completed = sum(r['state'] == 'completed' for r in journal)
            print(f"{completed}/{len(snap['targets'])} {target['name'].split('/')[-1]} updated", flush=True)

    def guarded_update(target):
        try:
            update_target(target)
        except Exception:
            stop.set()
            raise

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(guarded_update, t) for t in snap['targets']]
        for future in concurrent.futures.as_completed(futures):
            future.result()


def verify(folder):
    snap = read(folder / 'snapshot.json')
    candidates = {c['group']: c for c in read(folder / 'candidates.json')}
    live = {f['name']: f for f in inventory()}
    rows = []
    checked_sources = {}
    for target in snap['targets']:
        f = live[target['name']]
        if f['state'] != 'ACTIVE' or config_hash(f) != target['configurationSha256']:
            raise RuntimeError('State/config verification failed: ' + target['name'])
        if f['serviceConfig']['revision'] == target['revision']:
            raise RuntimeError('Revision did not change: ' + target['name'])
        ref = source(f)
        md5 = request(source_url(ref))['md5Hash']
        if md5 not in checked_sources:
            checked_sources[md5] = sha(request(source_url(ref, True)))
        if checked_sources[md5] != candidates[target['group']]['archiveSha256']:
            raise RuntimeError('Deployed source does not match validated archive')
        rows.append({'name': f['name'], 'state': f['state'], 'revision': f['serviceConfig']['revision'],
                     'source': ref, 'archiveSha256': checked_sources[md5], 'configurationPreserved': True})
    for f in snap['nonTargets']:
        if live[f['name']] != f:
            raise RuntimeError('Non-target function changed')
    if len(live) != len(snap['targets']) + len(snap['nonTargets']):
        raise RuntimeError('Inventory count changed')
    save(folder / 'live-verified.json', {'verifiedAt': time.time(), 'functions': rows,
                                       'nonTargetsUnchanged': True, 'dataCallsMade': False})
    print(f'LIVE VERIFIED: {len(rows)} source hashes/revisions/ACTIVE states; configurations and non-targets unchanged')


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['snapshot', 'prepare', 'deploy', 'verify'])
    parser.add_argument('release_dir', type=Path)
    args = parser.parse_args()
    args.release_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    globals()[args.action](args.release_dir)


if __name__ == '__main__':
    main()
