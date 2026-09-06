#!/usr/bin/env node
/**
 * 回路図 SVG の配線の接続検査
 *
 * src/assets/diagrams/*.svg のうち，配線を class="wire" で示した図を対象にする．
 * 配線（line・polyline・path の開いた部分）の端点が，部品の外形・接続点・
 * 他の配線のいずれかへ許容差の中で触れていることを検査する．
 * 触れていない端点（空隙・突き抜け・置き忘れ）を候補として報告し，
 * 最終判断は目視に委ねる．
 *
 * 触れる相手（回路本体）は，暗い色（Rec.601 輝度が DARK_LUMINANCE_MAX 以下）の
 * 線・多角形・矩形・円とする．補助記載（電流・電圧の矢印，電位のラベル）は
 * 基調色系の中明度で描く規約のため，色で自然に除外される．
 * marker を持つ要素（矢印）と data-connectivity="free" を付けた要素は，
 * 端点が浮いてよいものとして検査しない．
 *
 * 配線に class="wire" が 1 つも無い図は「未対応」として報告だけし，違反にしない．
 * 既存の図へ段階的に印を付けられるようにするためである．
 *
 * 座標変換は translate（と平行移動だけの matrix）に対応する．
 * それ以外の transform を持つ図形は unsupported-transform として報告する．
 * 曲線（C・S・Q・T・A）は端点だけを使い，途中は弦で近似する．
 *
 * TOLERANCE・DARK_LUMINANCE_MAX・EXCLUDED_FILES は本ごとに差し替える定数として
 * 先頭に集約している．
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

/** 端点が触れているとみなす距離（ユーザー座標単位）．本ごとに差し替える． */
export const TOLERANCE = 0.5;

/** 回路本体とみなす色の Rec.601 輝度の上限（%）．これより明るい線は補助記載として無視する． */
export const DARK_LUMINANCE_MAX = 35;

/** 配線を示すクラス名．要素または祖先の <g> に付ける． */
export const WIRE_CLASS = 'wire';

/** 検査から除外するファイル．本ごとに差し替える．既定は空とする． */
export const EXCLUDED_FILES = [];

const COLOR_KEYWORDS = new Map([
  ['black', '#000000'],
  ['white', '#ffffff'],
  ['currentcolor', '#000000'],
]);

/**
 * XML コメントを除去する．変化がなくなるまで繰り返し，破損した境界の取り残しを防ぐ．
 * @param {string} svgText
 * @returns {string}
 */
function stripXmlComments(svgText) {
  let text = svgText;
  for (;;) {
    const next = text.replace(/<!--[\s\S]*?-->/g, '');
    if (next === text) {
      return next;
    }
    text = next;
  }
}

/**
 * 色値の Rec.601 輝度（%）を返す．解釈できない値は null を返す．
 * @param {string | undefined} value
 * @returns {number | null}
 */
export function luminanceOf(value) {
  if (value === undefined) {
    return null;
  }
  let v = value.trim().toLowerCase();
  if (v === 'none') {
    return null;
  }
  if (COLOR_KEYWORDS.has(v)) {
    v = COLOR_KEYWORDS.get(v);
  }
  const match = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!match) {
    return null;
  }
  let digits = match[1];
  if (digits.length === 3) {
    digits = [...digits].map(d => d + d).join('');
  }
  const r = parseInt(digits.slice(0, 2), 16);
  const g = parseInt(digits.slice(2, 4), 16);
  const b = parseInt(digits.slice(4, 6), 16);
  return ((0.299 * r + 0.587 * g + 0.114 * b) / 255) * 100;
}

/**
 * 開始タグの属性を読む．
 * @param {string} attrText
 * @returns {Map<string, string>}
 */
function parseAttributes(attrText) {
  const attrs = new Map();
  for (const match of attrText.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs.set(match[1], match[2] ?? match[3]);
  }
  return attrs;
}

/**
 * transform 属性を平行移動へ解釈する．平行移動以外を含めば null を返す．
 * @param {string | undefined} value
 * @returns {{ x: number, y: number } | null}
 */
