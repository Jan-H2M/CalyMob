import copy
import importlib.util
import io
import sys
import unittest
from unittest import mock
import tempfile
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('pr167_production.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ProductionBackportTest(unittest.TestCase):
    def test_only_security_entries_change_and_production_bytes_survive(self):
        buffer = io.BytesIO()
        files = {'index.js': b'prod-only exports', 'src/loan.js': b'COM-153 guard',
                 '.env': b'SYNTHETIC_FIXTURE=value', 'package.json': b'old',
                 'package-lock.json': b'old lock', 'config/function-inventory.json': b'COM-155'}
        with zipfile.ZipFile(buffer, 'w') as z:
            for name, content in files.items():
                z.writestr(name, content)
        result, changed = release.rewrite_archive(buffer.getvalue(), {'package.json': b'patched'})
        self.assertEqual(changed, ['package.json'])
        with zipfile.ZipFile(io.BytesIO(result)) as z:
            for name, content in files.items():
                self.assertEqual(z.read(name), b'patched' if name == 'package.json' else content)
        with self.assertRaises(ValueError):
            release.rewrite_archive(buffer.getvalue(), {'index.js': b'regression'})

    def test_rejects_duplicate_zip_entries(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as z:
            z.writestr('package.json', b'a')
            with self.assertWarns(UserWarning):
                z.writestr('package.json', b'b')
        with self.assertRaises(ValueError):
            release.rewrite_archive(buffer.getvalue(), {'package.json': b'c'})

    def test_helper_patch_preserves_production_template_and_routing_code(self):
        candidate = (release.ROOT / 'functions/src/utils/communicationTemplates.js').read_bytes()
        old = (b"// prod-only prefix\nfunction renderCommunicationTemplate(template, data) {\n"
               b"  const subject = Handlebars.compile(template.subject || '')(data);\n"
               b"  const html = Handlebars.compile(template.htmlContent || '')(data);\n"
               b"  const unreplacedVariables = [];\n}\n// prod-only suffix")
        patched = release.patch_helper(old, candidate)
        self.assertTrue(patched.startswith(b'// prod-only prefix'))
        self.assertTrue(patched.endswith(b'// prod-only suffix'))
        self.assertIn(b'doit ', patched)
        self.assertEqual(release.patch_helper(patched, candidate), patched)
        with self.assertRaises(ValueError):
            release.patch_helper(old.replace(b'template.subject ||', b'template.title ||'), candidate)

    def test_production_extra_dependency_and_manifest_settings_survive(self):
        old = {'dependencies': {'cheerio': '^1.0.0', 'handlebars': '^4.7.8'},
               'engines': {'node': '22'}, 'overrides': {'prod-only': '1.0.0'}}
        frozen = copy.deepcopy(old)
        updated = release.merge_manifest(old, {'dependencies': {'handlebars': '^4.7.10'},
                                               'overrides': {'proxy-addr': '2.0.8'}})
        self.assertEqual(old, frozen)
        self.assertEqual(updated['dependencies']['cheerio'], '^1.0.0')
        self.assertEqual(updated['overrides']['prod-only'], '1.0.0')
        self.assertEqual(updated['engines'], old['engines'])

    def test_configuration_fingerprint_detects_permission_environment_trigger_drift(self):
        before = {'name': 'f', 'state': 'ACTIVE', 'labels': {'firebase': 'default'},
                  'buildConfig': {'source': {'a': 1}, 'build': 'old', 'entryPoint': 'f', 'runtime': 'nodejs22'},
                  'serviceConfig': {'revision': 'old', 'environmentVariables': {'a': 'fixture'}},
                  'eventTrigger': {'eventType': 'example'}}
        after = copy.deepcopy(before)
        after['buildConfig']['source'] = {'b': 2}
        after['buildConfig']['build'] = 'new'
        after['serviceConfig']['revision'] = 'new'
        after['updateTime'] = 'new'
        self.assertEqual(release.config_hash(before), release.config_hash(after))
        after['serviceConfig']['environmentVariables']['a'] = 'changed'
        self.assertNotEqual(release.config_hash(before), release.config_hash(after))

    def test_nested_vulnerable_copies_are_not_hidden(self):
        versions = release.versions({'packages': {'node_modules/qs': {'version': '6.17.1'},
                                                'node_modules/a/node_modules/qs': {'version': '6.16.0'}}})
        self.assertEqual(versions['qs'], ['6.16.0', '6.17.1'])

    def test_unordered_event_filter_presentation_does_not_look_like_drift(self):
        a = {'eventTrigger': {'eventFilters': [{'attribute': 'a'}, {'attribute': 'b'}]}}
        b = {'eventTrigger': {'eventFilters': [{'attribute': 'b'}, {'attribute': 'a'}]}}
        self.assertEqual(release.config_hash(a), release.config_hash(b))

    def test_cloud_mutation_is_limited_to_named_source_and_one_update_mask(self):
        f = {'name': release.PREFIX + '/functions/example', 'state': 'ACTIVE',
             'buildConfig': {'sourceProvenance': {'resolvedStorageSource': {'bucket': 'b', 'object': 'o', 'generation': '1'}}},
             'serviceConfig': {'revision': 'before'}}
        target = {'name': f['name'], 'group': 'g', 'source': release.source(f),
                  'configurationSha256': release.config_hash(f)}
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            release.save(folder / 'snapshot.json', {'targets': [target], 'groups': [{'group': 'g'}]})
            release.save(folder / 'candidates.json', [{'group': 'g', 'archiveSha256': release.sha(b'zip fixture')}])
            release.save(folder / 'com153-live.json', {'verifiedLive': True, 'snapshotAfterCom153': True})
            (folder / 'candidates').mkdir()
            (folder / 'candidates/g.zip').write_bytes(b'zip fixture')
            def response(url, method='GET', body=None, signed=False):
                if method == 'PATCH':
                    return {'name': 'op', 'done': True}
                if url.endswith('generateUploadUrl'):
                    return {'uploadUrl': 'https://synthetic.invalid', 'storageSource': {'bucket': 'new', 'object': 'o'}}
                if signed:
                    return b''
                return copy.deepcopy(f)
            with mock.patch.object(release, 'inventory', return_value=[f]), mock.patch.object(
                    release, 'request', side_effect=response) as request:
                release.deploy(folder)
            patches = [call for call in request.call_args_list if len(call.args) > 1 and call.args[1] == 'PATCH']
            self.assertEqual(len(patches), 1)
            self.assertEqual(patches[0].args[0], release.API + f['name'] + '?updateMask=buildConfig.source')
            self.assertEqual(set(patches[0].args[2]), {'name', 'buildConfig'})
            self.assertEqual(set(patches[0].args[2]['buildConfig']), {'source'})
            self.assertEqual(release.read(folder / 'rollout.json')[0]['state'], 'completed')

    def test_unknown_com153_completion_blocks_before_cloud_mutations(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            release.save(folder / 'snapshot.json', {'targets': [], 'groups': []})
            release.save(folder / 'candidates.json', [])
            release.save(folder / 'com153-live.json', {'verifiedLive': False})
            with mock.patch.object(release, 'request') as request, self.assertRaises(RuntimeError):
                release.deploy(folder)
            request.assert_not_called()

    def test_only_the_exact_reviewed_com153_runtime_gets_external_test_files(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as z:
            z.writestr('index.js', b'an unknown production runtime without tests')
        with tempfile.TemporaryDirectory() as directory, zipfile.ZipFile(io.BytesIO(buffer.getvalue())) as z:
            with self.assertRaises(RuntimeError):
                release.supply_com153_tests(z, Path(directory))

    def test_sealed_com153_tests_stay_outside_the_deployment_archive(self):
        sealed = release.ROOT / 'releases/com153-borg/functions'
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as z:
            for name in ['index.js', 'src/payment/materialLoanPayment.js', 'src/loans/materialLoanRoles.js',
                         'src/utils/communicationTemplates.js', 'src/utils/emailDelivery.js']:
                z.writestr(name, (sealed / name).read_bytes())
        with tempfile.TemporaryDirectory() as directory, zipfile.ZipFile(io.BytesIO(buffer.getvalue())) as z:
            work = Path(directory)
            release.supply_com153_tests(z, work)
            self.assertTrue((work / 'src/payment/materialLoanPayment.authorization.test.js').exists())
            self.assertFalse(any(name.endswith('.test.js') for name in z.namelist()))


if __name__ == '__main__':
    unittest.main()
