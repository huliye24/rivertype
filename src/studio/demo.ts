/**
 * 演示项目：《文川·第一号：花开时节》
 *
 * 这是 issue #1 指定的首个验收样品：A4 竖版、双面印刷，外加 NFC 数字阅读页。
 *
 * 关于素材的说明（重要）：
 *   本项目刻意不含任何「看起来像真素材」的东西。封面艺术图、内页插画、
 *   主题曲、纪录短片一律登记为 placeholder，页面上会留下可见的占位框。
 *   这是验收条款「缺失时必须明确标注，不得伪造」的直接落地 ——
 *   一个诚实的空位，比一张来路不明的图有用得多。
 */

import {
  Block,
  BlockType,
  StudioProject,
  defaultStyle,
  emptyProject,
  makeId,
  newBlock,
} from './model';
import { registerMediaSlot, registerMissingAsset } from './io';

const FRONT = 'p1';
const BACK = 'p2';

function block(type: BlockType, patch: Partial<Block> = {}): Block {
  const b = newBlock(type, patch);
  if (patch.style) b.style = { ...defaultStyle(type), ...patch.style };
  return b;
}

export const WENCHUAN_ISSUE = '第一号';
export const WENCHUAN_THEME = '花开时节';
/** 演示用的 NFC 目标地址。正式写入 NFC 标签前必须替换为实际发布地址。 */
export const WENCHUAN_NFC_URL = 'https://rivertype.press/wenchuan/01';

const FOREWORD = `所谓「文川」，取的是文字成川的意思。一句一句写下去，看着是零散的，攒起来便有了水势。

这一号起于春天。花开这件事，古来写得最多，也最容易写得轻飘。我们想试的是另一件事：花开与不开之间那段说不清的时辰——蕾已经鼓了，颜色还没定，冷一阵暖一阵，谁也不敢替它做主。

本号所收，一半是花，一半是等待花开的人。`;

const POEM = `花未开时
已经开过一遍

开在无人处
开在不被看见的那一瞬

等风来
风来即是春`;

export function wenchuan01(): StudioProject {
  const coverArt = registerMissingAsset(
    'cover-art.png',
    '封面艺术图未提供，请替换为经授权的原始图像',
  );
  const innerPlate = registerMissingAsset(
    'plate-blossom.png',
    '内页插画未提供（建议 300dpi 以上，最短边不小于 1800px）',
  );

  const project = emptyProject({
    title: '文川',
    issue: `${WENCHUAN_ISSUE}：${WENCHUAN_THEME}`,
    author: '文川编辑部 编',
    publisher: '文川（演示项目）',
    date: '2026 年春',
    language: 'zh-Hans',
    description:
      'RiverType Studio 演示项目：A4 竖版双面印刷样品，含 NFC 数字阅读入口。素材状态见项目内登记表。',
    nfcUrl: WENCHUAN_NFC_URL,
    qrFallback: true,
  });

  project.assets = [coverArt, innerPlate];
  project.media = [
    registerMediaSlot('audio', '主题曲《花开时节》', '音频尚未提供，需替换为已授权母带文件'),
    registerMediaSlot('video', '纪录短片《一日花开》', '短片尚未提供，需替换为已授权成片或平台链接'),
  ];

  const front: Block[] = [
    block('image', {
      id: 'b-cover-art',
      assetId: coverArt.id,
      alt: '封面艺术图（占位）',
      style: { ...defaultStyle('image'), fullBleed: true },
      placeholder: true,
      placeholderNote: coverArt.missing,
    }),
    block('header', {
      id: 'b-front-kicker',
      text: '文川 · 第一号',
      style: { ...defaultStyle('header'), align: 'left', size: 8, color: '#8c2f22', letterSpacing: 0.34, marginTop: 150, marginBottom: 5, font: 'sans' },
    }),
    block('title', {
      id: 'b-front-title',
      text: '花开时节',
      style: { ...defaultStyle('title'), align: 'left', size: 40, letterSpacing: 0.2, color: '#1c1a17', marginBottom: 4 },
    }),
    block('rule', {
      id: 'b-front-rule',
      style: { ...defaultStyle('rule'), width: 18, align: 'left', color: '#8c2f22', marginTop: 2, marginBottom: 5 },
    }),
    block('caption', {
      id: 'b-front-date',
      text: '2026 年春 · 文川编辑部',
      style: { ...defaultStyle('caption'), align: 'left', size: 9, color: '#5a544c', letterSpacing: 0.08 },
    }),
    block('footer', {
      id: 'b-front-footer',
      text: '文川　WENCHUAN　第一号',
      style: { ...defaultStyle('footer'), align: 'left', size: 7.5, color: '#6f6a62', letterSpacing: 0.24, font: 'sans' },
    }),
  ];

  const back: Block[] = [
    block('header', {
      id: 'b-back-running',
      text: '文川 · 第一号 · 花开时节',
      style: { ...defaultStyle('header'), align: 'left', size: 7.5, color: '#8c2f22', letterSpacing: 0.2, font: 'sans' },
    }),
    block('body', {
      id: 'b-foreword',
      text: FOREWORD,
      style: { ...defaultStyle('body'), size: 10.5, lineHeight: 1.9, columns: 2 },
    }),
    block('poem', {
      id: 'b-poem',
      text: POEM,
      style: { ...defaultStyle('poem'), size: 12, lineHeight: 1.95, letterSpacing: 0.1, marginTop: 6, marginBottom: 6 },
    }),
    block('image', {
      id: 'b-plate',
      assetId: innerPlate.id,
      alt: '内页插画（占位）',
      style: { ...defaultStyle('image'), width: 62, align: 'center' },
      placeholder: true,
      placeholderNote: innerPlate.missing,
    }),
    block('caption', {
      id: 'b-plate-caption',
      text: '图版一　（待补）',
      style: { ...defaultStyle('caption'), size: 8 },
    }),
    block('rule', {
      id: 'b-back-rule',
      style: { ...defaultStyle('rule'), width: 30, align: 'center', color: '#c9c9c9', marginTop: 5, marginBottom: 5 },
    }),
    block('nfc', {
      id: 'b-nfc',
      text: '轻触 NFC 或扫码，收听主题曲与纪录短片',
      style: { ...defaultStyle('nfc'), size: 9, color: '#3a3a3a', marginBottom: 2 },
    }),
    block('caption', {
      id: 'b-nfc-note',
      text: '（演示地址，正式印刷前请替换为实际发布地址）',
      style: { ...defaultStyle('caption'), size: 7.5, color: '#b26a00' },
    }),
    block('footer', {
      id: 'b-back-footer',
      text: 'rivertype.press',
      style: { ...defaultStyle('footer'), size: 7.5, color: '#6f6a62', letterSpacing: 0.2, font: 'sans' },
    }),
  ];

  project.pages = [
    { id: FRONT, label: '正面（封面）', side: 'front', background: '#ffffff', blocks: front },
    { id: BACK, label: '背面（文字 + NFC）', side: 'back', background: '#fbf9f5', blocks: back },
  ];

  return project;
}

export function emptyStarter(): StudioProject {
  const project = emptyProject({ title: '未命名', issue: '第一号' });
  project.pages[0].blocks = [
    block('title', { id: makeId('b'), text: '书名' }),
    block('body', { id: makeId('b'), text: '在这里写正文。支持 Markdown：**加粗**、*斜体*、引用与列表。' }),
  ];
  project.pages[1].blocks = [
    block('header', { id: makeId('b'), text: '页眉' }),
    block('body', { id: makeId('b'), text: '' }),
    block('footer', { id: makeId('b'), text: '页脚' }),
  ];
  return project;
}