export function parseTranslate(value) {
  if (value === undefined || value.trim() === '') {
    return { x: 0, y: 0 };
  }
  let x = 0;
  let y = 0;
  let consumed = '';
  for (const match of value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    consumed += match[0];
    const name = match[1];
    const args = match[2].trim().split(/[\s,]+/).filter(s => s !== '').map(Number);
    if (args.some(n => !Number.isFinite(n))) {
      return null;
    }
    if (name === 'translate' && (args.length === 1 || args.length === 2)) {
      x += args[0];
      y += args[1] ?? 0;
      continue;
    }
    if (name === 'matrix' && args.length === 6 && args[0] === 1 && args[1] === 0 && args[2] === 0 && args[3] === 1) {
      x += args[4];
      y += args[5];
      continue;
    }
    return null;
  }
  if (consumed.replace(/[\s,]/g, '') !== value.replace(/[\s,]/g, '')) {
    return null;
  }
  return { x, y };
}

/**
 * points 属性を座標列へ解釈する．
 * @param {string | undefined} value
 * @returns {Array<[number, number]>}
 */
function parsePoints(value) {
  const numbers = (value ?? '').trim().split(/[\s,]+/).filter(s => s !== '').map(Number);
  const points = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push([numbers[i], numbers[i + 1]]);
  }
  return points;
}

/**
 * path の d 属性を，開いた・閉じたサブパスの頂点列へ解釈する．
 * 曲線は端点だけを取り，途中は弦で近似する．
 * @param {string | undefined} d
 * @returns {Array<{ points: Array<[number, number]>, closed: boolean }>}
 */
export function parsePathSubpaths(d) {
  const tokens = [...(d ?? '').matchAll(/([MmLlHhVvZzCcSsQqTtAa])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/gi)].map(
    m => (m[1] !== undefined ? { cmd: m[1] } : { num: Number(m[2]) })
  );
  const subpaths = [];
  let current = null;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let cmd = null;
  let i = 0;

  const takeNumbers = count => {
    if (i + count > tokens.length) {
      return null;
    }
    const values = [];
    for (let k = 0; k < count; k += 1) {
      const token = tokens[i + k];
      if (token.num === undefined) {
        return null;
      }
      values.push(token.num);
    }
    i += count;
    return values;
  };

  const moveTo = (x, y) => {
    current = { points: [[x, y]], closed: false };
    subpaths.push(current);
    cx = x;
    cy = y;
    startX = x;
    startY = y;
  };
  /* Z の後に M を挟まず描画命令が続くと，閉じたサブパスの始点から
     新しい開いたサブパスが始まる（SVG の仕様どおり） */
  const lineTo = (x, y) => {
    if (!current) {
      current = { points: [[cx, cy]], closed: false };
      subpaths.push(current);
    }
    current.points.push([x, y]);
    cx = x;
    cy = y;
  };

  while (i < tokens.length) {
    if (tokens[i].cmd !== undefined) {
      cmd = tokens[i].cmd;
      i += 1;
      if (cmd === 'Z' || cmd === 'z') {
        if (current) {
          current.closed = true;
        }
        cx = startX;
        cy = startY;
        current = null;
        continue;
      }
    }
    if (cmd === null) {
      break;
    }
    const relative = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();
    let values;
    switch (upper) {
      case 'M':
        values = takeNumbers(2);
        if (!values) return subpaths;
        moveTo(relative ? cx + values[0] : values[0], relative ? cy + values[1] : values[1]);
        cmd = relative ? 'l' : 'L';
        break;
      case 'L':
        values = takeNumbers(2);
        if (!values) return subpaths;
        lineTo(relative ? cx + values[0] : values[0], relative ? cy + values[1] : values[1]);
        break;
      case 'H':
        values = takeNumbers(1);
        if (!values) return subpaths;
        lineTo(relative ? cx + values[0] : values[0], cy);
        break;
      case 'V':
        values = takeNumbers(1);
        if (!values) return subpaths;
        lineTo(cx, relative ? cy + values[0] : values[0]);
        break;
      case 'C':
        values = takeNumbers(6);
        if (!values) return subpaths;
        lineTo(relative ? cx + values[4] : values[4], relative ? cy + values[5] : values[5]);
        break;
      case 'S':
      case 'Q':
        values = takeNumbers(4);
        if (!values) return subpaths;
        lineTo(relative ? cx + values[2] : values[2], relative ? cy + values[3] : values[3]);
        break;
      case 'T':
        values = takeNumbers(2);
        if (!values) return subpaths;
        lineTo(relative ? cx + values[0] : values[0], relative ? cy + values[1] : values[1]);
        break;
      case 'A':
        values = takeNumbers(7);
        if (!values) return subpaths;
        lineTo(relative ? cx + values[5] : values[5], relative ? cy + values[6] : values[6]);
        break;
      default:
        return subpaths;
    }
  }
  return subpaths;
}

