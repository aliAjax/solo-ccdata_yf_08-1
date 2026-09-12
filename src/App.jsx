import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APP_ID, VERSION, STORE_KEY, SESSION_TAGS, PLACE_STATUS, LOOT_CATEGORIES, PALETTE,
  uid, isValidDateStr, todayStr, loadCampaign, validateCampaign,
  sortSessions, buildUsage, sessionMatches,
} from './model.js';

// ---------------- 小部件 ----------------

const Toast = ({ toast }) =>
  toast ? <div className={`toast toast-${toast.type}`}>{toast.text}</div> : null;

const EmptyState = ({ icon, title, desc, action }) => (
  <div className="empty">
    <div className="empty-icon">{icon}</div>
    <h2>{title}</h2>
    <p>{desc}</p>
    {action}
  </div>
);

const FieldError = ({ children }) => (children ? <p className="field-error">{children}</p> : null);

// 通用确认框（用于删除关联中条目等）
function ConfirmDialog({ title, desc, confirmText, danger, onConfirm, onClose }) {
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal modal-sm" onMouseDown={(e) => e.stopPropagation()}>
        <span className="crumb">请确认</span>
        <h2>{title}</h2>
        {desc ? <div className="confirm-desc">{desc}</div> : null}
        <div className="modal-actions">
          <button className="outline" onClick={onClose}>取消</button>
          <button className={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmText || '确认'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- 角色 / 地点 / 战利品 表单 ----------------

const ENTITY_META = {
  characters: { label: '角色', icon: '♙', extraFields: true },
  places: { label: '地点', icon: '⌖' },
  loots: { label: '战利品', icon: '◇' },
};

function EntityModal({ kind, initial, existing, onSave, onClose }) {
  const meta = ENTITY_META[kind];
  const [form, setForm] = useState(() => initial || {
    name: '', color: PALETTE[existing.length % PALETTE.length],
    role: '', player: '', note: '',
    status: PLACE_STATUS[1], region: '',
    qty: 1, category: LOOT_CATEGORIES[0],
  });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    const e = {};
    const name = form.name.trim();
    if (!name) e.name = '名称不能为空。';
    else if (existing.some((x) => x.name.trim() === name && x.id !== initial?.id)) {
      e.name = `${meta.label}「${name}」已存在，名称不能重复。`;
    }
    if (kind === 'loots') {
      if (!Number.isInteger(form.qty) || form.qty < 1) e.qty = '数量必须是大于 0 的整数。';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    const out = { ...form, name, note: form.note.trim() };
    if (kind === 'characters') { out.role = form.role.trim(); out.player = form.player.trim(); }
    if (kind === 'places') { out.region = form.region.trim(); }
    onSave(out);
  };

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="关闭">×</button>
        <span className="crumb">{initial ? 'EDIT' : 'NEW'} · {meta.label}</span>
        <h2>{initial ? `编辑${meta.label}` : `新建${meta.label}`}</h2>

        <label>名称
          <input value={form.name} autoFocus maxLength={40}
            onChange={(e) => set('name', e.target.value)}
            placeholder={kind === 'characters' ? '例：艾德里安' : kind === 'places' ? '例：灰港' : '例：古老铜币'} />
          <FieldError>{errors.name}</FieldError>
        </label>

        {kind === 'characters' && <>
          <div className="form-row">
            <label>职业 / 身份
              <input value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="例：圣骑士" />
            </label>
            <label>玩家
              <input value={form.player} onChange={(e) => set('player', e.target.value)} placeholder="例：林默" />
            </label>
          </div>
          <label>颜色
            <ColorPick value={form.color} onChange={(c) => set('color', c)} />
          </label>
        </>}

        {kind === 'places' && <div className="form-row">
          <label>区域
            <input value={form.region} onChange={(e) => set('region', e.target.value)} placeholder="例：灰港旧城区" />
          </label>
          <label>状态
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              {PLACE_STATUS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>}

        {kind === 'loots' && <div className="form-row">
          <label>数量
            <input type="number" min={1} step={1} value={form.qty}
              onChange={(e) => set('qty', parseInt(e.target.value, 10))} />
            <FieldError>{errors.qty}</FieldError>
          </label>
          <label>类别
            <select value={form.category} onChange={(e) => set('category', e.target.value)}>
              {LOOT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>}

        <label>备注
          <textarea rows={2} value={form.note} onChange={(e) => set('note', e.target.value)}
            placeholder="背景、出处或其他说明（可选）" />
        </label>

        <button className="primary full" onClick={save}>{initial ? '保存修改' : `添加${meta.label}`}</button>
      </div>
    </div>
  );
}

const ColorPick = ({ value, onChange }) => (
  <div className="color-pick">
    {PALETTE.map((c) => (
      <button key={c} type="button" aria-label={`颜色 ${c}`}
        className={value === c ? 'on' : ''} style={{ background: c }}
        onClick={() => onChange(c)} />
    ))}
  </div>
);

// ---------------- 章节表单（含关联选择） ----------------

const ChipPicker = ({ title, icon, items, selected, onToggle, dangling }) => (
  <fieldset className="picker">
    <legend>{icon} {title}（已选 {selected.length}）{dangling.length > 0 &&
      <em className="dangling-count">· {dangling.length} 项已失效</em>}</legend>
    {items.length === 0 && dangling.length === 0
      ? <p className="picker-empty">暂无可用条目，请先在对应页签创建。</p>
      : <div className="chips">
          {items.map((it) => (
            <button type="button" key={it.id}
              className={'chip' + (selected.includes(it.id) ? ' on' : '')}
              onClick={() => onToggle(it.id)}>
              {it.name}
            </button>
          ))}
          {dangling.map((id) => (
            <span key={id} className="chip dangling" title={`关联目标已不存在：${id}`}>缺失条目 ✕</span>
          ))}
        </div>}
  </fieldset>
);

function SessionModal({ initial, data, onSave, onClose }) {
  const [form, setForm] = useState(() => initial || {
    title: '', date: todayStr(), tag: SESSION_TAGS[0], summary: '',
    color: PALETTE[0], characters: [], places: [], loots: [],
  });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k, id) => set(k, form[k].includes(id) ? form[k].filter((x) => x !== id) : [...form[k], id]);

  const danglingOf = (k, coll) => form[k].filter((id) => !data[coll].some((x) => x.id === id));
  const dangling = {
    characters: danglingOf('characters', 'characters'),
    places: danglingOf('places', 'places'),
    loots: danglingOf('loots', 'loots'),
  };

  const save = () => {
    const e = {};
    const title = form.title.trim();
    if (!title) e.title = '章节标题不能为空。';
    if (!form.date) e.date = '请选择游戏日期。';
    else if (!isValidDateStr(form.date)) e.date = `日期「${form.date}」不合法，请使用有效的 YYYY-MM-DD。`;
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({ ...form, title, summary: form.summary.trim() });
  };

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal modal-lg" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="关闭">×</button>
        <span className="crumb">{initial ? 'EDIT CHAPTER' : 'NEW CHAPTER'}</span>
        <h2>{initial ? '编辑章节' : '记录新的章节'}</h2>

        <label>章节标题
          <input value={form.title} autoFocus maxLength={60}
            onChange={(e) => set('title', e.target.value)} placeholder="例：第三章：月下集市" />
          <FieldError>{errors.title}</FieldError>
        </label>
        <div className="form-row">
          <label>游戏日期
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            <FieldError>{errors.date}</FieldError>
          </label>
          <label>章节类型
            <select value={form.tag} onChange={(e) => set('tag', e.target.value)}>
              {SESSION_TAGS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label>章节摘要
          <textarea rows={3} value={form.summary} onChange={(e) => set('summary', e.target.value)}
            placeholder="发生了什么？重要决定、未解线索……" />
        </label>
        <label>章节色
          <ColorPick value={form.color} onChange={(c) => set('color', c)} />
        </label>

        <ChipPicker title="参与者" icon="♙" items={data.characters}
          selected={form.characters} dangling={dangling.characters}
          onToggle={(id) => toggle('characters', id)} />
        <ChipPicker title="地点" icon="⌖" items={data.places}
          selected={form.places} dangling={dangling.places}
          onToggle={(id) => toggle('places', id)} />
        <ChipPicker title="收获" icon="◇" items={data.loots}
          selected={form.loots} dangling={dangling.loots}
          onToggle={(id) => toggle('loots', id)} />
        {(dangling.characters.length + dangling.places.length + dangling.loots.length) > 0 &&
          <button type="button" className="link-btn"
            onClick={() => setForm((f) => ({
              ...f,
              characters: f.characters.filter((id) => !dangling.characters.includes(id)),
              places: f.places.filter((id) => !dangling.places.includes(id)),
              loots: f.loots.filter((id) => !dangling.loots.includes(id)),
            }))}>
            一键清除全部失效关联
          </button>}

        <button className="primary full" onClick={save}>{initial ? '保存修改' : '保存章节'}</button>
      </div>
    </div>
  );
}

// ---------------- 实体卡片列表（角色 / 地点 / 战利品） ----------------

function EntityCards({ kind, data, usage, onEdit, onDelete }) {
  const items = data[kind];
  const meta = ENTITY_META[kind];
  if (items.length === 0) {
    return <EmptyState icon={meta.icon} title={`还没有${meta.label}`}
      desc={`当前没有任何${meta.label}。点击右上角「新建${meta.label}」添加第一条，章节可以关联${meta.label}。`}
      action={<button className="primary" onClick={() => onEdit(null)}>＋ 新建{meta.label}</button>} />;
  }
  return (
    <section className="cards">
      <div className="section-note">
        共 {items.length} 个{meta.label}；点击卡片上的按钮可编辑或移除。被章节引用 {kind === 'characters' ? '（作为参与者）' : kind === 'places' ? '（作为地点）' : '（作为收获）'} 的条目删除时会同步解除关联。
      </div>
      {items.map((it) => {
        const used = usage[kind === 'characters' ? 'character' : kind === 'places' ? 'place' : 'loot'].get(it.id) || [];
        return (
          <article className="char-card" key={it.id}>
            {kind === 'characters'
              ? <div className="avatar" style={{ background: it.color }}>{it.name[0] || '？'}</div>
              : <div className={`avatar avatar-${kind === 'places' ? 'place' : 'loot'}`}>{meta.icon}</div>}
            <div className="card-main">
              <small>
                {kind === 'characters' && (it.role || '未设定职业')}
                {kind === 'places' && <>{it.region || '未分类区域'} · {it.status}</>}
                {kind === 'loots' && <>× {it.qty} · {it.category}</>}
              </small>
              <h3>{it.name}</h3>
              {kind === 'characters'
                ? <p>玩家 · {it.player || '未分配'}</p>
                : <p>{it.note || '暂无备注'}</p>}
              <span className="used-badge">用于 {used.length} 个章节</span>
            </div>
            <div className="card-actions">
              <button title="编辑" onClick={() => onEdit(it)}>✎</button>
              <button title="删除" className="del" onClick={() => onDelete(it, used)}>✕</button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

// ---------------- 时间线 ----------------

function Timeline({ data, selectedId, onSelect, onNew, onEdit, onDelete, detailOpen, onCloseDetail }) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('全部');
  const [dir, setDir] = useState('asc');

  const filtered = useMemo(() => {
    const byTag = data.sessions.filter((s) => tag === '全部' || s.tag === tag);
    const byQ = byTag.filter((s) => sessionMatches(s, q.trim(), data));
    return sortSessions(byQ, dir);
  }, [data, q, tag, dir]);

  const chronoIndex = useMemo(() => {
    const asc = sortSessions(data.sessions, 'asc');
    return new Map(asc.map((s, i) => [s.id, i + 1]));
  }, [data.sessions]);

  const cur = data.sessions.find((s) => s.id === selectedId) || null;
  const filtering = q.trim() !== '' || tag !== '全部';

  return (
    <div className="timeline-layout">
      <section className="timeline">
        <div className="timeline-intro">
          <div>
            <span>THE CHRONICLE</span>
            <h2>记录每一次冒险</h2>
          </div>
          <span className="count">{data.sessions.length} CHAPTERS</span>
        </div>

        <div className="filters">
          <input className="search" value={q} placeholder="搜索标题、摘要、角色、地点、收获…"
            onChange={(e) => setQ(e.target.value)} />
          <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="类别筛选">
            <option>全部</option>
            {SESSION_TAGS.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={dir} onChange={(e) => setDir(e.target.value)} aria-label="日期排序">
            <option value="asc">日期 ↑（旧→新）</option>
            <option value="desc">日期 ↓（新→旧）</option>
          </select>
        </div>

        {data.sessions.length === 0
          ? <EmptyState icon="◌" title="时间线还是空的"
              desc="写下第一个章节，之后可以为它关联参与者、地点与收获。"
              action={<button className="primary" onClick={onNew}>＋ 新建章节</button>} />
          : filtered.length === 0
            ? <EmptyState icon="⌕" title="没有匹配的章节"
                desc={filtering ? `关键词「${q.trim()}」与当前筛选条件下没有任何章节。` : '当前类别下暂无章节。'}
                action={<button className="outline" onClick={() => { setQ(''); setTag('全部'); }}>清除搜索与筛选</button>} />
            : filtered.map((s, i) => (
              <button className={'chapter' + (cur?.id === s.id ? ' selected' : '')}
                key={s.id} onClick={() => onSelect(s.id)}>
                <div className="date">
                  <b>{s.date ? s.date.slice(5).replace('-', '/') : '无日期'}</b>
                  <small>{s.date ? s.date.slice(0, 4) : '—'}</small>
                </div>
                <div className="line">
                  <span style={{ background: s.color }} />
                  {i < filtered.length - 1 && <i />}
                </div>
                <div className="chapter-copy">
                  <div className="tag">{s.tag}</div>
                  <h3>{s.title}</h3>
                  <p>{s.summary || '（暂无摘要）'}</p>
                </div>
                <span className="arrow">↗</span>
              </button>
            ))}
      </section>

      <DetailPanel data={data} session={cur} index={cur ? chronoIndex.get(cur.id) : null}
        open={detailOpen} onClose={onCloseDetail} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

const RefChips = ({ label, items, names }) => (
  <div className="ref-block">
    <small>{label}</small>
    {items.length === 0
      ? <strong>未关联</strong>
      : <div className="ref-chips">
          {items.map((id) => names.has(id)
            ? <span key={id} className="mini-chip">{names.get(id)}</span>
            : <span key={id} className="mini-chip broken" title={id}>缺失条目</span>)}
        </div>}
  </div>
);

function DetailPanel({ data, session: cur, index, open, onClose, onEdit, onDelete }) {
  if (!cur) {
    return <section className={'detail-panel' + (open ? ' open' : '')}>
      <EmptyState icon="◌" title="选择一个章节"
        desc="点击左侧时间线中的章节，可查看详情、关联信息并进行编辑。" />
    </section>;
  }
  const names = {
    characters: new Map(data.characters.map((c) => [c.id, c.name])),
    places: new Map(data.places.map((p) => [p.id, p.name])),
    loots: new Map(data.loots.map((l) => [l.id, `${l.name} ×${l.qty}`])),
  };
  const broken = ['characters', 'places', 'loots']
    .reduce((n, k) => n + cur[k].filter((id) => !names[k].has(id)).length, 0);

  return (
    <section className={'detail-panel' + (open ? ' open' : '')}>
      <button className="detail-back" onClick={onClose}>← 返回时间线</button>
      <div className="detail-cover" style={{ background: cur.color }}>
        <span>CHAPTER {String(index ?? 0).padStart(2, '0')}</span>
        <i>✦</i>
      </div>
      <div className="detail-body">
        <span className="tag">{cur.tag}</span>
        <h2>{cur.title}</h2>
        <p>{cur.summary || '这个章节还没有摘要，点击「编辑章节」补充剧情细节。'}</p>
        {broken > 0 && (
          <div className="broken-banner">
            ⚠ 本章节有 {broken} 个关联条目已失效（可能曾被外部修改）。请编辑章节清理失效关联。
            <button className="link-btn light" onClick={() => onEdit(cur)}>去修复</button>
          </div>
        )}
        <div className="meta-grid">
          <div><small>游戏日期</small><strong className={cur.date ? '' : 'invalid'}>{cur.date || '无效 / 缺失'}</strong></div>
          <div><small>参与者</small><strong>{cur.characters.length} 位</strong></div>
        </div>
        <div className="refs">
          <RefChips label="参与者" items={cur.characters} names={names.characters} />
          <RefChips label="地点" items={cur.places} names={names.places} />
          <RefChips label="收获" items={cur.loots} names={names.loots} />
        </div>
        <div className="detail-actions">
          <button className="outline" onClick={() => onEdit(cur)}>✎ 编辑章节</button>
          <button className="outline danger-text" onClick={() => onDelete(cur)}>✕ 删除章节</button>
        </div>
      </div>
    </section>
  );
}

// ---------------- 导入结果框 ----------------

function ImportResult({ result, fileName, onReplace, onClose }) {
  const ok = result.ok;
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal modal-sm" onMouseDown={(e) => e.stopPropagation()}>
        <span className="crumb">IMPORT · {fileName}</span>
        <h2>{ok ? (result.warnings.length ? '校验通过，但有警告' : '校验通过') : '导入失败'}</h2>
        {ok
          ? <>
              <p className="import-line">
                将导入：{result.data.sessions.length} 个章节、{result.data.characters.length} 位角色、
                {result.data.places.length} 个地点、{result.data.loots.length} 件战利品。
                当前数据会被整体替换。
              </p>
              {result.warnings.length > 0 && <ul className="import-warn">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>}
              <div className="modal-actions">
                <button className="outline" onClick={onClose}>取消</button>
                <button className="primary" onClick={() => onReplace(result.data)}>确认导入</button>
              </div>
            </>
          : <>
              <p className="import-line">文件未通过校验，<b>当前数据没有任何改动</b>。原因：</p>
              <ul className="import-errors">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
              <button className="primary full" onClick={onClose}>我知道了</button>
            </>}
      </div>
    </div>
  );
}

// ---------------- 根组件 ----------------

const TABS = [
  ['timeline', '◌', '时间线'],
  ['characters', '♙', '角色'],
  ['places', '⌖', '地点'],
  ['loots', '◇', '战利品'],
];

export default function App() {
  const initial = useMemo(loadCampaign, []);
  const [data, setData] = useState(initial.data);
  const [tab, setTab] = useState('timeline');
  const [selectedId, setSelectedId] = useState(() => initial.data.sessions[0]?.id ?? null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // {type, ...}
  const [confirm, setConfirm] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [banner, setBanner] = useState(initial.error ? { type: 'error', text: initial.error } : initial.info ? { type: 'info', text: initial.info } : null);
  const fileRef = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* 存储满或不可用 */ }
  }, [data]);

  const usage = useMemo(() => buildUsage(data), [data]);

  const notify = (text, type = 'ok') => {
    setToast({ text, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const kindOfTab = { characters: 'characters', places: 'places', loots: 'loots' }[tab];

  // ---------- 章节 ----------
  const saveSession = (form) => {
    const editing = modal?.initial;
    if (editing) {
      setData((d) => ({ ...d, sessions: d.sessions.map((s) => s.id === editing.id ? { ...s, ...form } : s) }));
      notify(`章节「${form.title}」的修改已保存`);
    } else {
      const s = { id: uid(), ...form };
      setData((d) => ({ ...d, sessions: [...d.sessions, s] }));
      setSelectedId(s.id);
      notify('新章节已加入时间线');
    }
    setModal(null);
  };
  const deleteSession = (s) => setConfirm({
    title: `删除章节「${s.title}」？`,
    desc: '该操作只会移除章节本身，关联的角色、地点与战利品不会被删除。',
    confirmText: '删除章节', danger: true,
    onConfirm: () => {
      setData((d) => ({ ...d, sessions: d.sessions.filter((x) => x.id !== s.id) }));
      if (selectedId === s.id) setSelectedId(null);
      setConfirm(null);
      setDetailOpen(false);
      notify('章节已删除');
    },
  });

  // ---------- 角色/地点/战利品 ----------
  const saveEntity = (form) => {
    const kind = kindOfTab;
    const editing = modal?.initial;
    if (editing) {
      setData((d) => ({ ...d, [kind]: d[kind].map((x) => x.id === editing.id ? { ...x, ...form } : x) }));
      notify(`${ENTITY_META[kind].label}「${form.name}」已更新`);
    } else {
      setData((d) => ({ ...d, [kind]: [...d[kind], { id: uid(), ...form }] }));
      notify(`${ENTITY_META[kind].label}「${form.name}」已添加`);
    }
    setModal(null);
  };
  const deleteEntity = (kind, item, used) => {
    const refKey = kind === 'characters' ? 'characters' : kind === 'places' ? 'places' : 'loots';
    setConfirm({
      title: `删除${ENTITY_META[kind].label}「${item.name}」？`,
      desc: used.length
        ? <><b>{used.length} 个章节</b>关联了此条目：{used.slice(0, 6).map((s) => s.title).join('、')}{used.length > 6 ? ' 等' : ''}。删除后这些章节中的关联会同步移除。</>
        : '当前没有章节关联此条目，可安全删除。',
      confirmText: '确认删除', danger: true,
      onConfirm: () => {
        setData((d) => ({
          ...d,
          [kind]: d[kind].filter((x) => x.id !== item.id),
          sessions: d.sessions.map((s) => ({ ...s, [refKey]: s[refKey].filter((id) => id !== item.id) })),
        }));
        setConfirm(null);
        notify(`${ENTITY_META[kind].label}「${item.name}」已删除，相关章节关联已同步解除`);
      },
    });
  };

  // ---------- 导入 / 导出 ----------
  const onFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      let raw;
      try { raw = JSON.parse(reader.result); }
      catch { setImportResult({ ok: false, errors: ['文件不是合法的 JSON（解析失败），可能已损坏或被改动。'], warnings: [] }); return; }
      const res = validateCampaign(raw);
      setImportResult({ ...res, fileName: file.name });
    };
    reader.onerror = () => {
      setImportResult({ ok: false, errors: ['读取文件失败，请重试。'], warnings: [] });
      setImportResult((r) => ({ ...r, fileName: file.name }));
    };
    reader.readAsText(file);
  };
  const doImport = (incoming) => {
    setData(incoming);
    setSelectedId(incoming.sessions[0]?.id ?? null);
    setImportResult(null);
    notify('导入完成，战役数据已整体替换');
  };
  const doExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `campaign-${data.name.replace(/[\\/:*?"<>|\s]+/g, '-')}-v${VERSION}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify('已导出 JSON，该文件可再次导入');
  };

  const selectChapter = (id) => { setSelectedId(id); setDetailOpen(true); };

  const newLabel = tab === 'timeline' ? '新建章节' : `新建${ENTITY_META[kindOfTab].label}`;

  return (
    <div className="shell">
      <aside>
        <div className="logo"><span>✦</span> CAMPAIGNER</div>
        <button className="campaign" onClick={() => setModal({ type: 'meta' })} title="编辑战役信息">
          <small>当前战役（点击编辑）</small>
          <strong>{data.name}</strong>
          <span>{data.system} · {data.sessions.length} 章节 · v{VERSION}</span>
        </button>
        <nav>{TABS.map(([id, ic, t]) => (
          <button key={id} aria-label={t} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setDetailOpen(false); }}>
            <i>{ic}</i>{t}
          </button>
        ))}</nav>
        <div className="side-bottom">
          <button onClick={() => fileRef.current?.click()}>⇧ 导入数据</button>
          <button onClick={doExport}>↓ 导出数据</button>
          <small>本地存储已开启 · 刷新不丢失</small>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <span className="crumb">MY CAMPAIGN / {data.system}</span>
            <h1>{TABS.find(([id]) => id === tab)[2] === '时间线' ? '战役时间线' : `${TABS.find(([id]) => id === tab)[2]}管理`}</h1>
          </div>
          <div className="actions">
            <button className="outline" onClick={() => fileRef.current?.click()}>⇧ 导入</button>
            <button className="outline" onClick={doExport}>↓ 导出</button>
            <button className="primary"
              onClick={() => tab === 'timeline' ? setModal({ type: 'session' }) : setModal({ type: 'entity', kind: kindOfTab })}>
              ＋ {newLabel}
            </button>
          </div>
        </header>

        {banner && (
          <div className={`banner banner-${banner.type}`}>
            {banner.text}
            <button onClick={() => setBanner(null)} aria-label="关闭">×</button>
          </div>
        )}

        {tab === 'timeline' && (
          <Timeline data={data} selectedId={selectedId} detailOpen={detailOpen}
            onSelect={selectChapter} onCloseDetail={() => setDetailOpen(false)}
            onNew={() => setModal({ type: 'session' })}
            onEdit={(s) => setModal({ type: 'session', initial: s })}
            onDelete={deleteSession} />
        )}
        {kindOfTab && (
          <EntityCards kind={kindOfTab} data={data} usage={usage}
            onEdit={(it) => setModal({ type: 'entity', kind: kindOfTab, initial: it })}
            onDelete={(it, used) => deleteEntity(kindOfTab, it, used)} />
        )}
      </main>

      <nav className="mobile-nav">
        {TABS.map(([id, ic, t]) => (
          <button key={id} aria-label={t} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setDetailOpen(false); }}>
            <i>{ic}</i>{t}
          </button>
        ))}
      </nav>

      <input ref={fileRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />

      {modal?.type === 'session' && (
        <SessionModal initial={modal.initial} data={data} onSave={saveSession} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'entity' && (
        <EntityModal kind={modal.kind} initial={modal.initial}
          existing={data[modal.kind]} onSave={saveEntity} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'meta' && (
        <MetaModal data={data} onClose={() => setModal(null)}
          onSave={(name, system) => {
            setData((d) => ({ ...d, name, system }));
            setModal(null);
            notify('战役信息已更新');
          }} />
      )}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
      {importResult && <ImportResult result={importResult} fileName={importResult.fileName}
        onReplace={doImport} onClose={() => setImportResult(null)} />}
      <Toast toast={toast} />
    </div>
  );
}

function MetaModal({ data, onSave, onClose }) {
  const [name, setName] = useState(data.name);
  const [system, setSystem] = useState(data.system);
  const [err, setErr] = useState('');
  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal modal-sm" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="关闭">×</button>
        <span className="crumb">CAMPAIGN SETTINGS</span>
        <h2>战役信息</h2>
        <label>战役名称
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <label>规则系统
          <input value={system} onChange={(e) => setSystem(e.target.value)} maxLength={40}
            placeholder="例：D&D 5E" />
        </label>
        {err && <p className="field-error">{err}</p>}
        <button className="primary full" onClick={() => {
          if (!name.trim()) { setErr('战役名称不能为空。'); return; }
          onSave(name.trim(), system.trim() || '未指定系统');
        }}>保存</button>
      </div>
    </div>
  );
}
