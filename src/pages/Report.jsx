import React, { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { useTrip } from '@/hooks/useTrip';
import Shell, { Spinner, Button } from '@/components/Shell';
import { myParticipant } from '@/lib/trips';
import { buildReport, dayTotalLabel, money } from '@/lib/report';

// ---------------------------------------------------------------- look

const THEMES = {
  cream:  { name: '奶油', nameEn: 'Cream',  bg: '#FBF6EE', card: '#FFFFFF', ink: '#3B302A', muted: '#9A8878', accent: '#D9825B', tape: '#F3D98B', soft: '#F3E8D8', dot: '#E9DCC8' },
  sakura: { name: '樱花', nameEn: 'Sakura', bg: '#FDF1F2', card: '#FFFFFF', ink: '#4A2E35', muted: '#A88791', accent: '#DD6F8C', tape: '#F8C8D4', soft: '#FADFE5', dot: '#F2D2DA' },
  matcha: { name: '抹茶', nameEn: 'Matcha', bg: '#F1F4EA', card: '#FFFFFF', ink: '#2F3A2A', muted: '#808E74', accent: '#6E9A5E', tape: '#D6E4B2', soft: '#E2EAD3', dot: '#D9E2C9' },
  night:  { name: '夜空', nameEn: 'Night',  bg: '#1E2232', card: '#282E42', ink: '#F4EFE6', muted: '#A6A4B7', accent: '#F2B880', tape: '#56659A', soft: '#323A52', dot: '#2C3247' },
};
const SERIF = '"Songti SC","STSong","Noto Serif SC","Noto Serif CJK SC","Source Han Serif SC",Georgia,serif';
const SANS = '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';

const W = 1080;
const H = 1350;      // Instagram 4:5
const UNIT = 46;     // px per report line on a slide
const CAPACITY = 22; // lines of content per carousel slide

const shortDate = (d) => { const [, m, day] = d.split('-'); return `${+day}/${+m}`; };

// ---------------------------------------------------------------- content → lines

function toBlocks(report, zh) {
  const b = [];
  if (report.preTrip.length) {
    b.push({ type: 'section', h: 2, label: zh ? '行前花费' : 'Before the trip', total: report.preTotal });
    for (const c of report.preTrip) {
      b.push({ type: 'group', h: 1.5, icon: c.icon, label: zh ? c.labelZh : c.label, total: c.total });
      c.items.forEach(it => b.push({ type: 'item', h: 1, it, showDate: true, group: c.key }));
      b.push({ type: 'gap', h: 0.6 });
    }
  }
  if (report.days.length) {
    b.push({ type: 'section', h: 2, label: zh ? '在地花费' : 'On the trip', total: report.onTripTotal });
    for (const d of report.days) {
      b.push({ type: 'day', h: 1.5, d });
      d.items.forEach(it => b.push({ type: 'item', h: 1, it, group: `d${d.day}` }));
      b.push({ type: 'gap', h: 0.6 });
    }
  }
  return b;
}

// Fill carousel slides; never leave a heading alone at the bottom, and
// repeat the heading (marked "continued") when a group spills over.
function paginate(blocks, zh) {
  const pages = [];
  let page = [];
  let used = 0;
  let lastHeader = null;
  const flush = () => { if (page.length) pages.push(page); page = []; used = 0; };
  blocks.forEach((blk, i) => {
    if (blk.type === 'gap' && used === 0) return;
    const isHeader = blk.type === 'section' || blk.type === 'group' || blk.type === 'day';
    const need = isHeader ? blk.h + (blocks[i + 1]?.h || 0) : blk.h;
    if (used + need > CAPACITY) {
      flush();
      if (blk.type === 'item' && lastHeader) page.push({ ...lastHeader, cont: true }), used += lastHeader.h;
    }
    if (blk.type === 'group' || blk.type === 'day') lastHeader = blk;
    if (blk.type === 'section') lastHeader = null;
    page.push(blk);
    used += blk.h;
  });
  flush();
  return pages.length ? pages : [[{ type: 'empty', h: 2, label: zh ? '还没有账目' : 'No expenses yet' }]];
}

// ---------------------------------------------------------------- pieces

function Tape({ t, style }) {
  return <div style={{ position: 'absolute', width: 210, height: 54, background: t.tape, opacity: 0.85, borderRadius: 6,
    boxShadow: '0 2px 6px rgba(0,0,0,.06)', ...style }} />;
}

function Paper({ t, children, height, style }) {
  return (
    <div style={{
      width: W, height, backgroundColor: t.bg, color: t.ink, fontFamily: SANS, position: 'relative', overflow: 'hidden',
      backgroundImage: `radial-gradient(${t.dot} 2px, transparent 2.5px)`, backgroundSize: '36px 36px', ...style,
    }}>
      {children}
    </div>
  );
}

function Line({ blk, t, base, zh }) {
  if (blk.type === 'gap') return <div style={{ height: blk.h * UNIT }} />;
  if (blk.type === 'empty') return <div style={{ height: blk.h * UNIT, fontSize: 34, color: t.muted, textAlign: 'center' }}>{blk.label}</div>;
  if (blk.type === 'section') {
    return (
      <div style={{ height: blk.h * UNIT, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 14,
        borderBottom: `3px dashed ${t.muted}55`, marginBottom: 8 }}>
        <span style={{ fontFamily: SERIF, fontSize: 46, fontWeight: 800, letterSpacing: 2 }}>{blk.label}</span>
        <span style={{ fontSize: 34, fontWeight: 800, color: t.accent }}>{money(blk.total, base)}</span>
      </div>
    );
  }
  if (blk.type === 'group' || blk.type === 'day') {
    const isDay = blk.type === 'day';
    const left = isDay
      ? <>Day {blk.d.day} <span style={{ fontSize: 26, color: t.muted, fontWeight: 600 }}>· {shortDate(blk.d.date)}</span></>
      : <>{blk.icon} {blk.label}</>;
    const right = isDay ? dayTotalLabel(blk.d, base) : money(blk.total, base);
    return (
      <div style={{ height: blk.h * UNIT, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ background: t.soft, borderRadius: 999, padding: '6px 22px', fontSize: 32, fontWeight: 800, whiteSpace: 'nowrap' }}>
          {left}{blk.cont && <span style={{ fontSize: 24, color: t.muted }}> {zh ? '（续）' : '(cont.)'}</span>}
        </span>
        <span style={{ flex: 1, borderBottom: `2px dotted ${t.muted}66` }} />
        <span style={{ fontSize: 30, fontWeight: 800, color: t.accent, whiteSpace: 'nowrap' }}>{right}</span>
      </div>
    );
  }
  const { it } = blk;
  const foreign = it.currency !== base;
  return (
    <div style={{ height: blk.h * UNIT, display: 'flex', alignItems: 'center', gap: 18, paddingLeft: 26, fontSize: 30 }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {it.title}
        {blk.showDate && <span style={{ fontSize: 24, color: t.muted }}>  {shortDate(it.date)}</span>}
      </span>
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
        {money(it.amountOrig, it.currency)}{it.perPerson && <span style={{ fontSize: 24, color: t.muted }}>{zh ? '/人' : '/pp'}</span>}
        {foreign && blk.showDate && <span style={{ fontSize: 24, color: t.muted }}> ({money(it.amountBase, base)})</span>}
      </span>
    </div>
  );
}

function Cover({ t, trip, report, who, zh, height = H }) {
  const base = report.base;
  const max = Math.max(...report.categories.map(c => c.total), 1);
  const dates = trip.start_date ? `${trip.start_date.replaceAll('-', '.')}${trip.end_date ? ` – ${trip.end_date.slice(5).replace('-', '.')}` : ''}` : '';
  return (
    <Paper t={t} height={height}>
      <Tape t={t} style={{ top: 34, left: 90, transform: 'rotate(-6deg)' }} />
      <Tape t={t} style={{ top: 30, right: 80, transform: 'rotate(5deg)', width: 160 }} />
      <div style={{ position: 'absolute', inset: '90px 70px 70px', background: t.card, borderRadius: 48, padding: '58px 64px',
        boxShadow: '0 18px 50px rgba(60,40,20,.10)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 90, lineHeight: 1 }}>{trip.emoji || '✈️'}</div>
        <div style={{ fontFamily: SERIF, fontSize: 72, fontWeight: 800, marginTop: 16, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trip.name}</div>
        <div style={{ fontSize: 30, color: t.muted, marginTop: 12 }}>{[trip.destination, dates].filter(Boolean).join('  ·  ')}</div>

        <div style={{ marginTop: 36, fontSize: 30, color: t.muted, letterSpacing: 6 }}>{zh ? '花 费 明 细' : 'TRIP SPENDING'}</div>
        <div style={{ fontFamily: SERIF, fontSize: 104, fontWeight: 800, color: t.accent, lineHeight: 1.1 }}>{money(report.total, base)}</div>
        <div style={{ display: 'inline-flex', alignSelf: 'flex-start', marginTop: 14, background: t.soft, borderRadius: 999, padding: '8px 24px', fontSize: 26, fontWeight: 700 }}>
          {who}
        </div>

        <div style={{ display: 'flex', gap: 18, marginTop: 30 }}>
          {[
            [zh ? '行前' : 'Pre-trip', report.preTotal],
            [zh ? '在地' : 'On trip', report.onTripTotal],
            [zh ? '日均' : 'Per day', report.dailyAverage],
          ].map(([l, v]) => (
            <div key={l} style={{ flex: 1, background: t.bg, borderRadius: 28, padding: '20px 24px' }}>
              <div style={{ fontSize: 24, color: t.muted }}>{l}</div>
              <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4 }}>{money(v, base)}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {report.categories.slice(0, 6).map(c => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 29, lineHeight: 1.35 }}>
              <span style={{ width: 210, whiteSpace: 'nowrap', fontWeight: 700 }}>{c.icon} {zh ? c.labelZh : c.label}</span>
              <span style={{ flex: 1, height: 18, background: t.bg, borderRadius: 99, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${(c.total / max) * 100}%`, background: t.accent, borderRadius: 99, opacity: 0.85 }} />
              </span>
              <span style={{ width: 230, textAlign: 'right', fontWeight: 800 }}>{money(c.total, base)}</span>
            </div>
          ))}
        </div>
      </div>
    </Paper>
  );
}

function ContentSlide({ t, trip, lines, base, zh, page, pages }) {
  return (
    <Paper t={t} height={H}>
      <Tape t={t} style={{ top: 28, left: '50%', marginLeft: -105, transform: 'rotate(-2deg)' }} />
      <div style={{ position: 'absolute', inset: '90px 60px 60px', background: t.card, borderRadius: 44, padding: '50px 56px',
        boxShadow: '0 18px 50px rgba(60,40,20,.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, color: t.muted, marginBottom: 18 }}>
          <span>{trip.emoji} {trip.name}</span><span>{page} / {pages}</span>
        </div>
        {lines.map((blk, i) => <Line key={i} blk={blk} t={t} base={base} zh={zh} />)}
      </div>
    </Paper>
  );
}

const LONG_COVER_H = H;
const longBodyHeight = (blocks) => blocks.reduce((s, b) => s + b.h * UNIT, 0) + 180;

function LongImage({ t, trip, report, who, blocks, zh }) {
  const coverH = LONG_COVER_H;
  const bodyH = longBodyHeight(blocks);
  return (
    <div style={{ width: W, background: t.bg }}>
      <Cover t={t} trip={trip} report={report} who={who} zh={zh} height={coverH} />
      <Paper t={t} height={bodyH}>
        <div style={{ position: 'absolute', inset: '0 70px 70px', background: t.card, borderRadius: 48, padding: '56px 60px',
          boxShadow: '0 18px 50px rgba(60,40,20,.08)' }}>
          {blocks.map((blk, i) => <Line key={i} blk={blk} t={t} base={report.base} zh={zh} />)}
        </div>
      </Paper>
    </div>
  );
}

// ---------------------------------------------------------------- page

export default function Report() {
  const { tripId } = useParams();
  const { user } = useAuth();
  const { zh } = useLang();
  const { trip, expenses, isLoading, error } = useTrip(tripId);
  const [scope, setScope] = useState('me');
  const [format, setFormat] = useState('carousel');
  const [themeKey, setThemeKey] = useState('cream');
  const [saving, setSaving] = useState(false);
  const frameRef = useRef(null);
  const [scale, setScale] = useState(0.33);
  const exportRefs = useRef([]);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoading]);

  const me = trip ? myParticipant(trip, user.id) : null;
  const report = useMemo(
    () => (trip ? buildReport(trip, expenses, scope === 'me' ? me?.id : null) : null),
    [trip, expenses, scope, me?.id],
  );
  const blocks = useMemo(() => (report ? toBlocks(report, zh) : []), [report, zh]);
  const pages = useMemo(() => paginate(blocks, zh), [blocks, zh]);

  if (isLoading) return <Spinner />;
  if (error || !trip) return <Shell title={zh ? '花费明细' : 'Spending report'} back="/"><p className="text-sm">{error?.message}</p></Shell>;

  const t = THEMES[themeKey];
  const who = scope === 'me'
    ? (zh ? `我的账单 · ${me?.name || ''}` : `My share · ${me?.name || ''}`)
    : (zh ? `全团账单 · ${trip.participants.length}人` : `Whole group · ${trip.participants.length} people`);

  const slides = format === 'carousel'
    ? [
        { key: 'cover', h: H, el: <Cover t={t} trip={trip} report={report} who={who} zh={zh} /> },
        ...pages.map((lines, i) => ({
          key: `p${i}`, h: H,
          el: <ContentSlide t={t} trip={trip} lines={lines} base={report.base} zh={zh} page={i + 2} pages={pages.length + 1} />,
        })),
      ]
    : [{ key: 'long', h: LONG_COVER_H + longBodyHeight(blocks), el: <LongImage t={t} trip={trip} report={report} who={who} blocks={blocks} zh={zh} /> }];

  const save = async () => {
    setSaving(true);
    try {
      const files = [];
      for (let i = 0; i < slides.length; i++) {
        const node = exportRefs.current[i];
        const dataUrl = await toPng(node, { pixelRatio: 1, cacheBust: true, width: W, height: slides[i].h });
        const blob = await (await fetch(dataUrl)).blob();
        const name = `${trip.name}-${format === 'carousel' ? i + 1 : 'long'}.png`.replace(/[\\/:*?"<>|\s]+/g, '-');
        files.push(new File([blob], name, { type: 'image/png' }));
      }
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files, title: trip.name }).catch(() => {});
      } else {
        for (const f of files) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(f);
          a.download = f.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          await new Promise(r => setTimeout(r, 300));
          URL.revokeObjectURL(a.href);
        }
      }
      toast.success(zh ? `已生成 ${files.length} 张图片` : `${files.length} image(s) ready`);
    } catch (e) {
      console.error(e);
      toast.error(zh ? '生成图片失败，请再试一次' : 'Could not create the images');
    } finally {
      setSaving(false);
    }
  };

  const Seg = ({ value, set, options }) => (
    <div className="grid gap-1 p-1 bg-secondary rounded-xl" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(([k, l]) => (
        <button key={k} onClick={() => set(k)}
          className={`py-2 rounded-lg text-xs font-bold ${value === k ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{l}</button>
      ))}
    </div>
  );

  return (
    <Shell title={zh ? '花费明细账单' : 'Spending report'} subtitle={trip.name} back={`/t/${tripId}`}
      footer={
        <Button onClick={save} disabled={saving || !report.itemCount} className="w-full h-12 text-base">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          {saving ? (zh ? '生成中…' : 'Creating…') : (zh ? `保存图片（${slides.length} 张）` : `Save ${slides.length} image(s)`)}
        </Button>
      }>
      <div className="space-y-2">
        <Seg value={scope} set={setScope} options={[['me', zh ? '我的账单' : 'My share'], ['all', zh ? '全团账单' : 'Whole group']]} />
        <Seg value={format} set={setFormat} options={[['carousel', zh ? '轮播图 4:5' : 'Carousel 4:5'], ['long', zh ? '长图' : 'Long image']]} />
        <div className="flex gap-2">
          {Object.entries(THEMES).map(([k, th]) => (
            <button key={k} onClick={() => setThemeKey(k)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border ${themeKey === k ? 'border-primary' : 'border-border'}`}>
              <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: `linear-gradient(135deg, ${th.bg} 50%, ${th.accent} 50%)` }} />
              {zh ? th.name : th.nameEn}
            </button>
          ))}
        </div>
        {!trip.start_date && (
          <p className="text-[11px] text-muted-foreground">
            {zh ? '提示：在「编辑旅行」填上出发日期，出发前的账目就会归到「行前花费」。' : 'Tip: set the trip start date so earlier expenses show as "Before the trip".'}
          </p>
        )}
      </div>

      <div ref={frameRef} className="space-y-3">
        {slides.map((s, i) => (
          <div key={s.key} className="rounded-2xl overflow-hidden border border-border shadow-sm" style={{ height: s.h * scale }}>
            <div style={{ width: W, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <div ref={el => (exportRefs.current[i] = el)}>{s.el}</div>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
