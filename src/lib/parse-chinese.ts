export function isChineseCharacter(uni: number): boolean {
  return (
    !isNaN(uni) &&
    (uni === 0x25cb ||
      (0x4e00 <= uni && uni <= 0x9fff) || // common
      (0x3400 <= uni && uni <= 0x4dbf) || // rare
      (0xf900 <= uni && uni <= 0xfaff) || // CJK Compatibility Ideographs
      (0xff21 <= uni && uni <= 0xff3a) ||
      (0xff41 <= uni && uni <= 0xff5a) ||
      (0x2b740 <= uni && uni <= 0x2b81f)) // Uncommon, some in current use
  );
}

export function isCjkPunctuation(uni: number): boolean {
  return (
    !isNaN(uni) &&
    ((uni >= 0x3000 && uni <= 0x303f) ||
      isNonIdeographicPunctuation(uni) ||
      isHalfOrFullWidthPunctuation(uni) ||
      isSpace(uni))
  );
}

export function isSpace(uni: number): boolean {
  return !isNaN(uni) && uni === 0x0020;
}

export function isNonIdeographicPunctuation(uni: number): boolean {
  return (
    !isNaN(uni) &&
    (uni === 0xff0c || // fullwidth comma
      uni === 0xff64 || // halfwidth ideographic
      uni === 0xf351 || // small ideographic comma
      uni === 0xfe50 || // small comma
      uni === 0xff01 || // fullwidth exclamation mark
      uni === 0xff0e) // fullwidth fullstop
  );
}

export function isHalfOrFullWidthPunctuation(uni: number): boolean {
  return !isNaN(uni) && uni >= 0xff00 && uni <= 0xffef;
}

export function toScriptFromConfigWriting(
  configWriting: CharacterType,
): SupportedScripts {
  switch (configWriting) {
    case 'traditional_simplified':
    case 'traditional':
      return 'traditional';
    case 'simplified_traditional':
    case 'simplified':
    default:
      return 'simplified';
  }
}

const tonePattern =
  /((([aeiouvüAEIOUVÜ]|u:|u:e){1,2}(n|ng|r|'er|N|NG|R|'ER){0,1}[12345]))|(r5|xx5)/g;
const suffixPattern = /(n|ng|r|'er|N|NG|R|'ER)$/;
const toneMap: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à', 'a'],
  ai: ['āi', 'ái', 'ǎi', 'ài', 'ai'],
  ao: ['āo', 'áo', 'ǎo', 'ào', 'ao'],
  e: ['ē', 'é', 'ě', 'è', 'e'],
  ei: ['ēi', 'éi', 'ěi', 'èi', 'ei'],
  i: ['ī', 'í', 'ǐ', 'ì', 'i'],
  ia: ['iā', 'iá', 'iǎ', 'ià', 'ia'],
  ie: ['iē', 'ié', 'iě', 'iè', 'ie'],
  io: ['iō', 'ió', 'iǒ', 'iò', 'io'],
  iu: ['iū', 'iú', 'iǔ', 'iù', 'iu'],
  o: ['ō', 'ó', 'ǒ', 'ò', 'o'],
  ou: ['ōu', 'óu', 'ǒu', 'òu', 'ou'],
  r: ['r̄', 'ŕ', 'ř', 'r̀', 'r'],
  u: ['ū', 'ú', 'ǔ', 'ù', 'u'],
  ua: ['uā', 'uá', 'uǎ', 'uà', 'ua'],
  ue: ['uē', 'ué', 'uě', 'uè', 'ue'],
  ui: ['uī', 'uí', 'uǐ', 'uì', 'ui'],
  uo: ['uō', 'uó', 'uǒ', 'uò', 'uo'],
  v: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'u'],
  ve: ['üē', 'üé', 'üě', 'üè', 'ue'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
  üe: ['üē', 'üé', 'üě', 'üè', 'üe'],
  xx: ['xx', 'xx', 'xx', 'xx', 'xx'],
};

