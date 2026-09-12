// 战役工作台：数据模型、持久化、导入校验
// 存储格式（导出版本 v1）：
// { app, version, name, system, sessions[], characters[], places[], loots[] }
// 章节通过 id 关联角色（characters）、地点（places）、收获（loots）。

export const APP_ID = 'campaigner-workbench';
export const VERSION = 1;
export const STORE_KEY = 'campaigner-workbench-v1';
export const LEGACY_KEY = 'campaign-log';
export const CORRUPT_KEY = 'campaigner-workbench-corrupt-backup';

export const SESSION_TAGS = ['主线', '支线', '番外'];
export const PLACE_STATUS = ['已探索', '待探索'];
export const LOOT_CATEGORIES = ['消耗品', '装备', '遗物', '任务物品', '金币'];
export const PALETTE = ['#d8a153', '#93b7a6', '#b9a6d1', '#c98a6a', '#7fa6c4', '#a6b97a'];

export const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

const str = (v, fallback = '') =>
  typeof v === 'string' ? v.trim() : fallback;

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const isValidDateStr = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

export const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ---------- 示例数据（含完整关联，作为空库初始内容） ----------

export function seedCampaign() {
  const characters = [
    { id: 'c-adrian', name: '艾德里安', role: '圣骑士', player: '林默', color: '#d8a153', note: '' },
    { id: 'c-seline', name: '瑟琳', role: '游侠', player: '安然', color: '#93b7a6', note: '' },
    { id: 'c-moore', name: '莫尔', role: '术士', player: '周岳', color: '#b9a6d1', note: '' },
  ];
  const places = [
    { id: 'p-harbor', name: '灰港', status: '已探索', region: '滨海城镇', note: '终年海雾弥漫的贸易港。' },
    { id: 'p-belfry', name: '失落钟楼', status: '已探索', region: '灰港旧城区', note: '钟楼下藏有古代符文。' },
    { id: 'p-mistwood', name: '雾林', status: '待探索', region: '灰港北郊', note: '雾中常有异常脚印。' },
  ];
  const loots = [
    { id: 'l-coin', name: '古老铜币', qty: 1, category: '遗物', note: '币面刻着失落钟楼的纹章。' },
    { id: 'l-moonwort', name: '月光草', qty: 3, category: '消耗品', note: '只在月夜开花的草药。' },
    { id: 'l-badge', name: '灰港守卫徽章', qty: 2, category: '任务物品', note: '失踪守卫留下的徽章。' },
  ];
  const sessions = [
    {
      id: 's-bells', date: '2024-06-08', title: '第一章：灰港的钟声', tag: '主线', color: '#d8a153',
      summary: '队伍抵达灰港，在失落的钟楼发现了神秘符文。',
      characters: ['c-adrian', 'c-seline', 'c-moore'], places: ['p-harbor', 'p-belfry'], loots: [],
    },
    {
      id: 's-guest', date: '2024-06-15', title: '第二章：雾中来客', tag: '主线', color: '#93b7a6',
      summary: '与流浪法师伊琳结盟，追踪海雾中的脚印。',
      characters: ['c-adrian', 'c-seline', 'c-moore'], places: ['p-harbor', 'p-mistwood'], loots: [],
    },
    {
      id: 's-herbs', date: '2024-06-22', title: '支线：深林采药', tag: '支线', color: '#b9a6d1',
      summary: '帮助村民寻找月光草，获得一枚古老铜币。',
      characters: ['c-seline', 'c-moore'], places: ['p-mistwood'], loots: ['l-moonwort', 'l-coin'],
    },
  ];
  return { app: APP_ID, version: VERSION, name: '暮光边境', system: 'D&D 5E', sessions, characters, places, loots };
}

// ---------- 旧版（campaign-log）迁移：只增不删，原键保留 ----------

export function migrateLegacy(old) {
  const base = seedCampaign();
  const colorOr = (c, i) => (typeof c === 'string' && HEX_COLOR.test(c) ? c : PALETTE[i % PALETTE.length]);
  const characters = (Array.isArray(old.characters) ? old.characters : [])
    .filter((c) => isObj(c) && typeof c.name === 'string' && c.name.trim())
    .map((c, i) => ({
      id: uid(), name: c.name.trim(), role: str(c.role), player: str(c.player),
      color: colorOr(c.color, i), note: '',
    }));
  const sessions = (Array.isArray(old.sessions) ? old.sessions : [])
    .filter((s) => isObj(s) && typeof s.title === 'string' && s.title.trim())
    .map((s) => ({
      id: s.id != null ? String(s.id) : uid(),
      title: s.title.trim(),
      date: isValidDateStr(s.date) ? s.date : '',
      summary: str(s.summary),
      tag: SESSION_TAGS.includes(s.tag) ? s.tag : '主线',
      color: typeof s.color === 'string' && HEX_COLOR.test(s.color) ? s.color : PALETTE[0],
      characters: [], places: [], loots: [],
    }));
  return {
    app: APP_ID, version: VERSION,
    name: str(old.name, base.name) || base.name,
    system: str(old.system, base.system) || base.system,
    sessions, characters,
    places: [], loots: [],
  };
}

