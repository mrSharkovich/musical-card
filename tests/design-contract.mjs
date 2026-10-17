// Контракты нового оформления «Почта» между браузером и сервером.
// Запуск из корня проекта: node tests/design-contract.mjs
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

globalThis.window = {location:{origin:'http://127.0.0.1:8001'}};
const {safeColor, inkFor} = await import('../src/ui.js');
const {icon, ICON_NAMES, brandMark, reel} = await import('../src/icons.js');
const {FONT_STACKS, fontStack} = await import('../src/stage.js');
const {effectiveMusicVolume, DUCK_FACTOR} = await import('../src/audio.js');
const {projectForApi, apiErrorMessage} = await import('../src/api.js');
const {newProject} = await import('../src/model.js');
let checks = 0;
const ok = (...args) => { assert.ok(...args); checks++; };
const eq = (...args) => { assert.equal(...args); checks++; };

// 1. Цвета из каталога/проекта попадают в style="" только как #RRGGBB.
for (const bad of ['red', '#fff', 'url(//evil)', '#12345g', '#123456;background:red', '', null, undefined, 42]) {
  eq(safeColor(bad, '#ABCDEF'), '#ABCDEF', `safeColor(${String(bad)})`);
}
eq(safeColor('#a1B2c3'), '#a1B2c3');

// 2. Подпись на миниатюре шаблона читаема на любом фоне (контраст ≥ 4.5 : 1).
const luminance = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
for (const bg of ['#ffffff', '#fce8f2', '#54423c', '#97757c', '#000000', '#2f6b8f', '#e0a33a', '#777777', '#5a5a5a']) {
  ok(contrast(bg, inkFor(bg)) >= 4.5, `контраст подписи на ${bg}: ${contrast(bg, inkFor(bg)).toFixed(2)}`);
}

// 3. Иконки: собственные SVG, скрыты от скринридеров, все используемые имена существуют.
for (const name of ICON_NAMES) {
  const svg = icon(name);
  ok(svg.startsWith('<svg') && svg.includes('aria-hidden="true"') && !/https?:|<script|on\w+=/.test(svg), name);
}
for (const art of [brandMark(), reel()]) ok(!/https?:\/\/(?!www\.w3\.org)|<script|on\w+=/.test(art));
const used = new Set();
for (const file of readdirSync('src').filter(f => f.endsWith('.js'))) {
  for (const m of readFileSync(`src/${file}`, 'utf8').matchAll(/icon\('([a-zA-Z]+)'/g)) used.add(m[1]);
  // Иконки панели инструментов берутся по ключу инструмента.
  for (const m of readFileSync(`src/${file}`, 'utf8').matchAll(/\['(templates|text|images|shapes|background|draw|layers|audio)','/g)) used.add(m[1]);
}
for (const name of used) ok(ICON_NAMES.includes(name), `иконка «${name}» используется, но не нарисована`);

// 4. Шрифты текста: тот же список, что принимает сервер (schemas.py) и предлагает редактор.
const schema = readFileSync('backend/app/schemas.py', 'utf8');
const serverFonts = JSON.parse(schema.match(/TEXT_FONTS = (\([^)]*\))/)[1].replace(/\(/, '[').replace(/\)/, ']').replace(/,\s*\]/, ']'));
assert.deepEqual(Object.keys(FONT_STACKS).sort(), [...serverFonts].sort()); checks++;
const editor = readFileSync('src/editor.js', 'utf8');
const editorFonts = [...editor.match(/const FONT_OPTIONS=\[(.*?)\];/)[1].matchAll(/\['([a-z]+)'/g)].map(m => m[1]);
assert.deepEqual(editorFonts.sort(), [...serverFonts].sort()); checks++;
eq(fontStack('hand').split(',')[0], "'Caveat'");
eq(fontStack('script').split(',')[0], "'Pacifico'");
eq(fontStack('round').split(',')[0], "'Nunito'");
eq(fontStack('unknown;color:red'), FONT_STACKS.serif, 'неизвестный шрифт не попадает в CSS');
eq(fontStack('__proto__'), FONT_STACKS.serif);
const css = readFileSync('styles.css', 'utf8');
for (const family of ['Caveat', 'Nunito', 'Pacifico']) ok(css.includes(`font-family: '${family}'`), `@font-face для ${family}`);

// 5. «Музыка тише под голосом».
eq(effectiveMusicVolume(.8), .8);
eq(effectiveMusicVolume(.8, {duck:true, voicePresent:false}), .8, 'без голоса музыку не приглушаем');
eq(effectiveMusicVolume(.8, {duck:false, voicePresent:true}), .8);
eq(effectiveMusicVolume(.8, {duck:true, voicePresent:true}), .8 * DUCK_FACTOR);
eq(effectiveMusicVolume(5, {duck:false}), 1, 'громкость ограничена сверху');
eq(effectiveMusicVolume(-1), 0);
eq(effectiveMusicVolume('abc'), .35, 'мусор → громкость по умолчанию');
ok(DUCK_FACTOR > 0 && DUCK_FACTOR < 1);

// 6. Новое поле проекта доходит до сервера, лишние поля — нет.
const fresh = newProject('Проверка', '4:5', 'blank');
eq(fresh.duckMusic, false, 'новые открытки: приглушение выключено, пока пользователь не включит');
const sent = projectForApi({...fresh, duckMusic:true, uiOnly:1});
eq(sent.duckMusic, true);
eq(Object.hasOwn(sent, 'uiOnly'), false);

// 7. Ошибки сервера показываются по-человечески, без сырого JSON и HTML.
eq(apiErrorMessage('{"detail":"Ресурс не найден"}', 404), 'Ресурс не найден');
eq(apiErrorMessage('{"detail":[{"loc":["body"],"msg":"x"}]}', 422), 'Данные не прошли проверку на сервере');
eq(apiErrorMessage('<html><b>Bad</b></html>', 502), 'Bad');
eq(apiErrorMessage('', 429), 'Слишком много запросов. Подождите минуту и попробуйте снова');
ok(apiErrorMessage('x'.repeat(500), 500).length <= 200);

// 8. Тема: ранний скрипт без внешних ресурсов и eval.
const theme = readFileSync('src/theme.js', 'utf8');
ok(!/https?:|eval\(|import /.test(theme));
const index = readFileSync('index.html', 'utf8');
ok(index.indexOf('src/theme.js') < index.indexOf('styles.css'), 'тема применяется до загрузки стилей');

console.log(`OK: ${checks} checks — цвета, контраст, иконки, шрифты, приглушение, поля проекта, тема`);