function getUpperCaseIndices(str: string): number[] {
  const indices: number[] = [];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === str[i].toUpperCase() && str[i] !== ':') {
      indices.push(i);
    }
  }
  return indices;
}

function revertToUpperCase(str: string, indices: number[]): string {
  const chars = str.split('');
  indices.forEach((idx) => {
    chars[idx] = chars[idx].toUpperCase();
  });
  return chars.join('');
}

export function toIndexesFromToneSuffix(text: string): number[] {
  const tones = text.match(tonePattern);
  if (!tones) return [];
  const minimap = tones.map((coda) => parseInt(coda.slice(-1)) - 1);
  return minimap.concat([0], minimap);
}

export function toPinyinFromToneSuffix(text: string): string {
  const tones = text.match(tonePattern);
  let output = `${text}`;
  if (tones) {
    tones.forEach((coda) => {
      const toneIndex = parseInt(coda.slice(-1)) - 1;
      let vowel = coda.slice(0, -1);
      let suffix: RegExpMatchArray | null = null;

      if (vowel !== 'r') {
        suffix = vowel.match(suffixPattern);
        vowel = vowel.replace(suffixPattern, '');
      }

      const upperCaseIndexes = getUpperCaseIndices(vowel);
      vowel = vowel.toLowerCase();

      if (vowel.indexOf('u:') !== -1) {
        vowel = vowel.replace(/u:/i, 'ü');
      }

      const formatted = `${toneMap[vowel]?.[toneIndex] ?? vowel}${suffix ? suffix[0] : ''}`;
      output = output.replace(
        coda,
        revertToUpperCase(formatted, upperCaseIndexes),
      );
    });
  }
  return output;
}

export const pinyinTones = ['\u0304', '\u0301', '\u030c', '\u0300', ''];
export const zhuyinTones = ['', 'ˊ', 'ˇ', 'ˋ', '˙'];

export const stripTone = (pinyinText: string): string => {
  pinyinText = pinyinText
    .normalize('NFD')
    .replace(/\u0304|\u0301|\u030c|\u0300/g, '');
  return pinyinText.normalize('NFC').replace(/(\w|u:|ü)[1-5]/gi, '$1');
};

export const getToneNumber = (pinyinText: string): number => {
  const matches = pinyinText.match(/[a-zü](\d)/i);
  if (matches) return +matches[1];
  for (let i = 0; i < pinyinTones.length; i++) {
    if (pinyinText.normalize('NFD').match(pinyinTones[i])) {
      return i + 1;
    }
  }
  return 5;
};