// ---------- 导入校验：严格失败，成功才返回规范化数据 ----------

const LABELS = { character: '角色', place: '地点', loot: '战利品', session: '章节' };

export function validateCampaign(raw) {
  const errors = [];
  const warnings = [];
  const fail = () => ({ ok: false, data: null, errors, warnings });

  if (!isObj(raw)) {
    errors.push('文件内容不是有效的 JSON 对象。');
    return fail();
  }
  if (raw.app !== APP_ID) {
    errors.push(`文件标识不匹配：期望 app="${APP_ID}"。该文件不是本工作台导出的战役数据。`);
  }
  if (!Number.isInteger(raw.version)) {
    errors.push('缺少版本号字段 version，无法判断文件格式。');
  } else if (raw.version > VERSION) {
    errors.push(`文件版本 v${raw.version} 高于当前支持的 v${VERSION}，请升级工作台后再导入。`);
  } else if (raw.version < VERSION) {
    errors.push(`文件版本 v${raw.version} 过旧（当前为 v${VERSION}），暂不支持导入。`);
  }
  for (const k of ['name', 'system']) {
    if (typeof raw[k] !== 'string' || !raw[k].trim()) {
      errors.push(`缺少必填字段「${k}」或内容为空。`);
    }
  }
  for (const k of ['sessions', 'characters', 'places', 'loots']) {
    if (!Array.isArray(raw[k])) errors.push(`缺少集合字段「${k}」（应为数组）。`);
  }
  if (errors.length) return fail();

  const checkId = (item, label, seen) => {
    if (typeof item.id !== 'string' || !item.id.trim()) {
      errors.push(`${label}缺少 id 字段。`);
      return null;
    }
    const id = item.id.trim();
    if (seen.has(id)) {
      errors.push(`${label}的 id「${id}」重复，每个条目必须唯一。`);
      return null;
    }
    seen.add(id);
    return id;
  };
  const checkName = (item, label, seen) => {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) {
      errors.push(`${label}的名称为空。`);
      return null;
    }
    if (seen.has(name)) errors.push(`${LABELS[item.__kind] || '条目'}存在重名「${name}」，同类型名称必须唯一。`);
    seen.add(name);
    return name;
  };
  const enumCheck = (value, allowed, label) => {
    if (!allowed.includes(value)) {
      errors.push(`${label}取值无效「${value}」，允许：${allowed.join(' / ')}。`);
      return false;
    }
    return true;
  };

  // 角色
  const characters = [];
  const cIds = new Set();
  const cNames = new Set();
  raw.characters.forEach((item, i) => {
    const label = isObj(item) && item.name ? `角色「${item.name}」` : `角色第 ${i + 1} 项`;
    if (!isObj(item)) return errors.push(`${label}不是对象。`);
    const id = checkId(item, label, cIds);
    const name = checkName({ ...item, __kind: 'character' }, label, cNames);
    if (!id || !name) return;
    let color = typeof item.color === 'string' ? item.color.trim() : '';
    if (!HEX_COLOR.test(color)) {
      warnings.push(`角色「${name}」的颜色缺失或非法，已自动分配颜色。`);
      color = PALETTE[characters.length % PALETTE.length];
    }
    characters.push({ id, name, role: str(item.role), player: str(item.player), note: str(item.note), color });
  });

  // 地点
  const places = [];
  const pIds = new Set();
  const pNames = new Set();
  raw.places.forEach((item, i) => {
    const label = isObj(item) && item.name ? `地点「${item.name}」` : `地点第 ${i + 1} 项`;
    if (!isObj(item)) return errors.push(`${label}不是对象。`);
    const id = checkId(item, label, pIds);
    const name = checkName({ ...item, __kind: 'place' }, label, pNames);
    if (!id || !name) return;
    const status = str(item.status);
    enumCheck(status, PLACE_STATUS, `${label}的状态`);
    places.push({ id, name, status, region: str(item.region), note: str(item.note) });
  });

  // 战利品
  const loots = [];
  const lIds = new Set();
  const lNames = new Set();
  raw.loots.forEach((item, i) => {
    const label = isObj(item) && item.name ? `战利品「${item.name}」` : `战利品第 ${i + 1} 项`;
    if (!isObj(item)) return errors.push(`${label}不是对象。`);
    const id = checkId(item, label, lIds);
    const name = checkName({ ...item, __kind: 'loot' }, label, lNames);
    if (!id || !name) return;
    if (!Number.isInteger(item.qty) || item.qty < 1) {
      errors.push(`${label}的数量 qty「${item.qty}」无效，必须为大于 0 的整数。`);
    }
    const category = str(item.category);
    enumCheck(category, LOOT_CATEGORIES, `${label}的类别`);
    loots.push({ id, name, qty: item.qty, category, note: str(item.note) });
  });

  if (errors.length) return fail();

  // 章节（引用必须可解析，否则整份导入失败，不做静默丢弃）
  const sessions = [];
  const sIds = new Set();
  const refCheck = (arr, ids, label, allowedLabel) => {
    if (!Array.isArray(arr)) {
      errors.push(`${label}不是数组（应为${allowedLabel} id 列表）。`);
      return [];
    }
    return arr.filter((rid) => {
      if (typeof rid !== 'string' || !rid.trim()) {
        errors.push(`${label}中存在非字符串 id。`);
        return false;
      }
      if (!ids.has(rid)) {
        errors.push(`${label}引用了不存在的${allowedLabel} id「${rid}」（关联已失效）。`);
        return false;
      }
      return true;
    });
  };
  raw.sessions.forEach((item, i) => {
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const label = title ? `章节「${title}」` : `章节第 ${i + 1} 项`;
    if (!isObj(item)) return errors.push(`${label}不是对象。`);
    const id = checkId(item, label, sIds);
    if (!title) errors.push(`${label}的标题为空。`);
    if (!isValidDateStr(item.date)) {
      errors.push(`${label}的日期「${item.date}」无效，必须为合法的 YYYY-MM-DD。`);
    }
    const tag = str(item.tag);
    enumCheck(tag, SESSION_TAGS, `${label}的类型`);
    const summary = str(item.summary);
    const refs = {
      characters: refCheck(item.characters, cIds, label, '角色'),
      places: refCheck(item.places, pIds, label, '地点'),
      loots: refCheck(item.loots, lIds, label, '战利品'),
    };
    if (!id || !title || !isValidDateStr(item.date)) return;
    let color = typeof item.color === 'string' ? item.color.trim() : '';
    if (!HEX_COLOR.test(color)) {
      warnings.push(`章节「${title}」的颜色缺失或非法，已自动分配颜色。`);
      color = PALETTE[sessions.length % PALETTE.length];
    }
    sessions.push({ id, title, date: item.date, tag, summary, color, ...refs });
  });

  if (errors.length) return fail();

  return {
    ok: true,
    errors: [],
    warnings,
    data: {
      app: APP_ID, version: VERSION,
      name: raw.name.trim(), system: raw.system.trim(),
      characters, places, loots, sessions,
    },
  };
}