/** 回路図であることを root の <svg> に示すクラス名．配線の印が無ければ違反にする． */
export const CIRCUIT_CLASS = 'circuit';

/**
 * SVG テキストを図形の一覧へ解釈する．
 * <defs> と <symbol> の中の図形は定義であり，表示位置を持たないため集めない．
 * <use> は参照先を配置後の座標へ展開できないため，対応外として返す．
 * @param {string} svgText
 * @returns {{ shapes: Array<object>, unsupported: Array<{ label: string, reason: 'transform' | 'use', isWire: boolean }>, isCircuit: boolean }}
 */
export function parseShapes(svgText) {
  const text = stripXmlComments(svgText);
  const shapes = [];
  const unsupported = [];
  const stack = [];
  const counters = new Map();
  const tagPattern = /<(\/?)([a-zA-Z][\w:-]*)\b([^>]*?)(\/?)>/g;
  let isCircuit = false;
  let rootSeen = false;

  for (const match of text.matchAll(tagPattern)) {
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    const attrs = parseAttributes(match[3]);
    const selfClosing = match[4] === '/';

    if (closing) {
      for (let k = stack.length - 1; k >= 0; k -= 1) {
        if (stack[k].tag === tag) {
          stack.splice(k);
          break;
        }
      }
      continue;
    }

    const parent = stack[stack.length - 1];
    const translate = parseTranslate(attrs.get('transform'));
    const classes = new Set(parent ? parent.classes : []);
    for (const name of (attrs.get('class') ?? '').split(/\s+/)) {
      if (name) classes.add(name);
    }
    if (tag === 'svg' && !rootSeen) {
      rootSeen = true;
      isCircuit = classes.has(CIRCUIT_CLASS);
    }
    /* 祖先のどこかに対応外の transform があれば offset は null のまま伝わり，
       その配下の図形は判定できないものとして報告する */
    const parentOffset = parent ? parent.offset : { x: 0, y: 0 };
    const offset =
      translate && parentOffset ? { x: parentOffset.x + translate.x, y: parentOffset.y + translate.y } : null;
    const stroke = attrs.has('stroke') ? attrs.get('stroke') : parent?.stroke;
    const strokeLuma = luminanceOf(stroke);
    const frame = {
      tag,
      classes,
      stroke,
      strokeDark: strokeLuma !== null && strokeLuma <= DARK_LUMINANCE_MAX,
      fill: attrs.has('fill') ? attrs.get('fill') : parent?.fill,
      free: attrs.get('data-connectivity') === 'free' || (parent?.free ?? false),
      marker: attrs.has('marker-start') || attrs.has('marker-end') || attrs.has('marker-mid') || (parent?.marker ?? false),
      offset,
      transformOk: offset !== null,
      inDefs: tag === 'defs' || tag === 'symbol' || (parent?.inDefs ?? false),
    };

    const isShape = ['line', 'polyline', 'polygon', 'path', 'rect', 'circle', 'ellipse'].includes(tag);
    if ((isShape || tag === 'use') && !frame.inDefs) {
      const index = (counters.get(tag) ?? 0) + 1;
      counters.set(tag, index);
      const label = attrs.has('id') ? `${tag}#${attrs.get('id')}` : `${tag}[${index}]`;
      const isWire = classes.has(WIRE_CLASS) && frame.strokeDark;
      if (tag === 'use') {
        unsupported.push({ label, reason: 'use', isWire: classes.has(WIRE_CLASS) });
      } else if (!frame.transformOk) {
        unsupported.push({ label, reason: 'transform', isWire });
      } else {
        const shape = buildShape(tag, attrs, frame, label);
        if (shape) shapes.push(shape);
      }
    }

    if (!selfClosing && !isShape) {
      stack.push(frame);
    }
  }
  return { shapes, unsupported, isCircuit };
}

/**
 * 図形 1 つを幾何へ落とす．
 * @returns {object | null}
 */