export const pinyinToZhuyin: Record<string, string> = {
  a: 'ㄚ', ai: 'ㄞ', an: 'ㄢ', ang: 'ㄤ', ao: 'ㄠ',
  ba: 'ㄅㄚ', bai: 'ㄅㄞ', ban: 'ㄅㄢ', bang: 'ㄅㄤ', bao: 'ㄅㄠ',
  bei: 'ㄅㄟ', ben: 'ㄅㄣ', beng: 'ㄅㄥ', bi: 'ㄅㄧ', bian: 'ㄅㄧㄢ',
  biao: 'ㄅㄧㄠ', bie: 'ㄅㄧㄝ', bin: 'ㄅㄧㄣ', bing: 'ㄅㄧㄥ',
  bo: 'ㄅㄛ', bu: 'ㄅㄨ',
  ca: 'ㄘㄚ', cai: 'ㄘㄞ', can: 'ㄘㄢ', cang: 'ㄘㄤ', cao: 'ㄘㄠ',
  ce: 'ㄘㄜ', cei: 'ㄘㄟ', cen: 'ㄘㄣ', ceng: 'ㄘㄥ',
  cha: 'ㄔㄚ', chai: 'ㄔㄞ', chan: 'ㄔㄢ', chang: 'ㄔㄤ', chao: 'ㄔㄠ',
  che: 'ㄔㄜ', chen: 'ㄔㄣ', cheng: 'ㄔㄥ', chi: 'ㄔ',
  chong: 'ㄔㄨㄥ', chou: 'ㄔㄡ', chu: 'ㄔㄨ', chua: 'ㄔㄨㄚ',
  chuai: 'ㄔㄨㄞ', chuan: 'ㄔㄨㄢ', chuang: 'ㄔㄨㄤ', chui: 'ㄔㄨㄟ',
  chun: 'ㄔㄨㄣ', chuo: 'ㄔㄨㄛ', ci: 'ㄘ',
  cong: 'ㄘㄨㄥ', cou: 'ㄘㄡ', cu: 'ㄘㄨ', cuan: 'ㄘㄨㄢ',
  cui: 'ㄘㄨㄟ', cun: 'ㄘㄨㄣ', cuo: 'ㄘㄨㄛ',
  da: 'ㄉㄚ', dai: 'ㄉㄞ', dan: 'ㄉㄢ', dang: 'ㄉㄤ', dao: 'ㄉㄠ',
  de: 'ㄉㄜ', dei: 'ㄉㄟ', den: 'ㄉㄣ', deng: 'ㄉㄥ', di: 'ㄉㄧ',
  dia: 'ㄉㄧㄚ', dian: 'ㄉㄧㄢ', diao: 'ㄉㄧㄠ', die: 'ㄉㄧㄝ',
  ding: 'ㄉㄧㄥ', diu: 'ㄉㄧㄡ', dong: 'ㄉㄨㄥ', dou: 'ㄉㄡ',
  du: 'ㄉㄨ', duan: 'ㄉㄨㄢ', dui: 'ㄉㄨㄟ', dun: 'ㄉㄨㄣ', duo: 'ㄉㄨㄛ',
  e: 'ㄜ', ei: 'ㄟ', en: 'ㄣ', eng: 'ㄥ', er: 'ㄦ',
  fa: 'ㄈㄚ', fan: 'ㄈㄢ', fang: 'ㄈㄤ', fei: 'ㄈㄟ', fen: 'ㄈㄣ',
  feng: 'ㄈㄥ', fo: 'ㄈㄛ', fou: 'ㄈㄡ', fu: 'ㄈㄨ',
  ga: 'ㄍㄚ', gai: 'ㄍㄞ', gan: 'ㄍㄢ', gang: 'ㄍㄤ', gao: 'ㄍㄠ',
  ge: 'ㄍㄜ', gei: 'ㄍㄟ', gen: 'ㄍㄣ', geng: 'ㄍㄥ',
  gong: 'ㄍㄨㄥ', gou: 'ㄍㄡ', gu: 'ㄍㄨ', gua: 'ㄍㄨㄚ',
  guai: 'ㄍㄨㄞ', guan: 'ㄍㄨㄢ', guang: 'ㄍㄨㄤ', gui: 'ㄍㄨㄟ',
  gun: 'ㄍㄨㄣ', guo: 'ㄍㄨㄛ',
  ha: 'ㄏㄚ', hai: 'ㄏㄞ', han: 'ㄏㄢ', hang: 'ㄏㄤ', hao: 'ㄏㄠ',
  he: 'ㄏㄜ', hei: 'ㄏㄟ', hen: 'ㄏㄣ', heng: 'ㄏㄥ',
  hm: 'ㄏㄇ', hng: 'ㄏㄫ', hong: 'ㄏㄨㄥ', hou: 'ㄏㄡ', hu: 'ㄏㄨ',
  hua: 'ㄏㄨㄚ', huai: 'ㄏㄨㄞ', huan: 'ㄏㄨㄢ', huang: 'ㄏㄨㄤ',
  hui: 'ㄏㄨㄟ', hun: 'ㄏㄨㄣ', huo: 'ㄏㄨㄛ',
  ji: 'ㄐㄧ', jia: 'ㄐㄧㄚ', jian: 'ㄐㄧㄢ', jiang: 'ㄐㄧㄤ',
  jiao: 'ㄐㄧㄠ', jie: 'ㄐㄧㄝ', jin: 'ㄐㄧㄣ', jing: 'ㄐㄧㄥ',
  jiong: 'ㄐㄩㄥ', jiu: 'ㄐㄧㄡ', ju: 'ㄐㄩ', juan: 'ㄐㄩㄢ',
  jue: 'ㄐㄩㄝ', jun: 'ㄐㄩㄣ',
  ka: 'ㄎㄚ', kai: 'ㄎㄞ', kan: 'ㄎㄢ', kang: 'ㄎㄤ', kao: 'ㄎㄠ',
  ke: 'ㄎㄜ', kei: 'ㄎㄟ', ken: 'ㄎㄣ', keng: 'ㄎㄥ',
  kong: 'ㄎㄨㄥ', kou: 'ㄎㄡ', ku: 'ㄎㄨ', kua: 'ㄎㄨㄚ',
  kuai: 'ㄎㄨㄞ', kuan: 'ㄎㄨㄢ', kuang: 'ㄎㄨㄤ', kui: 'ㄎㄨㄟ',
  kun: 'ㄎㄨㄣ', kuo: 'ㄎㄨㄛ',
  la: 'ㄌㄚ', lai: 'ㄌㄞ', lan: 'ㄌㄢ', lang: 'ㄌㄤ', lao: 'ㄌㄠ',
  le: 'ㄌㄜ', lei: 'ㄌㄟ', leng: 'ㄌㄥ', li: 'ㄌㄧ', lia: 'ㄌㄧㄚ',
  lian: 'ㄌㄧㄢ', liang: 'ㄌㄧㄤ', liao: 'ㄌㄧㄠ', lie: 'ㄌㄧㄝ',
  lin: 'ㄌㄧㄣ', ling: 'ㄌㄧㄥ', liu: 'ㄌㄧㄡ', lo: 'ㄌㄛ',
  long: 'ㄌㄨㄥ', lou: 'ㄌㄡ', lu: 'ㄌㄨ', lv: 'ㄌㄩ', lü: 'ㄌㄩ',
  'lu:': 'ㄌㄩ', luan: 'ㄌㄨㄢ', lve: 'ㄌㄩㄝ', lüe: 'ㄌㄩㄝ',
  'lu:e': 'ㄌㄩㄝ', lun: 'ㄌㄨㄣ', luo: 'ㄌㄨㄛ',
  m: 'ㄇ', ma: 'ㄇㄚ', mai: 'ㄇㄞ', man: 'ㄇㄢ', mang: 'ㄇㄤ',
  mao: 'ㄇㄠ', me: 'ㄇㄜ', mei: 'ㄇㄟ', men: 'ㄇㄣ', meng: 'ㄇㄥ',
  mi: 'ㄇㄧ', mian: 'ㄇㄧㄢ', miao: 'ㄇㄧㄠ', mie: 'ㄇㄧㄝ',
  min: 'ㄇㄧㄣ', ming: 'ㄇㄧㄥ', miu: 'ㄇㄧㄡ', mo: 'ㄇㄛ',
  mou: 'ㄇㄡ', mu: 'ㄇㄨ',
  n: 'ㄋ', na: 'ㄋㄚ', nai: 'ㄋㄞ', nan: 'ㄋㄢ', nang: 'ㄋㄤ',
  nao: 'ㄋㄠ', ne: 'ㄋㄜ', nei: 'ㄋㄟ', nen: 'ㄋㄣ', neng: 'ㄋㄥ',
  ng: 'ㄫ', ni: 'ㄋㄧ', nia: 'ㄋㄧㄚ', nian: 'ㄋㄧㄢ', niang: 'ㄋㄧㄤ',
  niao: 'ㄋㄧㄠ', nie: 'ㄋㄧㄝ', nin: 'ㄋㄧㄣ', ning: 'ㄋㄧㄥ',
  niu: 'ㄋㄧㄡ', nong: 'ㄋㄨㄥ', nou: 'ㄋㄡ', nu: 'ㄋㄨ', nv: 'ㄋㄩ',
  nü: 'ㄋㄩ', 'nu:': 'ㄋㄩ', nuan: 'ㄋㄨㄢ', nve: 'ㄋㄩㄝ',
  nuo: 'ㄋㄨㄛ', nüe: 'ㄋㄩㄝ', 'nu:e': 'ㄋㄩㄝ',
  o: 'ㄛ', ou: 'ㄡ',
  pa: 'ㄆㄚ', pai: 'ㄆㄞ', pan: 'ㄆㄢ', pang: 'ㄆㄤ', pao: 'ㄆㄠ',
  pei: 'ㄆㄟ', pen: 'ㄆㄣ', peng: 'ㄆㄥ', pi: 'ㄆㄧ', pian: 'ㄆㄧㄢ',
  piao: 'ㄆㄧㄠ', pie: 'ㄆㄧㄝ', pin: 'ㄆㄧㄣ', ping: 'ㄆㄧㄥ',
  po: 'ㄆㄛ', pou: 'ㄆㄡ', pu: 'ㄆㄨ',
  qi: 'ㄑㄧ', qia: 'ㄑㄧㄚ', qian: 'ㄑㄧㄢ', qiang: 'ㄑㄧㄤ',
  qiao: 'ㄑㄧㄠ', qie: 'ㄑㄧㄝ', qin: 'ㄑㄧㄣ', qing: 'ㄑㄧㄥ',
  qiong: 'ㄑㄩㄥ', qiu: 'ㄑㄧㄡ', qu: 'ㄑㄩ', quan: 'ㄑㄩㄢ',
  que: 'ㄑㄩㄝ', qun: 'ㄑㄩㄣ',
  r: 'ㄦ', ran: 'ㄖㄢ', rang: 'ㄖㄤ', rao: 'ㄖㄠ', re: 'ㄖㄜ',
  ren: 'ㄖㄣ', reng: 'ㄖㄥ', ri: 'ㄖ', rong: 'ㄖㄨㄥ', rou: 'ㄖㄡ',
  ru: 'ㄖㄨ', rua: 'ㄖㄨㄚ', ruan: 'ㄖㄨㄢ', rui: 'ㄖㄨㄟ',
  run: 'ㄖㄨㄣ', ruo: 'ㄖㄨㄛ',
  sa: 'ㄙㄚ', sai: 'ㄙㄞ', san: 'ㄙㄢ', sang: 'ㄙㄤ', sao: 'ㄙㄠ',
  se: 'ㄙㄜ', sen: 'ㄙㄣ', seng: 'ㄙㄥ',
  sha: 'ㄕㄚ', shai: 'ㄕㄞ', shan: 'ㄕㄢ', shang: 'ㄕㄤ', shao: 'ㄕㄠ',
  she: 'ㄕㄜ', shei: 'ㄕㄟ', shen: 'ㄕㄣ', sheng: 'ㄕㄥ', shi: 'ㄕ',
  shou: 'ㄕㄡ', shu: 'ㄕㄨ', shua: 'ㄕㄨㄚ', shuai: 'ㄕㄨㄞ',
  shuan: 'ㄕㄨㄢ', shuang: 'ㄕㄨㄤ', shui: 'ㄕㄨㄟ', shun: 'ㄕㄨㄣ',
  shuo: 'ㄕㄨㄛ', si: 'ㄙ', song: 'ㄙㄨㄥ', sou: 'ㄙㄡ', su: 'ㄙㄨ',
  suan: 'ㄙㄨㄢ', sui: 'ㄙㄨㄟ', sun: 'ㄙㄨㄣ', suo: 'ㄙㄨㄛ',
  ta: 'ㄊㄚ', tai: 'ㄊㄞ', tan: 'ㄊㄢ', tang: 'ㄊㄤ', tao: 'ㄊㄠ',
  te: 'ㄊㄜ', tei: 'ㄊㄟ', teng: 'ㄊㄥ', ti: 'ㄊㄧ', tian: 'ㄊㄧㄢ',
  tiao: 'ㄊㄧㄠ', tie: 'ㄊㄧㄝ', ting: 'ㄊㄧㄥ', tong: 'ㄊㄨㄥ',
  tou: 'ㄊㄡ', tu: 'ㄊㄨ', tuan: 'ㄊㄨㄢ', tui: 'ㄊㄨㄟ',
  tun: 'ㄊㄨㄣ', tuo: 'ㄊㄨㄛ',
  wa: 'ㄨㄚ', wai: 'ㄨㄞ', wan: 'ㄨㄢ', wang: 'ㄨㄤ', wei: 'ㄨㄟ',
  wen: 'ㄨㄣ', weng: 'ㄨㄥ', wo: 'ㄨㄛ', wu: 'ㄨ',
  xi: 'ㄒㄧ', xia: 'ㄒㄧㄚ', xian: 'ㄒㄧㄢ', xiang: 'ㄒㄧㄤ',
  xiao: 'ㄒㄧㄠ', xie: 'ㄒㄧㄝ', xin: 'ㄒㄧㄣ', xing: 'ㄒㄧㄥ',
  xiong: 'ㄒㄩㄥ', xiu: 'ㄒㄧㄡ', xu: 'ㄒㄩ', xuan: 'ㄒㄩㄢ',
  xue: 'ㄒㄩㄝ', xun: 'ㄒㄩㄣ',
  ya: 'ㄧㄚ', yan: 'ㄧㄢ', yang: 'ㄧㄤ', yao: 'ㄧㄠ', ye: 'ㄧㄝ',
  yi: 'ㄧ', yin: 'ㄧㄣ', ying: 'ㄧㄥ', yo: 'ㄧㄛ', yong: 'ㄩㄥ',
  you: 'ㄧㄡ', yu: 'ㄩ', yuan: 'ㄩㄢ', yue: 'ㄩㄝ', yun: 'ㄩㄣ',
  za: 'ㄗㄚ', zai: 'ㄗㄞ', zan: 'ㄗㄢ', zang: 'ㄗㄤ', zao: 'ㄗㄠ',
  ze: 'ㄗㄜ', zei: 'ㄗㄟ', zen: 'ㄗㄣ', zeng: 'ㄗㄥ',
  zha: 'ㄓㄚ', zhai: 'ㄓㄞ', zhan: 'ㄓㄢ', zhang: 'ㄓㄤ', zhao: 'ㄓㄠ',
  zhe: 'ㄓㄜ', zhei: 'ㄓㄟ', zhen: 'ㄓㄣ', zheng: 'ㄓㄥ', zhi: 'ㄓ',
  zhong: 'ㄓㄨㄥ', zhou: 'ㄓㄡ', zhu: 'ㄓㄨ', zhua: 'ㄓㄨㄚ',
  zhuai: 'ㄓㄨㄞ', zhuan: 'ㄓㄨㄢ', zhuang: 'ㄓㄨㄤ', zhui: 'ㄓㄨㄟ',
  zhun: 'ㄓㄨㄣ', zhuo: 'ㄓㄨㄛ', zi: 'ㄗ', zong: 'ㄗㄨㄥ',
  zou: 'ㄗㄡ', zu: 'ㄗㄨ', zuan: 'ㄗㄨㄢ', zui: 'ㄗㄨㄟ',
  zun: 'ㄗㄨㄣ', zuo: 'ㄗㄨㄛ',
};

export const toZhuyinFromToneSuffix = (text: string): string => {
  return text
    .split(' ')
    .map((syllable) => {
      const toneless = stripTone(syllable).toLowerCase();
      if (!pinyinToZhuyin[toneless]) return '';
      const zhuyin = pinyinToZhuyin[toneless] ?? toneless;
      const toneNumber = getToneNumber(syllable) ?? 1;
      return zhuyin + zhuyinTones[toneNumber - 1];
    })
    .join(' ');
};

export const toZhuyinFromPinyin = toZhuyinFromToneSuffix;
