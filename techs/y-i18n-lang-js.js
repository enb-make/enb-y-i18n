/**
 * y-i18n-lang-js
 * ==============
 *
 * Собирает `?.lang.<язык>.js`-файлы на основе `i18n`-файлов.
 *
 * Используется для локализации в JS с помощью compact-tl + y-i18n-layer.
 *
 * **Опции**
 *
 * * *String* **target** — Результирующий таргет. По умолчанию — `?.lang.{lang}.js`.
 * * *String* **lang** — Язык, для которого небходимо собрать файл.
 *
 * **Пример**
 *
 * ```javascript
 * nodeConfig.addTechs([
 *   [require('enb-y-i18n/techs/y-i18n-lang-js'), {lang: '{lang}'}],
 * ]);
 * ```
 */
var path = require('path');
var vow = require('vow');
var vowFs = require('enb/lib/fs/async-fs');
var asyncRequire = require('enb/lib/fs/async-require');
var dropRequireCache = require('enb/lib/fs/drop-require-cache');
var CompactTL = require('compact-tl').CompactTL;
var yI18NLayer = require('../lib/y-i18n-layer');

module.exports = require('enb/lib/build-flow').create()
    .name('y-i18n-lang-js')
    .target('target', '?.lang.{lang}.js')
    .defineOption('i18nFile', '')
    .defineRequiredOption('lang')
    .useDirList('i18n')
    .needRebuild(function(cache) {
        this._i18nFile = this._i18nFile || path.resolve(__dirname, '../client/y-i18n.js');
        return cache.needRebuildFile('i18n-file', this._i18nFile);
    })
    .saveCache(function(cache) {
        cache.cacheFileInfo('i18n-file', this._i18nFile);
    })
    .builder(function(langKeysetDirs) {
        var lang = this._lang;
        var compactTl = new CompactTL();
        compactTl.use(yI18NLayer.create());
        this._i18nClassData = '';
        return vow.all([
            vowFs.read(this._i18nFile, 'utf8'),
            mergeKeysets(lang, langKeysetDirs)
        ]).spread(function (i18nClassData, keysets) {
            this._i18nClassData = i18nClassData;
            var result = [];
            Object.keys(keysets).sort().forEach(function(keysetName) {
                var keyset = keysets[keysetName];
                var keysetResult = [];
                keysetResult.push('i18n.add(\'' + keysetName + '\', {');
                Object.keys(keyset).map(function(key, i, arr) {
                    keysetResult.push(
                        '    ' + JSON.stringify(key) +
                        ': ' +
                        compactTl.process(keyset[key]) +
                        (i === arr.length - 1 ? '' : ',')
                    );
                });
                keysetResult.push('});');
                result.push(keysetResult.join('\n'));
            });
            return this.getPrependJs(lang) + '\n' + result.join('\n\n') + '\n' + this.getAppendJs(lang);
        }.bind(this));
    })
    .methods({
        getPrependJs: function(lang) {
            if (lang !== 'all') {
                return '(function(){\nfunction initKeyset(i18n) {\n' +
                    'if (!i18n || typeof i18n !== "function") {\n' +
                    'i18n = ' + this._i18nClassData + '\n' +
                    '}\n\n';
            } else {
                return '';
            }
        },
        getAppendJs: function(lang) {
            if (lang !== 'all') {
                var res = [];
                res.push('i18n.setLanguage(\'' + lang + '\');');
                res.push('return i18n;');
                res.push('}');
                res.push('if (typeof modules !== \'undefined\') {');
                res.push('    modules.define(\'y-i18n\', function (provide, i18n) {');
                res.push('        provide(initKeyset(i18n));');
                res.push('    });');
                res.push('} else if (typeof module !== \'undefined\') {');
                res.push('    module.exports = function() {return initKeyset();};');
                res.push('} else if (typeof window !== \'undefined\') {');
                res.push('    window.i18n = initKeyset();');
                res.push('} else {');
                res.push('    i18n = initKeyset();');
                res.push('}');
                res.push('})();');
                return res.join('\n');
            } else {
                return '';
            }
        }
    })
    .createTech();

function mergeKeysets(lang, keysetDirs) {
    var langJs = lang + '.js';
    var langKeysetFiles = [].concat.apply([], keysetDirs.map(function (dir) {
        return dir.files;
    })).filter(function (fileInfo) {
        return fileInfo.name === langJs;
    });

    var result = {};
    return vow.all(langKeysetFiles.map(function (keysetFile) {
        dropRequireCache(keysetFile.fullname);
        return asyncRequire(keysetFile.fullname).then(function (keysets) {
            Object.keys(keysets).forEach(function (keysetName) {
                var keyset = keysets[keysetName];
                result[keysetName] = (result[keysetName] || {});
                Object.keys(keyset).forEach(function (keyName) {
                    result[keysetName][keyName] = keyset[keyName];
                });
            });
        });
    })).then(function () {
        return result;
    });
}