function buildShape(tag, attrs, frame, label) {
  const num = name => Number(attrs.get(name) ?? 0);
  const ox = frame.offset.x;
  const oy = frame.offset.y;
  const shift = ([x, y]) => [x + ox, y + oy];
  const fillLuma = luminanceOf(frame.fill);
  const strokeDark = frame.strokeDark;
  const base = {
    label,
    /* 配線は回路本体の色（暗い色）で描く規約のため，補助記載の色の線は
       class="wire" が付いていても配線として検査しない */
    isWire: frame.classes.has(WIRE_CLASS) && strokeDark,
    free: frame.free || frame.marker,
    strokeDark,
    fillDark: fillLuma !== null && fillLuma <= DARK_LUMINANCE_MAX,
  };

  switch (tag) {
    case 'line':
      return { ...base, kind: 'open', subpaths: [{ points: [shift([num('x1'), num('y1')]), shift([num('x2'), num('y2')])], closed: false }] };
    case 'polyline':
      return { ...base, kind: 'open', subpaths: [{ points: parsePoints(attrs.get('points')).map(shift), closed: false }] };
    case 'polygon':
      return { ...base, kind: 'closed', subpaths: [{ points: parsePoints(attrs.get('points')).map(shift), closed: true }] };
    case 'path':
      return {
        ...base,
        kind: 'path',
        subpaths: parsePathSubpaths(attrs.get('d')).map(sp => ({ points: sp.points.map(shift), closed: sp.closed })),
      };
    case 'rect': {
      const x = num('x');
      const y = num('y');
      const w = num('width');
      const h = num('height');
      return {
        ...base,
        kind: 'closed',
        subpaths: [{ points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(shift), closed: true }],
      };
    }
    case 'circle':
      return { ...base, kind: 'circle', center: shift([num('cx'), num('cy')]), r: num('r') };
    case 'ellipse':
      return { ...base, kind: 'circle', center: shift([num('cx'), num('cy')]), r: (num('rx') + num('ry')) / 2 };
    default:
      return null;
  }
}

/**
 * 点と線分の距離．
 */
function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = 0;
  if (lengthSq > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
  }
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

/**
 * 図形の線分（多角形は閉じる辺を含む）を，サブパスと線分の番号付きで列挙する．
 */
function* segmentsOf(shape) {
  for (const [subpath, sp] of (shape.subpaths ?? []).entries()) {
    const pts = sp.points;
    for (let k = 0; k + 1 < pts.length; k += 1) {
      yield { a: pts[k], b: pts[k + 1], subpath, segment: k };
    }
    if (sp.closed && pts.length > 2) {
      yield { a: pts[pts.length - 1], b: pts[0], subpath, segment: pts.length - 1 };
    }
  }
}

/**
 * 点が図形へ許容差の中で触れているか．
 * 円は，暗い塗りを持つ接続点なら内側全体を，中空なら円周だけを相手にする．
 * 中空の円の内側まで許すと，円周を突き抜けた端点を見逃す．
 * @param {[number, number]} point
 * @param {object} shape
 * @param {number} tolerance
 * @param {{ subpath: number, segment: number } | null} skip 自分自身を相手にするとき除く線分
 */
function touches(point, shape, tolerance, skip = null) {
  if (shape.kind === 'circle') {
    const d = Math.hypot(point[0] - shape.center[0], point[1] - shape.center[1]);
    return shape.fillDark ? d <= shape.r + tolerance : Math.abs(d - shape.r) <= tolerance;
  }
  for (const { a, b, subpath, segment } of segmentsOf(shape)) {
    if (skip && skip.subpath === subpath && skip.segment === segment) {
      continue;
    }
    if (distanceToSegment(point, a, b) <= tolerance) {
      return true;
    }
  }
  return false;
}

/**
 * 配線の端点（開いたサブパスの両端）を，端点を持つ線分の番号付きで列挙する．
 * 同じ要素の別のサブパスや隣接しない線分は接続の相手になるため，
 * 除外は端点を持つ線分だけにする．
 */
function* wireEndpoints(shape) {
  for (const [subpath, sp] of (shape.subpaths ?? []).entries()) {
    if (sp.closed || sp.points.length < 2) {
      continue;
    }
    yield { point: sp.points[0], own: { subpath, segment: 0 } };
    yield { point: sp.points[sp.points.length - 1], own: { subpath, segment: sp.points.length - 2 } };
  }
}