// ---------- 启动加载：新档 / 损坏档备份 / 旧档迁移 ----------

export function loadCampaign() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
      const res = parsed && validateCampaign(parsed);
      if (res && res.ok) return { data: res.data };
      try { localStorage.setItem(CORRUPT_KEY, raw); } catch { /* 忽略 */ }
      return {
        data: seedCampaign(),
        error: '本地存档解析或校验失败，已保留原数据到损坏备份键，并临时载入示例数据。',
      };
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      try {
        const old = JSON.parse(legacy);
        if (isObj(old) && Array.isArray(old.sessions)) {
          return {
            data: migrateLegacy(old),
            info: '已从旧版战役记录迁移数据，可在章节中补充参与者、地点与收获关联。',
          };
        }
      } catch { /* 旧档损坏则落到示例数据 */ }
    }
  } catch { /* localStorage 不可用时使用内存数据 */ }
  return { data: seedCampaign() };
}

// ---------- 视图辅助 ----------

export function sortSessions(sessions, dir = 'asc') {
  const sorted = [...sessions].sort((a, b) => {
    if (!a.date && !b.date) return a.title.localeCompare(b.title, 'zh');
    if (!a.date) return 1;
    if (!b.date) return -1;
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.title.localeCompare(b.title, 'zh');
  });
  return dir === 'desc' ? sorted.reverse() : sorted;
}

// 每个角色/地点/战利品被哪些章节引用，用于删除确认与角标
export function buildUsage(data) {
  const mk = () => {
    const m = new Map();
    for (const s of data.sessions) for (const list of [s.characters, s.places, s.loots]) {
      for (const id of list) {
        if (!m.has(id)) m.set(id, []);
        m.get(id).push(s);
      }
    }
    return m;
  };
  return { character: mk(), place: mk(), loot: mk() };
}

export const sessionMatches = (s, q, data) => {
  if (!q) return true;
  const hay = [
    s.title, s.summary, s.tag, s.date,
    ...s.characters.map((id) => data.characters.find((c) => c.id === id)?.name),
    ...s.places.map((id) => data.places.find((p) => p.id === id)?.name),
    ...s.loots.map((id) => data.loots.find((l) => l.id === id)?.name),
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
};