/**
 * 除外リストのうち実在しないファイル名を返す．
 * @param {Iterable<string>} realFileNames
 * @param {string[]} [excludedFiles]
 * @returns {string[]}
 */
export function findMissingExcludedFiles(realFileNames, excludedFiles = EXCLUDED_FILES) {
  const names = new Set(realFileNames);
  return excludedFiles.filter(name => !names.has(name));
}

/**
 * 図版 SVG 群の配線の接続を検査する．
 * @param {Map<string, string>} svgFiles ファイル名 → SVG テキスト
 * @param {{ tolerance?: number, excludedFiles?: string[] }} [options]
 * @returns {{ violations: Array<{ type: string, file: string, element?: string, point?: [number, number], message: string }>, unmarkedFiles: string[] }}
 */
export function checkDiagramConnectivity(svgFiles, options = {}) {
  const tolerance = options.tolerance ?? TOLERANCE;
  const excludedFiles = options.excludedFiles ?? EXCLUDED_FILES;
  const violations = [];
  const unmarkedFiles = [];

  for (const [file, svgText] of svgFiles) {
    if (excludedFiles.includes(file)) {
      continue;
    }
    const { shapes, unsupported, isCircuit } = parseShapes(svgText);
    const wires = shapes.filter(s => s.isWire);
    /* 配線の印が対応外の要素にしか無い図も，印の無い図として捨てずに検査へ進める．
       進めた先で対応外の要素を報告する */
    if (wires.length === 0 && !unsupported.some(u => u.isWire)) {
      if (isCircuit) {
        violations.push({
          type: 'no-wires-marked',
          file,
          message: `${file} は root に class="${CIRCUIT_CLASS}" があるのに，配線に class="${WIRE_CLASS}" が 1 つも無い`,
        });
      } else {
        unmarkedFiles.push(file);
      }
      continue;
    }
    for (const { label, reason } of unsupported) {
      violations.push(
        reason === 'use'
          ? {
              type: 'unsupported-element',
              file,
              element: label,
              message: `${file} の ${label} は参照先を配置後の座標へ展開できず，接続を判定できない（図形を直接描く）`,
            }
          : {
              type: 'unsupported-transform',
              file,
              element: label,
              message: `${file} の ${label} は translate 以外の transform を持ち，接続を判定できない`,
            }
      );
    }
    const targets = shapes.filter(s => s.strokeDark || (s.kind === 'circle' && s.fillDark) || (s.kind === 'closed' && s.fillDark));
    for (const wire of wires) {
      if (wire.free) {
        continue;
      }
      for (const { point, own } of wireEndpoints(wire)) {
        const connected = targets.some(target =>
          touches(point, target, tolerance, target === wire ? own : null)
        );
        if (!connected) {
          violations.push({
            type: 'dangling-endpoint',
            file,
            element: wire.label,
            point: [Number(point[0].toFixed(3)), Number(point[1].toFixed(3))],
            message: `${file} の ${wire.label} の端点 (${point[0]}, ${point[1]}) が部品・接続点・他の配線に触れていない`,
          });
        }
      }
    }
  }
  return { violations, unmarkedFiles };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const diagramsDir = fileURLToPath(new URL('../src/assets/diagrams', import.meta.url));
  const files = new Map();
  if (fs.existsSync(diagramsDir)) {
    for (const name of fs.readdirSync(diagramsDir)) {
      if (name.endsWith('.svg')) {
        files.set(name, fs.readFileSync(path.join(diagramsDir, name), 'utf-8'));
      }
    }
  }
  const { violations, unmarkedFiles } = checkDiagramConnectivity(files);
  for (const name of unmarkedFiles) {
    console.log(`skip ${name}: 配線に class="${WIRE_CLASS}" が無いため接続を検査しない`);
  }
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`NG ${v.message}`);
    }
    console.error(`配線の接続の候補が ${violations.length} 件ある．目視で判定する`);
    process.exit(1);
  }
  const checked = files.size - unmarkedFiles.length - EXCLUDED_FILES.filter(name => files.has(name)).length;
  console.log(`ok 図版 SVG ${checked} 件の配線の接続を確認した（未対応 ${unmarkedFiles.length} 件・除外 ${EXCLUDED_FILES.length} 件）`);
}
