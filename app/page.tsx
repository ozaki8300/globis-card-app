"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Area = "left" | "center" | "right";

type ParsedCard = {
  id: string;
  area: Area;
  title: string;
  lines: string[];
  source: "raw";
  visualGroup: number;
  rawH3Index: number;
  areaBlockIndex: number;
};

type AddedCard = {
  id: string;
  area: Area;
  title: string;
  lines: string[];
  source: "added";
  visualGroup?: number;
};

type Card = ParsedCard | AddedCard;

type OneColumnSection = {
  id: string;
  title: string;
  lines: string[];
  position: "top" | "bottom";
  visualGroup: number;
};

type TextPanelFocusItem = {
  id: "td-memo" | "td-output";
  title: string;
  lines: string[];
  focusKind: "memo" | "output";
  focusLabel: string;
};

type FocusItem =
  | (Card & { focusKind: "card"; focusLabel: string })
  | (OneColumnSection & { focusKind: "section"; focusLabel: string })
  | TextPanelFocusItem;

type DeckState = {
  raw: string;
  memo: string;
  output: string;
  addedCards: AddedCard[];
  starred: string[];
};

type ParsedDeck = {
  title: string;
  topSections: OneColumnSection[];
  cards: ParsedCard[];
  bottomSections: OneColumnSection[];
};

const STORAGE_KEY = "thoughtdeck:data:v9";
const LEGACY_STORAGE_KEYS = ["thoughtdeck:v8", "thoughtdeck:v7", "thoughtdeck:v6"];
const RESOURCES_STORAGE_KEY = "thoughtdeck:resources:v1";
const LEGACY_CUSTOM_LINKS_STORAGE_KEY = "thoughtdeck:custom-links:v1";
const MAX_URL_LENGTH = 3000;
const THOUGHTDECK_HOME_URL = "https://thought-deck.vercel.app/";

const defaultQuickLinks = [
  { label: "ThoughtDeck", url: "https://thought-deck.vercel.app/" },
  { label: "GLOBIS VC", url: "https://vc.globis.ac.jp/wam/auth/login" },
] as const;

type ResourceTemplate = { id: string; title: string; content: string };
type ResourceState = { links: { label: string; url: string }[]; templates: ResourceTemplate[] };
type ThemeMode = "auto" | "light" | "dark";
const THEME_STORAGE_KEY = "thoughtdeck:theme:v1";
const themeLabel = (mode: ThemeMode) => mode === "auto" ? "自動" : mode === "light" ? "ライト" : "ダーク";
const nextThemeMode = (mode: ThemeMode): ThemeMode => mode === "auto" ? "light" : mode === "light" ? "dark" : "auto";

const placeholderSets = [
  {
    label: "発散",
    left: "何が起きている？",
    center: "どう考える？",
    right: "何が論点？",
  },
  {
    label: "再構造化",
    left: "どう見える？",
    center: "なぜそう思う？",
    right: "どこで使える？",
  },
  {
    label: "自由",
    left: "",
    center: "",
    right: "",
  },
] as const;

const blankRaw = `# タイトル

## 設問
- 

### 見出し
@area: left
-

### 見出し
@area: center
- 

### 見出し
@area: right
- 

## まとめ
- `;

const demoRaw = `# ファイナンス Day2 事業戦略と企業財務

## issue
NPVがマイナスでも投資する意思決定とは何か

### 業界の前提
@area: left
- 2012年当時の液晶業界は「大型化・設備投資・シェア獲得」で勝つという発想が主流
- 多くの企業は「良い工場を持てば勝てる」と考えていた

### 見方の違い
@area: center
- 同じ投資でも、単体の採算だけでなく、支配構造や将来の交渉力で意味が変わる
- 郭台銘氏は工場単体ではなく、サプライチェーン全体の中での価値を見ていた

### 判断軸
@area: right
- NPVだけでなく、不確実性・オプション価値・サプライチェーン支配を見る
- 数値ではなく、どの前提に賭けるかが重要になる

## まとめ
投資判断は、数値だけでなく、どの前提に賭けるのか、どの構造を取りにいくのかを含む意思決定である。`;

const demoOutput = `Day2では、NPVやIRRといった定量指標の重要性を再認識するとともに、それだけでは意思決定を説明できないケースについて深く考えさせられた。

特に印象的だったのは、シャープの投資判断である。NPVがマイナスであっても実行された背景には、「生存のための投資」という側面があり、単なる財務合理性では説明できない意思決定であった。

一方で、郭台銘氏の視点は、工場単体ではなくサプライチェーン全体の中で価値を捉えるものであり、同じ資産でも組み合わせによって価値が変わることを示していた。

本ケースを通じて、投資判断とは数値評価だけでなく、どの前提に賭けるのか、どの構造を取りにいくのかを含めた意思決定であると学んだ。`;

function encodeDeck(deck: DeckState) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(deck))));
}

function decodeDeck(value: string): DeckState | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(value))));
  } catch {
    return null;
  }
}

function getTitle(raw: string) {
  const line = raw
    .split("\n")
    .find(
      (l) => /^#[ \t\u3000]+/.test(l.trimEnd()) && !/^##/.test(l.trimStart()),
    );
  return line?.replace(/^#[ \t\u3000]+/, "").trim() || "タイトル未設定";
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function getTimestampSlug(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`;
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[\/:*?"<>|#^[\]]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function getObsidianTitle(title: string, timestamp: string) {
  const safeTitle = sanitizeFileName(title);
  if (!safeTitle || safeTitle === "タイトル" || safeTitle === "タイトル未設定")
    return timestamp;
  return `${timestamp}_${safeTitle}`;
}

function isH1(line: string) {
  return /^#[ \t\u3000]+/.test(line.trimEnd()) && !/^##/.test(line.trimStart());
}

function isH2(line: string) {
  return (
    /^##[ \t\u3000]+/.test(line.trimEnd()) &&
    !/^###[ \t\u3000]+/.test(line.trimEnd())
  );
}

function isH3(line: string) {
  return /^###[ \t\u3000]+/.test(line.trimEnd());
}

function normalizeDisplayLines(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function areaFromLine(line?: string): Area {
  const rawArea = line?.replace(/^@area:/, "").trim();
  return rawArea === "left" || rawArea === "center" || rawArea === "right"
    ? rawArea
    : "center";
}

function parseDeck(raw: string): ParsedDeck {
  const lines = raw.split("\n");
  const title = getTitle(raw);
  const topSections: OneColumnSection[] = [];
  const bottomSections: OneColumnSection[] = [];
  const cards: ParsedCard[] = [];

  let currentSection: OneColumnSection | null = null;
  let currentCard: ParsedCard | null = null;
  let hasSeenCard = false;
  let visualGroup = 0;
  let h3Index = -1;
  let areaBlockIndex = 0;
  let currentCardTitle = "見出し";

  const flushSection = () => {
    if (!currentSection) return;
    currentSection.lines = normalizeDisplayLines(currentSection.lines);
    if (currentSection.position === "top") topSections.push(currentSection);
    else bottomSections.push(currentSection);
    currentSection = null;
  };

  const flushCard = () => {
    if (!currentCard) return;
    currentCard.lines = normalizeDisplayLines(currentCard.lines).filter(
      (line) => !line.startsWith("@area:"),
    );
    cards.push(currentCard);
    currentCard = null;
  };

  const hasCardBody = (card: ParsedCard | null) =>
    Boolean(card && card.lines.some((line) => line.trim().length > 0));

  const createRawCard = (area: Area = "center"): ParsedCard => ({
    id: `raw-${h3Index}-${areaBlockIndex}-${currentCardTitle}`,
    source: "raw",
    area,
    title: currentCardTitle,
    lines: [],
    visualGroup,
    rawH3Index: h3Index,
    areaBlockIndex,
  });

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "---") {
      flushCard();
      flushSection();
      visualGroup += 1;
      continue;
    }

    if (isH1(line)) {
      flushCard();
      flushSection();
      continue;
    }

    if (isH2(line)) {
      flushCard();
      flushSection();
      const position: "top" | "bottom" = hasSeenCard ? "bottom" : "top";
      currentSection = {
        id: `${position}-${position === "top" ? topSections.length : bottomSections.length}-${trimmed}`,
        title: trimmed.replace(/^##[ \t\u3000]*/, "").trim() || "セクション",
        lines: [],
        position,
        visualGroup,
      };
      continue;
    }

    if (isH3(line)) {
      flushSection();
      flushCard();
      hasSeenCard = true;
      h3Index += 1;
      areaBlockIndex = 0;
      currentCardTitle = trimmed.replace(/^###[ \t\u3000]*/, "").trim() || "見出し";
      currentCard = createRawCard("center");
      continue;
    }

    if (currentCard) {
      if (trimmed.startsWith("@area:")) {
        const nextArea = areaFromLine(trimmed);

        // 1つの「### 見出し」の中に @area が複数ある場合は、
        // @area ごとにカードを分割する。
        // これにより、見出しは同じまま left / center / right に自然に展開できる。
        if (hasCardBody(currentCard)) {
          flushCard();
          areaBlockIndex += 1;
          currentCard = createRawCard(nextArea);
        } else {
          currentCard.area = nextArea;
        }
        continue;
      }

      currentCard.lines.push(line);
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  flushCard();
  flushSection();

  return { title, topSections, cards, bottomSections };
}

function firstH3Index(raw: string) {
  return raw.search(/^###[ \t\u3000]+/m);
}

function firstBottomSectionIndex(raw: string) {
  const h3Index = firstH3Index(raw);
  if (h3Index < 0) return -1;
  const rest = raw.slice(h3Index);
  const match = rest.match(/^##[ \t\u3000]+/m);
  return match?.index === undefined ? -1 : h3Index + match.index;
}

function insertBlock(raw: string, index: number, template: string) {
  if (index >= 0) {
    return `${raw.slice(0, index).trimEnd()}\n\n${template}\n\n${raw.slice(index).trimStart()}`;
  }
  return `${raw.trimEnd()}\n\n${template}`;
}

function insertTopSectionTemplate(raw: string) {
  const h3Index = firstH3Index(raw);
  const template = `## 設問\n- `;
  return insertBlock(raw, h3Index, template);
}

function insertCardTemplate(raw: string, area: Area) {
  const bottomIndex = firstBottomSectionIndex(raw);
  const template = `### 見出し\n@area: ${area}\n- `;
  return insertBlock(raw, bottomIndex, template);
}

function insertBottomSectionTemplate(raw: string) {
  return `${raw.trimEnd()}\n\n## まとめ\n- `;
}

function rawCardLocatorFromId(id: string) {
  const match = id.match(/^raw-(\d+)-(\d+)-/);
  if (!match) return null;
  return {
    h3Index: Number(match[1]),
    areaBlockIndex: Number(match[2]),
  };
}

function changeRawCardArea(raw: string, cardId: string, nextArea: Area) {
  const locator = rawCardLocatorFromId(cardId);
  if (!locator) return raw;

  const lines = raw.split("\n");
  let currentH3Index = -1;
  let h3LineIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (isH3(lines[i])) {
      currentH3Index += 1;
      if (currentH3Index === locator.h3Index) {
        h3LineIndex = i;
        break;
      }
    }
  }

  if (h3LineIndex < 0) return raw;

  let blockEnd = lines.length;
  for (let i = h3LineIndex + 1; i < lines.length; i += 1) {
    if (isH1(lines[i]) || isH2(lines[i]) || isH3(lines[i]) || lines[i].trim() === "---") {
      blockEnd = i;
      break;
    }
  }

  const areaLineIndexes: number[] = [];
  for (let i = h3LineIndex + 1; i < blockEnd; i += 1) {
    if (lines[i].trim().startsWith("@area:")) areaLineIndexes.push(i);
  }

  const targetAreaLineIndex = areaLineIndexes[locator.areaBlockIndex];

  if (targetAreaLineIndex !== undefined) {
    lines[targetAreaLineIndex] = `@area: ${nextArea}`;
  } else {
    lines.splice(h3LineIndex + 1, 0, `@area: ${nextArea}`);
  }

  return lines.join("\n");
}

function normalizeConclusionLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("-") ? `  ${trimmed}` : `  - ${trimmed}`;
}

function appendCardToConclusion(raw: string, card: Card) {
  const cardLines = [
    `- ${card.title || "選択カード"}`,
    ...card.lines.map(normalizeConclusionLine).filter(Boolean),
  ].join("\n");

  const summaryMatch = raw.match(/^##[ \t\u3000]+まとめ\s*$/m);

  if (!summaryMatch || summaryMatch.index === undefined) {
    return `${raw.trimEnd()}\n\n## まとめ\n${cardLines}\n`;
  }

  const insertAt = summaryMatch.index + summaryMatch[0].length;
  const before = raw.slice(0, insertAt);
  const after = raw.slice(insertAt);
  const needsNewLine = after.startsWith("\n") ? "" : "\n";
  return `${before}${needsNewLine}\n${cardLines}${after}`;
}

function renderInline(text: string) {
  const parts = text.split(/(==.*?==|=[^=].*?=|\*\*.*?\*\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith("==") && part.endsWith("==")) {
      return (
        <mark
          key={i}
          className="rounded-[3px] bg-[var(--td-mark-bg)] px-[3px] text-[var(--td-text)]"
        >
          {part.slice(2, -2)}
        </mark>
      );
    }

    if (part.startsWith("=") && part.endsWith("=") && part.length > 2) {
      return (
        <mark
          key={i}
          className="rounded-[3px] bg-[var(--td-mark-bg)] px-[3px] text-[var(--td-text)]"
        >
          {part.slice(1, -1)}
        </mark>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-[var(--td-accent)]">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={i}>{part}</span>;
  });
}

function stripListMarker(line: string) {
  return line.replace(/^\s*[-*+]\s+/, "");
}

function renderMarkdownBlocks(text: string, emptyText = "本文はInput欄に入力してください。") {
  const sourceLines = text.split("\n");
  const elements = [];
  let i = 0;
  let key = 0;

  const nextKey = () => `md-${key++}`;

  while (i < sourceLines.length) {
    const line = sourceLines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      elements.push(<hr key={nextKey()} className="my-3 border-[var(--td-border)]" />);
      i += 1;
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) {
      elements.push(
        <h3 key={nextKey()} className="mt-3 text-[12pt] font-bold text-[var(--td-accent)]">
          {renderInline(h3[1])}
        </h3>,
      );
      i += 1;
      continue;
    }

    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      elements.push(
        <h2 key={nextKey()} className="mt-4 text-[13pt] font-bold text-[var(--td-accent)]">
          {renderInline(h2[1])}
        </h2>,
      );
      i += 1;
      continue;
    }

    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1) {
      elements.push(
        <h1 key={nextKey()} className="mt-4 text-[15pt] font-bold text-[var(--td-accent)]">
          {renderInline(h1[1])}
        </h1>,
      );
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (i < sourceLines.length && /^>\s?/.test(sourceLines[i].trim())) {
        quoteLines.push(sourceLines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      elements.push(
        <blockquote key={nextKey()} className="my-2 border-l-2 border-[var(--td-accent-border)] pl-3 text-[var(--td-text-soft)]">
          {quoteLines.map((quote, idx) => (
            <p key={idx}>{renderInline(quote)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < sourceLines.length && /^\s*[-*+]\s+/.test(sourceLines[i])) {
        items.push(stripListMarker(sourceLines[i]));
        i += 1;
      }
      elements.push(
        <ul key={nextKey()} className="my-1 list-disc space-y-0.5 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const paragraph = [];
    while (
      i < sourceLines.length &&
      sourceLines[i].trim() &&
      !/^\s*[-*+]\s+/.test(sourceLines[i]) &&
      !/^>\s?/.test(sourceLines[i].trim()) &&
      !/^#{1,3}\s+/.test(sourceLines[i].trim()) &&
      !/^---+$/.test(sourceLines[i].trim())
    ) {
      paragraph.push(sourceLines[i].trim());
      i += 1;
    }

    elements.push(
      <p key={nextKey()} className="whitespace-pre-wrap">
        {renderInline(paragraph.join("\n"))}
      </p>,
    );
  }

  if (elements.length === 0) {
    return <p className="text-[var(--td-muted)]">{emptyText}</p>;
  }

  return <div className="space-y-1 break-words">{elements}</div>;
}

type ThoughtDeckIdKind = "note" | "group" | "card" | "memo";

const ID_PREFIX_BY_KIND: Record<ThoughtDeckIdKind, string> = {
  note: "td_n",
  group: "td_g",
  card: "td_c",
  memo: "td_m",
};

function normalizeUuid(rawId: string) {
  return rawId.replace(/-/g, "");
}

function generatePortableId(kind: ThoughtDeckIdKind) {
  const prefix = ID_PREFIX_BY_KIND[kind];

  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${normalizeUuid(crypto.randomUUID())}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

type ObsidianExportIds = {
  noteId: string;
  groupId: string;
};

function buildObsidianMetaLines(
  ids: ObsidianExportIds,
  item: { type: "question" | "card" | "summary"; area?: Area },
) {
  const areaLine = item.area ? `<!-- @area: ${item.area} -->\n` : "";

  return `<!-- @card_id: ${generatePortableId("card")} -->\n<!-- @note_id: ${ids.noteId} -->\n<!-- @group_id: ${ids.groupId} -->\n<!-- @type: ${item.type} -->\n${areaLine}`;
}

function injectPortableIdsForObsidian(markdown: string, ids: ObsidianExportIds) {
  const lines = markdown.split("\n");
  const result: string[] = [];
  let pendingCardHeading = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^##\s*設問/.test(trimmed)) {
      result.push(line);
      result.push(buildObsidianMetaLines(ids, { type: "question" }).trimEnd());
      continue;
    }

    if (/^##\s*まとめ/.test(trimmed)) {
      result.push(line);
      result.push(buildObsidianMetaLines(ids, { type: "summary" }).trimEnd());
      continue;
    }

    if (/^###\s+/.test(trimmed)) {
      pendingCardHeading = true;
      result.push(line);
      continue;
    }

    const areaMatch = trimmed.match(/^@area:\s*(left|center|right)\s*$/);
    if (areaMatch && pendingCardHeading) {
      result.push(
        buildObsidianMetaLines(ids, {
          type: "card",
          area: areaMatch[1] as Area,
        }).trimEnd(),
      );
      pendingCardHeading = false;
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}

function addedCardToMarkdown(
  card: AddedCard,
  options?: { ids?: ObsidianExportIds; withPortableIds?: boolean },
) {
  const metaLines =
    options?.withPortableIds && options.ids
      ? buildObsidianMetaLines(options.ids, { type: "card", area: card.area })
      : `@area: ${card.area}\n`;

  return `### ${card.title || "見出し"}\n${metaLines}${card.lines.length ? card.lines.join("\n") : "- "}`;
}

function buildExportMarkdown(
  raw: string,
  addedCards: AddedCard[],
  memo: string,
  output = "",
  includeFooter = true,
  withPortableIds = false,
  ids?: ObsidianExportIds,
) {
  const activeIds =
    ids ??
    (withPortableIds
      ? {
          noteId: generatePortableId("note"),
          groupId: generatePortableId("group"),
        }
      : undefined);

  const noteMeta =
    withPortableIds && activeIds
      ? `<!-- @note_id: ${activeIds.noteId} -->\n<!-- @group_id: ${activeIds.groupId} -->\n<!-- #${activeIds.groupId} -->\n\n`
      : "";

  const added =
    addedCards.length > 0
      ? [
          "",
          "---",
          "",
          "## 授業中に追加したカード",
          "",
          ...addedCards.map((card) =>
            addedCardToMarkdown(card, {
              ids: activeIds,
              withPortableIds,
            }),
          ),
        ].join("\n")
      : "";

  const footer = includeFooter
    ? `\n\n---\n\n作成元: ThoughtDeck\n保存日時: ${new Date().toLocaleString("ja-JP")}\n`
    : "";

  const sourceMarkdown =
    withPortableIds && activeIds
      ? injectPortableIdsForObsidian(raw.trimEnd(), activeIds)
      : raw.trimEnd();

  const memoMeta =
    withPortableIds && activeIds
      ? `<!-- @memo_id: ${generatePortableId("memo")} -->\n<!-- @note_id: ${activeIds.noteId} -->\n<!-- @group_id: ${activeIds.groupId} -->\n<!-- @type: memo -->\n\n`
      : "";

  const outputSection = output.trim()
    ? `\n\n---\n\n## 投稿文\n${output.trim()}`
    : "";

  return `${noteMeta}${sourceMarkdown}${added}\n\n---\n\n## メモ\n${memoMeta}${memo.trim() || "（メモなし）"}${outputSection}${footer}`;
}

function buildRestoreUrl(
  raw: string,
  memo: string,
  output: string,
  addedCards: AddedCard[],
  starred: string[],
) {
  if (typeof window === "undefined") return "";
  const base = `${window.location.origin}${window.location.pathname}`;
  const deck: DeckState = { raw, memo, output, addedCards, starred };
  return `${base}?d=${encodeURIComponent(encodeDeck(deck))}`;
}

function formatObsidianTimestamp(date = new Date()) {
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function buildObsidianMarkdown(
  raw: string,
  addedCards: AddedCard[],
  memo: string,
  output: string,
  starred: string[],
) {
  const restoreUrl = buildRestoreUrl(raw, memo, output, addedCards, starred);
  const title = getTitle(raw);
  const ids: ObsidianExportIds = {
    noteId: generatePortableId("note"),
    groupId: generatePortableId("group"),
  };
  const body = buildExportMarkdown(raw, addedCards, memo, output, false, true, ids).trimEnd();

  const frontmatter = `---\nthoughtdeck_note_id: ${ids.noteId}\nthoughtdeck_group_id: ${ids.groupId}\ntags:\n  - thoughtdeck\n  - ${ids.groupId}\n---`;

  return `${frontmatter}\n\n[${title}](${restoreUrl})\n\n${body}\n\n---\n\n作成元: ThoughtDeck\n保存日時: ${formatObsidianTimestamp()}\n[thought-deck](${THOUGHTDECK_HOME_URL})\n`;
}

export default function Home() {
  const [raw, setRaw] = useState(blankRaw);
  const [memo, setMemo] = useState("");
  const [output, setOutput] = useState("");
  const [addedCards, setAddedCards] = useState<AddedCard[]>([]);
  const [starred, setStarred] = useState<string[]>([]);

  const [saveStatus, setSaveStatus] = useState("保存済");
  const [copyStatus, setCopyStatus] = useState("");
  const [obsidianToast, setObsidianToast] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [expandedEditor, setExpandedEditor] = useState<"input" | "memo" | "output" | null>(
    null,
  );
  const [shortcutHint, setShortcutHint] = useState("");
  const [perspectiveIndex, setPerspectiveIndex] = useState(1);

  const perspective = placeholderSets[perspectiveIndex];

  const openOutputComposer = () => {
    setSelectedCardId("td-output");
    setFocusMode(false);
    setExpandedEditor("output");
  };

  const openMemoEditor = () => {
    setSelectedCardId("td-memo");
    setFocusMode(false);
    setExpandedEditor("memo");
  };

  const baseCardClass =
    "border-[var(--td-card-border)] bg-[var(--td-card-bg)] text-[var(--td-text)] hover:border-[var(--td-card-border-hover)] hover:bg-[var(--td-hover)]";

  const selectedThoughtClass =
    "border-[var(--td-accent-border)] bg-[var(--td-accent-bg)] shadow-[inset_3px_0_0_var(--td-accent-shadow)]";

  const mutedQuestionClass = "text-[10.5pt] leading-none text-[var(--td-muted)]";

  const changePerspective = () => {
    setPerspectiveIndex((prev) => (prev + 1) % placeholderSets.length);
  };

  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [openTopMenu, setOpenTopMenu] = useState<"display" | "export" | "resources" | "theme" | null>(null);
  const topMenuRef = useRef<HTMLDivElement | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>("auto");
  const [customLinks, setCustomLinks] = useState<{ label: string; url: string }[]>([]);
  const [customLinkLabel, setCustomLinkLabel] = useState("");
  const [customLinkUrl, setCustomLinkUrl] = useState("");
  const [templates, setTemplates] = useState<ResourceTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("free");
  const [templateInstruction, setTemplateInstruction] = useState("");
  const [templateIncludeInput, setTemplateIncludeInput] = useState(true);
  const [templateIncludeMemo, setTemplateIncludeMemo] = useState(false);
  const [templateIncludeOutput, setTemplateIncludeOutput] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [newTemplateContent, setNewTemplateContent] = useState("");
  const [leftWidth, setLeftWidth] = useState(350);
  const [rightWidth, setRightWidth] = useState(390);
  const [draggingLeft, setDraggingLeft] = useState(false);
  const [draggingRight, setDraggingRight] = useState(false);

  const parsedDeck = useMemo(() => parseDeck(raw), [raw]);
  const { title, topSections, bottomSections } = parsedDeck;
  const parsedCards = parsedDeck.cards;
  const allCards = useMemo<Card[]>(
    () => [...parsedCards, ...addedCards],
    [parsedCards, addedCards],
  );
  const focusItems = useMemo<FocusItem[]>(() => {
    const cardLabel = (area: Area) =>
      area === "left" ? "事実" : area === "center" ? "解釈" : "論点";

    return [
      ...topSections.map((section) => ({
        ...section,
        focusKind: "section" as const,
        focusLabel: "設問",
      })),
      ...allCards.map((card) => ({
        ...card,
        focusKind: "card" as const,
        focusLabel: cardLabel(card.area),
      })),
      ...bottomSections.map((section) => ({
        ...section,
        focusKind: "section" as const,
        focusLabel: "結論",
      })),
    ];
  }, [topSections, allCards, bottomSections]);

  const allQuickLinks = useMemo(
    () => [...defaultQuickLinks, ...customLinks],
    [customLinks],
  );

  const addCustomLink = () => {
    const label = customLinkLabel.trim();
    let url = customLinkUrl.trim();
    if (!label || !url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setCustomLinks((prev) => [...prev, { label, url }]);
    setCustomLinkLabel("");
    setCustomLinkUrl("");
    showShortcutHint("追加リンクしました");
  };

  const removeCustomLink = (index: number) => {
    setCustomLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const addTemplate = () => {
    const title = newTemplateTitle.trim();
    const content = newTemplateContent.trim();
    if (!title || !content) return;
    const id = `tpl-${Date.now()}`;
    setTemplates((prev) => [...prev, { id, title, content }]);
    setSelectedTemplateId(id);
    setNewTemplateTitle("");
    setNewTemplateContent("");
    showShortcutHint("テンプレを追加しました");
  };

  const removeTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((template) => template.id !== id));
    if (selectedTemplateId === id) setSelectedTemplateId("free");
  };

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null;

  const cardBlocks = useMemo(() => {
    const blockMap = new Map<number, Card[]>();

    allCards.forEach((card) => {
      const blockKey = card.visualGroup ?? 0;
      const existing = blockMap.get(blockKey) ?? [];
      existing.push(card);
      blockMap.set(blockKey, existing);
    });

    return Array.from(blockMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([visualGroup, cards]) => ({
        visualGroup,
        left: cards.filter((card) => card.area === "left"),
        center: cards.filter((card) => card.area === "center"),
        right: cards.filter((card) => card.area === "right"),
      }));
  }, [allCards]);
  const selectedCard =
    allCards.find((card) => card.id === selectedCardId) || null;
  const selectedFocusItem =
    focusItems.find((item) => item.id === selectedCardId) || null;

  const showShortcutHint = (message: string) => {
    setShortcutHint(message);
    window.setTimeout(() => setShortcutHint(""), 1200);
  };

  const moveCardToArea = (cardId: string | null, nextArea: Area) => {
    if (!cardId) return;

    const target = allCards.find((card) => card.id === cardId);
    if (!target) return;

    if (target.source === "raw") {
      setRaw((prev) => changeRawCardArea(prev, cardId, nextArea));
    } else {
      setAddedCards((prev) =>
        prev.map((card) =>
          card.id === cardId ? { ...card, area: nextArea } : card,
        ),
      );
    }

    setSelectedCardId(cardId);
    showShortcutHint(`${target.title} → ${nextArea}`);
  };

  const selectSiblingCard = (direction: 1 | -1) => {
    if (allCards.length === 0) return;

    const currentIndex = selectedCardId
      ? allCards.findIndex((card) => card.id === selectedCardId)
      : -1;
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + direction + allCards.length) % allCards.length;

    setSelectedCardId(allCards[nextIndex].id);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("d");

    if (d) {
      const decoded = decodeDeck(d);
      if (decoded) {
        setRaw(decoded.raw || blankRaw);
        setMemo(decoded.memo || "");
        setOutput(decoded.output || "");
        setAddedCards(decoded.addedCards || []);
        setStarred(decoded.starred || []);
        setShowLeft(false);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(decoded));
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
    }

    const saved = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    if (saved) {
      try {
        const deck = JSON.parse(saved) as DeckState;
        setRaw(deck.raw || blankRaw);
        setMemo(deck.memo || "");
        setOutput(deck.output || "");
        setAddedCards(deck.addedCards || []);
        setStarred(deck.starred || []);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    try {
      const savedResources = localStorage.getItem(RESOURCES_STORAGE_KEY);
      if (savedResources) {
        const resources = JSON.parse(savedResources) as ResourceState;
        setCustomLinks(resources.links || []);
        setTemplates(resources.templates || []);
        return;
      }

      const legacyLinks = localStorage.getItem(LEGACY_CUSTOM_LINKS_STORAGE_KEY);
      if (legacyLinks) setCustomLinks(JSON.parse(legacyLinks));
    } catch {
      localStorage.removeItem(RESOURCES_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
      if (savedTheme === "auto" || savedTheme === "light" || savedTheme === "dark") {
        setThemeMode(savedTheme);
      }
    } catch {
      localStorage.removeItem(THEME_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    localStorage.setItem(
      RESOURCES_STORAGE_KEY,
      JSON.stringify({ links: customLinks, templates }),
    );
  }, [customLinks, templates]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!openTopMenu) return;
      const target = event.target as Node;
      if (topMenuRef.current && !topMenuRef.current.contains(target)) {
        setOpenTopMenu(null);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [openTopMenu]);

  useEffect(() => {
    setSaveStatus("保存中");
    const timer = window.setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ raw, memo, output, addedCards, starred }),
      );
      setSaveStatus("保存済");
    }, 300);
    return () => window.clearTimeout(timer);
  }, [raw, memo, output, addedCards, starred]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isTyping =
        tagName === "textarea" ||
        tagName === "input" ||
        tagName === "select" ||
        target?.isContentEditable;

      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "1") {
        event.preventDefault();
        moveCardToArea(selectedCardId, "left");
      }

      if (event.key === "2") {
        event.preventDefault();
        moveCardToArea(selectedCardId, "center");
      }

      if (event.key === "3") {
        event.preventDefault();
        moveCardToArea(selectedCardId, "right");
      }

      if (event.key.toLowerCase() === "s" && selectedCard) {
        event.preventDefault();
        toggleStar(selectedCard.id);
        showShortcutHint("★ 重要マークを切り替えました");
      }

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        selectSiblingCard(1);
      }

      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        selectSiblingCard(-1);
      }

      if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        setExpandedEditor("input");
        showShortcutHint("Inputを編集します");
        return;
      }

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        openMemoEditor();
        showShortcutHint("メモを編集します");
        return;
      }

      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        openOutputComposer();
        showShortcutHint("投稿文を編集します");
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFocusMode(true);
        showShortcutHint("思考エリアをフォーカス表示します");
        return;
      }

      if (event.key === "Escape") {
        if (expandedEditor) setExpandedEditor(null);
        else if (focusMode) setFocusMode(false);
        else if (showShortcutHelp) setShowShortcutHelp(false);
        else if (showTemplatePanel) setShowTemplatePanel(false);
        else if (openTopMenu) setOpenTopMenu(null);
        else setSelectedCardId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedCardId,
    selectedCard,
    selectedFocusItem,
    allCards,
    focusMode,
    expandedEditor,
    showShortcutHelp,
    showTemplatePanel,
    openTopMenu,
  ]);

  useEffect(() => {
    if (!draggingLeft) return;
    const onMove = (e: MouseEvent) =>
      setLeftWidth(Math.min(Math.max(e.clientX, 260), 680));
    const onUp = () => setDraggingLeft(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingLeft]);

  useEffect(() => {
    if (!draggingRight) return;
    const onMove = (e: MouseEvent) =>
      setRightWidth(
        Math.min(Math.max(window.innerWidth - e.clientX, 260), 680),
      );
    const onUp = () => setDraggingRight(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingRight]);

  const createShare = async () => {
    const base = `${window.location.origin}${window.location.pathname}`;
    const deck: DeckState = { raw, memo, output, addedCards, starred };
    const url = `${base}?d=${encodeURIComponent(encodeDeck(deck))}`;
    setShareUrl(url);
    if (url.length > MAX_URL_LENGTH) {
      setQrError(
        `共有URLが長すぎます（${url.length}文字）。URLコピーは可能ですが、QR表示には向きません。`,
      );
    } else {
      setQrError("");
    }
    setShowQr(true);
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
  };

  const downloadMd = () => {
    const md = buildExportMarkdown(raw, addedCards, memo, output);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${new Date().toISOString().slice(0, 10)}_${title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyMd = async () => {
    await navigator.clipboard.writeText(
      buildExportMarkdown(raw, addedCards, memo, output),
    );
    setCopyStatus("MDコピー済");
    window.setTimeout(() => setCopyStatus(""), 1800);
  };

  const saveToObsidian = () => {
    const md = buildObsidianMarkdown(raw, addedCards, memo, output, starred);
    const timestamp = getTimestampSlug();
    const fileTitle = getObsidianTitle(title, timestamp);
    const filePath = `ThoughtDeck/${fileTitle}`;
    const url = `obsidian://new?file=${encodeURIComponent(filePath)}&content=${encodeURIComponent(md)}&append=true`;
    setObsidianToast(`Obsidianに保存しました：${fileTitle}`);
    window.setTimeout(() => setObsidianToast(""), 2200);
    window.location.href = url;
  };

  const clearAll = () => {
    if (!confirm("全ての内容をまっさらにしますか？")) return;
    setRaw(blankRaw);
    setMemo("");
    setOutput("");
    setAddedCards([]);
    setStarred([]);
    setShareUrl("");
    setQrError("");
    setShowQr(false);
    setSelectedCardId(null);
    setFocusMode(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  const loadDemo = () => {
    setRaw(demoRaw);
    setMemo("");
    setOutput(demoOutput);
    setAddedCards([]);
    setStarred([]);
    setShareUrl("");
    setQrError("");
    setShowQr(false);
    setSelectedCardId(null);
    setFocusMode(false);
    setShowLeft(false);
  };

  const confirmLoadDemo = () => {
    const ok = window.confirm(
      "現在のInput・メモ・投稿文がデモ内容で上書きされます。よろしいですか？",
    );

    if (!ok) return;

    loadDemo();
  };

  const insertTemplate = (kind: "top" | Area | "bottom") => {
    setRaw((prev) => {
      if (kind === "top") return insertTopSectionTemplate(prev);
      if (kind === "bottom") return insertBottomSectionTemplate(prev);
      return insertCardTemplate(prev, kind);
    });
    setShowLeft(true);
  };

  const toggleStar = (id: string) => {
    setStarred((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const renderOneColumnSection = (section: OneColumnSection) => {
    const isSelected = selectedCardId === section.id;

    return (
      <section
        key={section.id}
        onClick={() => setSelectedCardId(section.id)}
        className={`cursor-pointer rounded-xl border p-4 transition ${
          isSelected ? selectedThoughtClass : baseCardClass
        }`}
      >
        <h3 className="mb-1 text-[12pt] font-bold text-[var(--td-accent)]">
          {section.title}
        </h3>
        <div className="text-[11pt] leading-5 text-[var(--td-text)]">
          {renderMarkdownBlocks(section.lines.join("\n"))}
        </div>
      </section>
    );
  };

  const renderCard = (card: Card, isCenter = false) => {
    const isSelected = selectedCardId === card.id;

    return (
      <div
        key={card.id}
        onClick={() => setSelectedCardId(card.id)}
        className={`cursor-pointer rounded-xl border px-2 py-3 transition ${
          isSelected
            ? selectedThoughtClass
            : baseCardClass
        }`}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="w-full text-[12pt] font-bold text-[var(--td-accent)]">
            {card.title}
          </h3>
          <button
            onClick={(event) => {
              event.stopPropagation();
              toggleStar(card.id);
            }}
            className="shrink-0 text-[11pt] text-[var(--td-text)] hover:text-[var(--td-text)]"
            title="重要マーク"
          >
            {starred.includes(card.id) ? "★" : "☆"}
          </button>
        </div>

        <div className="text-[11pt] leading-5 text-[var(--td-text)]">
          {renderMarkdownBlocks(card.lines.join("\n"))}
        </div>
      </div>
    );
  };

  const renderCentralFocus = () => {
    if (!focusMode) return null;

    return (
      <div
        className="fixed inset-0 z-50 bg-[var(--td-overlay)] p-4 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setFocusMode(false);
        }}
      >
        <section className="mx-auto flex h-full w-full max-w-7xl flex-col rounded-2xl border border-[var(--td-border-strong)] bg-[var(--td-bg)] shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--td-border)] px-5 py-4">
            <div>
              <p className="text-[10.5pt] text-[var(--td-muted)]">
                フォーカス / F：開く / Esc：閉じる
              </p>
              <h2 className="text-[16pt] font-bold text-[var(--td-text)]">
                {title}
              </h2>
            </div>
            <button
              onClick={() => setFocusMode(false)}
              className="rounded-lg border border-[var(--td-border-strong)] px-4 py-2 text-[11pt] text-[var(--td-text)] transition hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-[var(--td-text)]"
            >
              閉じる
            </button>
          </div>

          <div className="no-scrollbar flex-1 overflow-auto p-6">
            <div className="mx-auto max-w-6xl">
              {topSections.length > 0 && (
                <div className="mb-6 space-y-4">
                  {topSections.map(renderOneColumnSection)}
                </div>
              )}

              <div>
                {cardBlocks.map((block, index) => renderCardBlock(block, index))}
              </div>

              {bottomSections.length > 0 && (
                <div className="mt-8 border-t border-[var(--td-border)] pt-5">
                  <div className="mb-2 px-1 text-[10.5pt] text-[var(--td-muted)]">
                    結論
                  </div>
                  <div className="space-y-4">
                    {bottomSections.map(renderOneColumnSection)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  };

  const renderColumn = (items: Card[], area?: Area) => {
    const isCenter = area === "center";

    return (
      <section className="min-h-12 space-y-3 rounded-xl transition">
        {items.map((card) => renderCard(card, isCenter))}

      </section>
    );
  };

  const renderCardBlock = (
    block: { visualGroup: number; left: Card[]; center: Card[]; right: Card[] },
    index: number,
  ) => {
    const hasCards =
      block.left.length > 0 || block.center.length > 0 || block.right.length > 0;

    if (!hasCards) return null;

    return (
      <div
        key={block.visualGroup}
        className={index === 0 ? "" : "mt-12 pt-2"}
      >
        <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-1">
          <div className="space-y-2">
            {perspective.left && (
              <p className={`${mutedQuestionClass} px-1`}>{perspective.left}</p>
            )}
            {renderColumn(block.left, "left")}
          </div>

          <div className="space-y-2">
            {perspective.center && (
              <p className={`${mutedQuestionClass} px-1`}>{perspective.center}</p>
            )}
            {renderColumn(block.center, "center")}
          </div>

          <div className="space-y-2">
            {perspective.right && (
              <p className={`${mutedQuestionClass} px-1`}>{perspective.right}</p>
            )}
            {renderColumn(block.right, "right")}
          </div>
        </div>
      </div>
    );
  };

  const renderExpandedEditor = () => {
    if (!expandedEditor) return null;

    const isInput = expandedEditor === "input";
    const isMemo = expandedEditor === "memo";
    const title = isInput
      ? "インプット編集"
      : isMemo
        ? "メモ編集"
        : "投稿文作成";
    const value = isInput ? raw : isMemo ? memo : output;
    const setValue = isInput ? setRaw : isMemo ? setMemo : setOutput;
    const placeholder = isInput
      ? "Inputを集中して書きます..."
      : isMemo
        ? "授業中の気づき・違和感・発言メモを自由に書く..."
        : "カードを見ながら、掲示板に投稿する文章を書く...";

    return (
      <div
        className="fixed inset-0 z-50 bg-[var(--td-overlay)] p-4 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setExpandedEditor(null);
        }}
      >
        <section className="mx-auto flex h-full w-full max-w-6xl flex-col rounded-2xl border border-[var(--td-border-strong)] bg-[var(--td-bg)] shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--td-border)] px-5 py-4">
            <div>
              <p className="text-[10.5pt] text-[var(--td-muted)]">
                Esc：保存して閉じる / Ctrl+Enter：保存して閉じる
              </p>
              <h2 className="text-[15pt] font-bold text-[var(--td-text)]">
                {title}
              </h2>
            </div>
            <button
              onClick={() => setExpandedEditor(null)}
              className="rounded-lg border border-[var(--td-border-strong)] px-4 py-2 text-[11pt] text-[var(--td-text)] transition hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-[var(--td-text)]"
            >
              閉じる
            </button>
          </div>

          <textarea
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setExpandedEditor(null);
              }
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                setExpandedEditor(null);
              }
            }}
            placeholder={placeholder}
            className={`no-scrollbar flex-1 resize-none bg-[var(--td-editor)] p-6 text-[var(--td-text)] outline-none ${
              isInput
                ? "font-mono text-[12pt] leading-7"
                : "text-[13pt] leading-8"
            }`}
          />

          <div className="flex items-center justify-between border-t border-[var(--td-border)] px-5 py-3 text-[10.5pt] text-[var(--td-muted)]">
            <span>
              {isInput
                ? "Inputが唯一の元データです"
                : isMemo
                  ? "授業中の気づきだけに集中できます"
                  : "閉じるとOUTPUTに反映されます"}
            </span>
            <span>文字数：{value.length}</span>
          </div>
        </section>
      </div>
    );
  };

  const renderShortcutHelp = () => {
    if (!showShortcutHelp) return null;

    const shortcuts = [
      ["F", "中央思考エリアをフォーカス"],
      ["I", "Input編集"],
      ["M", "メモ編集"],
      ["P", "投稿作成／編集"],
      ["1 / 2 / 3", "選択カードを 左 / 中 / 右 へ移動"],
      ["↑ ↓ ← →", "カード選択を移動"],
      ["S", "選択カードに★を付ける／外す"],
      ["Esc", "閉じる／保存して閉じる"],
      ["Ctrl + Enter", "保存して閉じる"],
    ];

    return (
      <div
        className="fixed inset-0 z-50 bg-[var(--td-overlay)] p-4 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowShortcutHelp(false);
        }}
      >
        <section className="mx-auto flex h-full w-full max-w-4xl flex-col rounded-2xl border border-[var(--td-border-strong)] bg-[var(--td-bg)] shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--td-border)] px-5 py-4">
            <div>
              <p className="text-[10.5pt] text-[var(--td-muted)]">使い方 / Esc：閉じる</p>
              <h2 className="text-[16pt] font-bold text-[var(--td-text)]">使い方</h2>
            </div>
            <button
              onClick={() => setShowShortcutHelp(false)}
              className="rounded-lg border border-[var(--td-border-strong)] px-4 py-2 text-[11pt] text-[var(--td-text)] transition hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-[var(--td-text)]"
            >
              閉じる
            </button>
          </div>

          <div className="no-scrollbar flex-1 overflow-auto p-6">
            <div className="mx-auto max-w-2xl space-y-3">
              <section className="rounded-2xl border border-[var(--td-border)] bg-[var(--td-surface-soft)] p-5">
                <h3 className="mb-3 text-[13pt] font-bold text-[var(--td-accent)]">デモ</h3>
                <p className="mb-4 text-[10.5pt] leading-6 text-[var(--td-muted)]">はじめて触るときは、サンプル内容を読み込んで動きを確認できます。</p>
                <button
                  onClick={() => { setShowShortcutHelp(false); confirmLoadDemo(); }}
                  className="rounded-lg border border-[var(--td-border-strong)] px-4 py-2 text-[11pt] text-[var(--td-text)] transition hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-[var(--td-text)]"
                >
                  デモを読み込む
                </button>
              </section>

              <section className="rounded-2xl border border-[var(--td-border)] bg-[var(--td-surface-soft)] p-5">
                <h3 className="mb-4 text-[13pt] font-bold text-[var(--td-accent)]">使い方</h3>
                <div className="space-y-3">
                  {shortcuts.map(([key, description]) => (
                    <div
                      key={key}
                      className="grid grid-cols-[140px_1fr] items-center gap-4 rounded-xl border border-[var(--td-border)] bg-[var(--td-surface-soft)] px-4 py-3 text-[11pt]"
                    >
                      <span className="font-mono text-[var(--td-accent)]">{key}</span>
                      <span className="text-[var(--td-text-soft)]">{description}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--td-border)] bg-[var(--td-surface-soft)] p-5">
                <h3 className="mb-4 text-[13pt] font-bold text-[var(--td-accent)]">書き方</h3>
                <div className="space-y-3 font-mono text-[11pt] leading-7 text-[var(--td-text-soft)]">
                  <p><span className="text-[var(--td-accent)]"># タイトル</span></p>
                  <p><span className="text-[var(--td-accent)]">## 上部1カラム</span><span className="text-[var(--td-muted)]">（設問・前提など）</span></p>
                  <p><span className="text-[var(--td-accent)]">### 3カラムカード見出し</span></p>
                  <p><span className="text-[var(--td-muted)]">@area: left / center / right</span></p>
                  <p><span className="text-[var(--td-accent)]">## 下部1カラム</span><span className="text-[var(--td-muted)]">（まとめ・次回アクションなど）</span></p>
                  <p><span className="rounded bg-[var(--td-mark-bg)] px-1 text-[var(--td-text)]">==強調==</span><span className="mx-2 text-[var(--td-muted)]">/</span><strong className="text-[var(--td-accent)]">**太字**</strong><span className="ml-2 text-[var(--td-muted)]">に対応</span></p>
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    );
  };

  const buildTemplateCopyText = () => {
    const sections: string[] = [];
    if (selectedTemplate?.content.trim()) sections.push(selectedTemplate.content.trim());
    if (templateInstruction.trim()) sections.push(templateInstruction.trim());

    const selectedSources: string[] = [];
    if (templateIncludeInput) selectedSources.push(`---\nInput\n---\n${raw.trim() || "（Inputなし）"}`);
    if (templateIncludeMemo) selectedSources.push(`---\nメモ\n---\n${memo.trim() || "（メモなし）"}`);
    if (templateIncludeOutput) selectedSources.push(`---\n投稿文\n---\n${output.trim() || "（投稿文なし）"}`);

    return [...sections, ...selectedSources].join("\n\n");
  };

  const copyTemplateBundle = async () => {
    const text = buildTemplateCopyText();
    await navigator.clipboard.writeText(text);
    setCopyStatus("コピーしました");
    showShortcutHint("コピーしました");
    window.setTimeout(() => setCopyStatus(""), 1200);
  };

  const renderTemplatePanel = () => {
    if (!showTemplatePanel) return null;

    return (
      <div
        className="fixed inset-0 z-50 bg-[var(--td-overlay)] p-4 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowTemplatePanel(false);
        }}
      >
        <section className="mx-auto flex h-full w-full max-w-5xl flex-col rounded-2xl border border-[var(--td-border-strong)] bg-[var(--td-bg)] shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--td-border)] px-5 py-4">
            <div>
              <p className="text-[10.5pt] text-[var(--td-muted)]">テンプレ / Esc：閉じる</p>
              <h2 className="text-[16pt] font-bold text-[var(--td-text)]">テンプレ</h2>
            </div>
            <button onClick={() => setShowTemplatePanel(false)} className="rounded-lg border border-[var(--td-border-strong)] px-4 py-2 text-[11pt] text-[var(--td-text)] transition hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-[var(--td-text)]">閉じる</button>
          </div>

          <div className="no-scrollbar grid flex-1 grid-cols-[280px_1fr] gap-0 overflow-hidden max-lg:grid-cols-1">
            <aside className="no-scrollbar overflow-auto border-r border-[var(--td-border)] p-5 max-lg:border-b max-lg:border-r-0">
              <p className="mb-2 text-[10pt] text-[var(--td-muted)]">テンプレ選択</p>
              <div className="space-y-2">
                <button onClick={() => setSelectedTemplateId("free")} className={`w-full rounded-xl border px-3 py-2 text-left text-[11pt] transition ${selectedTemplateId === "free" ? "border-[var(--td-accent-border)] bg-[var(--td-accent-bg)] text-[var(--td-accent)]" : "border-[var(--td-border)] bg-[var(--td-surface-soft)] text-[var(--td-text-soft)] hover:border-[var(--td-border-strong)]"}`}>なし（自由）</button>
                {templates.map((template) => (
                  <div key={template.id} className="flex items-center gap-2">
                    <button onClick={() => setSelectedTemplateId(template.id)} className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-left text-[11pt] transition ${selectedTemplateId === template.id ? "border-[var(--td-accent-border)] bg-[var(--td-accent-bg)] text-[var(--td-accent)]" : "border-[var(--td-border)] bg-[var(--td-surface-soft)] text-[var(--td-text-soft)] hover:border-[var(--td-border-strong)]"}`}><span className="block truncate">{template.title}</span></button>
                    <button onClick={() => removeTemplate(template.id)} className="rounded-lg border border-[var(--td-border)] px-2 py-2 text-[10pt] text-[var(--td-muted)] hover:border-red-800 hover:text-red-400" title="削除">×</button>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-t border-[var(--td-border)] pt-5">
                <p className="mb-2 text-[10pt] text-[var(--td-muted)]">テンプレ追加</p>
                <input value={newTemplateTitle} onChange={(event) => setNewTemplateTitle(event.target.value)} placeholder="タイトル" className="mb-2 w-full rounded-lg border border-[var(--td-border)] bg-[var(--td-panel)] px-3 py-2 text-[10.5pt] text-[var(--td-text)] outline-none focus:border-blue-500/50" />
                <textarea value={newTemplateContent} onChange={(event) => setNewTemplateContent(event.target.value)} placeholder="テンプレ本文" className="mb-2 min-h-[280px] w-full resize-y rounded-lg border border-[var(--td-border)] bg-[var(--td-panel)] px-3 py-2 text-[10.5pt] leading-6 text-[var(--td-text)] outline-none focus:border-blue-500/50" />
                <button onClick={addTemplate} className={`${topButtonClass} w-full`}>追加</button>
              </div>
            </aside>

            <div className="no-scrollbar overflow-auto p-6">
              <div className="space-y-5">
                <section className="rounded-2xl border border-[var(--td-border)] bg-[var(--td-surface-soft)] p-5">
                  <h3 className="mb-3 text-[13pt] font-bold text-[var(--td-accent)]">選択中テンプレ</h3>
                  {selectedTemplate ? <pre className="no-scrollbar max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--td-border)] bg-[var(--td-bg)] p-4 text-[10.5pt] leading-6 text-[var(--td-text-soft)]">{selectedTemplate.content}</pre> : <p className="rounded-xl border border-[var(--td-border)] bg-[var(--td-bg)] p-4 text-[11pt] text-[var(--td-muted)]">テンプレなし。自由記入欄とコピー対象だけで使えます。</p>}
                </section>

                <section className="rounded-2xl border border-[var(--td-border)] bg-[var(--td-surface-soft)] p-5">
                  <h3 className="mb-3 text-[13pt] font-bold text-[var(--td-accent)]">自由記入欄</h3>
                  <textarea value={templateInstruction} onChange={(event) => setTemplateInstruction(event.target.value)} placeholder="自由入力" className="h-32 w-full resize-y rounded-xl placeholder:text-neutral-600 border border-[var(--td-border)] bg-[var(--td-bg)] p-4 text-[11pt] leading-7 text-[var(--td-text)] outline-none focus:border-blue-500/50" />
                </section>

                <section className="rounded-2xl border border-[var(--td-border)] bg-[var(--td-surface-soft)] p-5">
                  <h3 className="mb-3 text-[13pt] font-bold text-[var(--td-accent)]">コピー対象</h3>
                  <div className="flex flex-wrap gap-4 text-[11pt] text-[var(--td-text-soft)]">
                    <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={templateIncludeInput} onChange={(event) => setTemplateIncludeInput(event.target.checked)} />Input</label>
                    <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={templateIncludeMemo} onChange={(event) => setTemplateIncludeMemo(event.target.checked)} />メモ</label>
                    <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={templateIncludeOutput} onChange={(event) => setTemplateIncludeOutput(event.target.checked)} />投稿文</label>
                  </div>
                  <button onClick={copyTemplateBundle} className="mt-5 rounded-lg border border-[var(--td-accent-border)] px-4 py-2 text-[11pt] text-[var(--td-accent)] transition hover:bg-[var(--td-accent-bg)]">コピー</button>
                </section>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  };

  const topButtonClass =
    "rounded-lg border border-[var(--td-border-strong)] px-3 py-2 text-[11pt] text-[var(--td-text)] transition hover:border-[var(--td-accent-border)] hover:bg-[var(--td-hover)] hover:text-[var(--td-text)]";
  const insertButtonClass =
    "rounded-lg border border-[var(--td-border-strong)] px-3 py-2 text-[11pt] text-[var(--td-text)] transition hover:border-[var(--td-accent-border)] hover:bg-[var(--td-hover)] hover:text-[var(--td-text)]";
  const panelButtonClass =
    "rounded-lg border border-[var(--td-border-strong)] px-3 py-1.5 text-[11pt] text-[var(--td-text-soft)] transition hover:border-[var(--td-accent-border)] hover:bg-[var(--td-hover)] hover:text-[var(--td-text)]";

  return (
    <main data-theme={themeMode} className="min-h-screen bg-[var(--td-bg)] text-[var(--td-text)] lg:h-screen lg:overflow-hidden">
      {renderExpandedEditor()}
      {renderCentralFocus()}
      {renderShortcutHelp()}
      {renderTemplatePanel()}
      <style jsx global>{`
        main[data-theme="light"] {
          --td-bg: #f8fafc;
          --td-panel: #ffffff;
          --td-surface: #f1f5f9;
          --td-surface-soft: rgba(241, 245, 249, 0.82);
          --td-editor: #ffffff;
          --td-text: #111827;
          --td-text-soft: #374151;
          --td-muted: #6b7280;
          --td-border: rgba(17, 24, 39, 0.13);
          --td-border-strong: rgba(17, 24, 39, 0.22);
          --td-hover: rgba(37, 99, 235, 0.08);
          --td-overlay: rgba(15, 23, 42, 0.32);
          --td-card-bg: rgba(255, 255, 255, 0.78);
          --td-card-border: rgba(17, 24, 39, 0.13);
          --td-card-border-hover: rgba(37, 99, 235, 0.36);
          --td-accent: #2563eb;
          --td-accent-bg: rgba(37, 99, 235, 0.09);
          --td-accent-border: rgba(37, 99, 235, 0.42);
          --td-accent-shadow: rgba(37, 99, 235, 0.45);
          --td-mark-bg: rgba(37, 99, 235, 0.14);
        }
        main[data-theme="dark"] {
          --td-bg: #0b0b10;
          --td-panel: #14141a;
          --td-surface: #181820;
          --td-surface-soft: rgba(24, 24, 32, 0.74);
          --td-editor: #171720;
          --td-text: #f3f4f6;
          --td-text-soft: #d1d5db;
          --td-muted: #8b949e;
          --td-border: rgba(255, 255, 255, 0.11);
          --td-border-strong: rgba(255, 255, 255, 0.20);
          --td-hover: rgba(199, 210, 254, 0.08);
          --td-overlay: rgba(0, 0, 0, 0.78);
          --td-card-bg: rgba(20, 20, 26, 0.62);
          --td-card-border: rgba(255, 255, 255, 0.08);
          --td-card-border-hover: rgba(199, 210, 254, 0.30);
          --td-accent: #c7d2fe;
          --td-accent-bg: rgba(199, 210, 254, 0.08);
          --td-accent-border: rgba(199, 210, 254, 0.40);
          --td-accent-shadow: rgba(199, 210, 254, 0.45);
          --td-mark-bg: rgba(199, 210, 254, 0.22);
        }
        main[data-theme="auto"] {
          --td-bg: #f8fafc;
          --td-panel: #ffffff;
          --td-surface: #f1f5f9;
          --td-surface-soft: rgba(241, 245, 249, 0.82);
          --td-editor: #ffffff;
          --td-text: #111827;
          --td-text-soft: #374151;
          --td-muted: #6b7280;
          --td-border: rgba(17, 24, 39, 0.13);
          --td-border-strong: rgba(17, 24, 39, 0.22);
          --td-hover: rgba(37, 99, 235, 0.08);
          --td-overlay: rgba(15, 23, 42, 0.32);
          --td-card-bg: rgba(255, 255, 255, 0.78);
          --td-card-border: rgba(17, 24, 39, 0.13);
          --td-card-border-hover: rgba(37, 99, 235, 0.36);
          --td-accent: #2563eb;
          --td-accent-bg: rgba(37, 99, 235, 0.09);
          --td-accent-border: rgba(37, 99, 235, 0.42);
          --td-accent-shadow: rgba(37, 99, 235, 0.45);
          --td-mark-bg: rgba(37, 99, 235, 0.14);
        }
        @media (prefers-color-scheme: dark) {
          main[data-theme="auto"] {
            --td-bg: #0b0b10;
            --td-panel: #14141a;
            --td-surface: #181820;
            --td-surface-soft: rgba(24, 24, 32, 0.74);
            --td-editor: #171720;
            --td-text: #f3f4f6;
            --td-text-soft: #d1d5db;
            --td-muted: #8b949e;
            --td-border: rgba(255, 255, 255, 0.11);
            --td-border-strong: rgba(255, 255, 255, 0.20);
            --td-hover: rgba(199, 210, 254, 0.08);
            --td-overlay: rgba(0, 0, 0, 0.78);
            --td-card-bg: rgba(20, 20, 26, 0.62);
            --td-card-border: rgba(255, 255, 255, 0.08);
            --td-card-border-hover: rgba(199, 210, 254, 0.30);
            --td-accent: #c7d2fe;
            --td-accent-bg: rgba(199, 210, 254, 0.08);
            --td-accent-border: rgba(199, 210, 254, 0.40);
            --td-accent-shadow: rgba(199, 210, 254, 0.45);
            --td-mark-bg: rgba(199, 210, 254, 0.22);
          }
        }
        textarea, input {
          background: var(--td-editor) !important;
          color: var(--td-text) !important;
        }
        textarea::placeholder, input::placeholder {
          color: var(--td-muted) !important;
        }
        .no-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {obsidianToast && (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl border border-[var(--td-border-strong)] bg-[var(--td-panel)] px-4 py-2 text-[11pt] text-[var(--td-text-soft)] shadow-lg">
          {obsidianToast}
        </div>
      )}

      {shortcutHint && (
        <div className="fixed left-1/2 top-16 z-[60] -translate-x-1/2 rounded-xl border border-blue-500/40 bg-blue-950/40 px-4 py-2 text-[11pt] text-blue-100 shadow-lg">
          {shortcutHint}
        </div>
      )}

      {openTopMenu === "resources" && (
        <div
          className="fixed inset-0 z-[70] bg-[var(--td-overlay)] p-4 backdrop-blur-sm lg:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpenTopMenu(null);
          }}
        >
          <section className="mx-auto mt-16 max-h-[80vh] w-full max-w-sm overflow-auto rounded-2xl border border-[var(--td-border)] bg-[var(--td-bg)] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10pt] text-[var(--td-muted)]">公式リンク / 追加リンク</p>
                <h2 className="text-[15pt] font-bold text-[var(--td-text)]">リンク</h2>
              </div>
              <button onClick={() => setOpenTopMenu(null)} className={topButtonClass}>閉じる</button>
            </div>

            <div className="flex flex-col gap-1">
              {allQuickLinks.map((link, index) => {
                const isCustom = index >= defaultQuickLinks.length;
                return (
                  <div key={`${link.label}-${link.url}-${index}`} className="flex items-center gap-1">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`${topButtonClass} flex-1 text-center no-underline`}
                      onClick={() => setOpenTopMenu(null)}
                    >
                      {link.label}
                    </a>
                    {isCustom && (
                      <button
                        onClick={() => removeCustomLink(index - defaultQuickLinks.length)}
                        className="rounded-lg border border-[var(--td-border)] px-2 py-2 text-[10pt] text-[var(--td-muted)] hover:border-red-800 hover:text-red-400"
                        title="削除"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 border-t border-[var(--td-border)] pt-4">
              <p className="mb-2 text-[10pt] text-[var(--td-muted)]">追加リンク</p>
              <input
                value={customLinkLabel}
                onChange={(event) => setCustomLinkLabel(event.target.value)}
                placeholder="表示名"
                className="mb-2 w-full rounded-lg border border-[var(--td-border)] bg-[var(--td-panel)] px-3 py-2 text-[10.5pt] text-[var(--td-text)] outline-none focus:border-blue-500/50"
              />
              <input
                value={customLinkUrl}
                onChange={(event) => setCustomLinkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addCustomLink();
                }}
                placeholder="https://..."
                className="mb-2 w-full rounded-lg border border-[var(--td-border)] bg-[var(--td-panel)] px-3 py-2 text-[10.5pt] text-[var(--td-text)] outline-none focus:border-blue-500/50"
              />
              <button onClick={addCustomLink} className={`${topButtonClass} w-full`}>
                追加
              </button>
            </div>
          </section>
        </div>
      )}

      <header className="flex min-h-[70px] flex-wrap items-center justify-between gap-3 border-b border-[var(--td-border)] px-6 py-3">
        <div>
          <h1 className="text-[20px] font-bold leading-tight">
            <a
              href={THOUGHTDECK_HOME_URL}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--td-text)] no-underline transition-colors hover:text-[var(--td-text-soft)]"
            >
              ThoughtDeck
            </a>
          </h1>
          <p className="text-[11pt] text-[var(--td-muted)]">Think. Deck. Share.</p>
        </div>

        <div className="hidden flex-wrap items-center justify-end gap-3 lg:flex">
          <span className="text-[11pt] text-blue-400">✔ {saveStatus}</span>
          {copyStatus && (
            <span className="text-[11pt] text-[var(--td-text)]">{copyStatus}</span>
          )}

          <div ref={topMenuRef} className="flex items-center gap-2 rounded-xl border border-[var(--td-border)] bg-[var(--td-surface)] p-1">
            <button onClick={openOutputComposer} className={topButtonClass}>
              投稿作成
            </button>
            <button onClick={() => setExpandedEditor("input")} className={topButtonClass}>
              Input編集
            </button>
            <button onClick={openMemoEditor} className={topButtonClass}>
              メモ編集
            </button>
            <button onClick={() => setShowShortcutHelp(true)} className={`${topButtonClass} border-[var(--td-accent-border)] text-[var(--td-accent)]`}>
              使い方
            </button>

            <button onClick={changePerspective} className={topButtonClass}>
              視点
              <span className="ml-2 text-[var(--td-muted)]">{perspective.label}</span>
            </button>
            <button onClick={() => setShowLeft((v) => !v)} className={topButtonClass}>
              Input {showLeft ? "非表示" : "表示"}
            </button>
            <button onClick={() => setShowRight((v) => !v)} className={topButtonClass}>
              メモ {showRight ? "非表示" : "表示"}
            </button>

            <div className="relative">
              <button
                onClick={() => setOpenTopMenu((v) => (v === "resources" ? null : "resources"))}
                className={topButtonClass}
              >
                リンク ▾
              </button>
              {openTopMenu === "resources" && (
                <div className="absolute right-0 z-40 mt-2 w-[260px] rounded-xl border border-[var(--td-border)] bg-[var(--td-bg)] p-2 shadow-2xl">
                  <p className="mb-2 text-[10pt] text-[var(--td-muted)]">公式リンク / 追加リンク</p>
                  <div className="flex flex-col gap-1">
                    {allQuickLinks.map((link, index) => {
                      const isCustom = index >= defaultQuickLinks.length;
                      return (
                        <div key={`${link.label}-${link.url}-${index}`} className="flex items-center gap-1">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className={`${topButtonClass} flex-1 text-center no-underline`}
                            onClick={() => setOpenTopMenu(null)}
                          >
                            {link.label}
                          </a>
                          {isCustom && (
                            <button
                              onClick={() => removeCustomLink(index - defaultQuickLinks.length)}
                              className="rounded-lg border border-[var(--td-border)] px-2 py-2 text-[10pt] text-[var(--td-muted)] hover:border-red-800 hover:text-red-400"
                              title="削除"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 border-t border-[var(--td-border)] pt-3">
                    <p className="mb-2 text-[10pt] text-[var(--td-muted)]">追加リンク</p>
                    <input
                      value={customLinkLabel}
                      onChange={(event) => setCustomLinkLabel(event.target.value)}
                      placeholder="表示名"
                      className="mb-2 w-full rounded-lg border border-[var(--td-border)] bg-[var(--td-panel)] px-3 py-2 text-[10.5pt] text-[var(--td-text)] outline-none focus:border-blue-500/50"
                    />
                    <input
                      value={customLinkUrl}
                      onChange={(event) => setCustomLinkUrl(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addCustomLink();
                      }}
                      placeholder="https://..."
                      className="mb-2 w-full rounded-lg border border-[var(--td-border)] bg-[var(--td-panel)] px-3 py-2 text-[10.5pt] text-[var(--td-text)] outline-none focus:border-blue-500/50"
                    />
                    <button onClick={addCustomLink} className={`${topButtonClass} w-full`}>
                      追加
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => setShowTemplatePanel(true)} className={topButtonClass}>
              テンプレ
            </button>

            <div className="relative">
              <button
                onClick={() => setOpenTopMenu((v) => (v === "theme" ? null : "theme"))}
                className={topButtonClass}
              >
                テーマ: {themeLabel(themeMode)} ▾
              </button>
              {openTopMenu === "theme" && (
                <div className="absolute right-0 z-40 mt-2 flex min-w-[160px] flex-col gap-1 rounded-xl border border-[var(--td-border)] bg-[var(--td-bg)] p-2 shadow-2xl">
                  {(["auto", "light", "dark"] as ThemeMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => { setThemeMode(mode); setOpenTopMenu(null); }}
                      className={`${topButtonClass} text-left ${themeMode === mode ? "border-[var(--td-accent-border)] bg-[var(--td-accent-bg)] text-[var(--td-accent)]" : ""}`}
                    >
                      {themeLabel(mode)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setOpenTopMenu((v) => (v === "export" ? null : "export"))}
                className={topButtonClass}
              >
                エクスポート ▾
              </button>
              {openTopMenu === "export" && (
                <div className="absolute right-0 z-40 mt-2 flex min-w-[190px] flex-col gap-1 rounded-xl border border-[var(--td-border)] bg-[var(--td-bg)] p-2 shadow-2xl">
                  <button onClick={() => { downloadMd(); setOpenTopMenu(null); }} className={topButtonClass}>
                    MD保存
                  </button>
                  <button onClick={() => { copyMd(); setOpenTopMenu(null); }} className={topButtonClass}>
                    MDコピー
                  </button>
                  <button onClick={() => { saveToObsidian(); setOpenTopMenu(null); }} className={topButtonClass}>
                    Obsidian保存
                  </button>
                  <button onClick={() => { createShare(); setOpenTopMenu(null); }} className={topButtonClass}>
                    QR表示
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={clearAll}
              className="rounded-lg border border-red-800 px-3 py-1.5 text-[11pt] text-red-400 transition hover:bg-red-950/40"
            >
              クリア
            </button>

          </div>
        </div>

        <div className="text-[11pt] text-[var(--td-text)] lg:hidden">
          ✔ {saveStatus}
          {copyStatus ? ` / ${copyStatus}` : ""}
        </div>
      </header>

      {showQr && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/88 p-8 text-slate-100 backdrop-blur-sm">
          <h2 className="mb-3 text-[13pt] font-bold text-white">{title}</h2>
          <p className="mb-4 text-[11pt] text-slate-300">
            QRまたはURLでDeckを共有
          </p>

          {qrError ? (
            <div className="mb-5 max-w-2xl rounded-xl border border-red-500/70 bg-red-950/70 p-4 text-[11pt] text-red-100 shadow-2xl">
              {qrError}
            </div>
          ) : (
            <div className="rounded-2xl bg-white p-5 shadow-2xl">
              <QRCodeSVG value={shareUrl} size={320} />
            </div>
          )}

          <textarea
            value={shareUrl}
            readOnly
            className="mt-6 h-24 w-full max-w-3xl resize-none rounded-xl border border-slate-300 bg-white p-3 text-[11pt] leading-[1.45] text-slate-900 outline-none shadow-2xl"
          />

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => { navigator.clipboard.writeText(shareUrl); setCopyStatus("URLをコピーしました"); }}
              className="rounded-lg border border-slate-500/80 bg-slate-900 px-4 py-2 text-[11pt] text-white transition hover:border-slate-200 hover:bg-slate-800"
            >
              URLコピー
            </button>
            <button
              onClick={() => setShowQr(false)}
              className="rounded-lg border border-slate-500/80 bg-slate-900 px-4 py-2 text-[11pt] text-white transition hover:border-slate-200 hover:bg-slate-800"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      <div className="flex h-[calc(100vh-70px)] overflow-hidden max-lg:h-auto max-lg:flex-col max-lg:overflow-visible">
        {showLeft && (
          <>
            <aside
              className="no-scrollbar w-full shrink-0 overflow-auto border-r border-[var(--td-border)] p-5 max-lg:border-b max-lg:border-r-0 lg:w-[var(--left-width)]"
              style={{ "--left-width": `${leftWidth}px` } as CSSProperties}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13pt] font-bold text-[var(--td-text)]">
                  インプット
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedEditor("input")}
                    className={panelButtonClass}
                  >
                    編集
                  </button>
                  <button
                    onClick={() => setShowLeft(false)}
                    className={panelButtonClass}
                  >
                    閉じる
                  </button>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-5 gap-2">
                <button
                  onClick={() => insertTemplate("top")}
                  className={insertButtonClass}
                  title="上部1カラムを追加"
                >
                  ＋上
                </button>
                <button
                  onClick={() => insertTemplate("left")}
                  className={insertButtonClass}
                  title="左カードを追加"
                >
                  ＋左
                </button>
                <button
                  onClick={() => insertTemplate("center")}
                  className={insertButtonClass}
                  title="中央カードを追加"
                >
                  ＋中
                </button>
                <button
                  onClick={() => insertTemplate("right")}
                  className={insertButtonClass}
                  title="右カードを追加"
                >
                  ＋右
                </button>
                <button
                  onClick={() => insertTemplate("bottom")}
                  className={insertButtonClass}
                  title="下部1カラムを追加"
                >
                  ＋下
                </button>
              </div>

              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="ここにInputを書きます..."
                className="no-scrollbar h-[calc(100vh-205px)] w-full resize-none rounded-xl border border-[var(--td-border-strong)] bg-[var(--td-panel)] p-4 font-mono text-[11pt] leading-6 outline-none focus:border-[var(--td-border-strong)] max-lg:h-[42vh]"
              />
            </aside>
            <div
              onMouseDown={() => setDraggingLeft(true)}
              className="w-1 cursor-col-resize bg-[var(--td-border)] hover:bg-neutral-500 max-lg:hidden"
            />
          </>
        )}

        {!showLeft && (
          <button
            onClick={() => setShowLeft(true)}
            className="hidden w-9 shrink-0 border-r border-[var(--td-border)] bg-[var(--td-panel)] text-[11pt] text-[var(--td-text)] hover:bg-[var(--td-hover)] lg:block"
            title="Inputを開く"
          >
            ▶
          </button>
        )}

        <section className="no-scrollbar flex-1 overflow-auto p-4 max-lg:overflow-visible max-lg:p-4">
          <div className="mb-5 rounded-xl border border-[var(--td-border)] bg-[var(--td-panel)] p-5">
            <p className="text-[11pt] text-[var(--td-muted)]">タイトル</p>
            <h2 className="text-xl font-bold">{title}</h2>
          </div>

          {topSections.length > 0 && (
            <div className="mb-5 space-y-4">
              {topSections.map(renderOneColumnSection)}
            </div>
          )}

          <div>
            {cardBlocks.map((block, index) => renderCardBlock(block, index))}
          </div>

          {bottomSections.length > 0 && (
            <div className="mt-5 border-t border-[var(--td-border)] pt-4">
              <div className="mb-2 px-1 text-[10.5pt] text-[var(--td-muted)]">
                結論
              </div>
              <div className="space-y-4">
                {bottomSections.map((section) => {
                  const isSelected = selectedCardId === section.id;

                  return (
                    <section
                      key={section.id}
                      onClick={() => setSelectedCardId(section.id)}
                      className={`cursor-pointer rounded-xl border p-4 transition ${
                        isSelected
                          ? selectedThoughtClass
                          : "border-[var(--td-border-strong)] bg-[var(--td-panel)] hover:border-blue-500/40 hover:bg-[var(--td-hover)]"
                      }`}
                    >
                      <h3 className="mb-2 text-[12pt] font-bold text-[var(--td-accent)]">
                        {section.title}
                      </h3>

                      <div className="text-[11pt] leading-5 text-[var(--td-text)]">
                        {renderMarkdownBlocks(section.lines.join("\n"))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}

          {output.trim() && (
            <div className="mt-8 border-t border-[var(--td-border)] pt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10.5pt] text-[var(--td-muted)]">OUTPUT</p>
                  <h2 className="text-[13pt] font-bold text-[var(--td-text)]">投稿文</h2>
                </div>
                <button
                  onClick={openOutputComposer}
                  className="rounded-lg border border-[var(--td-border)] px-3 py-1.5 text-[10.5pt] text-[var(--td-muted)] transition hover:border-[var(--td-accent-border)] hover:bg-[var(--td-accent-bg)] hover:text-[var(--td-accent)]"
                  title="投稿文を編集"
                >
                  編集
                </button>
              </div>
              <section
                onClick={() => setSelectedCardId("td-output")}
                className={`cursor-pointer rounded-xl border p-4 text-[11pt] leading-6 text-[var(--td-text)] transition ${
                  selectedCardId === "td-output"
                    ? selectedThoughtClass
                    : "border-[var(--td-border)] bg-[var(--td-surface-soft)] hover:border-[var(--td-border-strong)]"
                }`}
              >
                {renderMarkdownBlocks(output)}
              </section>
            </div>
          )}
        </section>

        {!showRight && (
          <button
            onClick={() => setShowRight(true)}
            className="hidden w-9 shrink-0 border-l border-[var(--td-border)] bg-[var(--td-panel)] text-[11pt] text-[var(--td-text)] hover:bg-[var(--td-hover)] lg:block"
            title="Memoを開く"
          >
            ◀
          </button>
        )}

        {showRight && (
          <>
            <div
              onMouseDown={() => setDraggingRight(true)}
              className="w-1 cursor-col-resize bg-[var(--td-border)] hover:bg-neutral-500 max-lg:hidden"
            />
            <aside
              className="no-scrollbar w-full shrink-0 overflow-auto border-l border-[var(--td-border)] p-5 max-lg:border-l-0 max-lg:border-t lg:w-[var(--right-width)]"
              style={{ "--right-width": `${rightWidth}px` } as CSSProperties}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13pt] font-bold text-[var(--td-text)]">
                  メモ
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={openMemoEditor}
                    className={panelButtonClass}
                  >
                    編集
                  </button>
                  <button
                    onClick={() => setShowRight(false)}
                    className={panelButtonClass}
                  >
                    閉じる
                  </button>
                </div>
              </div>
              <section
                onClick={() => setSelectedCardId("td-memo")}
                className={`no-scrollbar h-[calc(100vh-150px)] w-full cursor-pointer overflow-auto rounded-xl border p-4 text-[11pt] leading-6 text-[var(--td-text)] transition max-lg:h-[34vh] ${
                  selectedCardId === "td-memo"
                    ? selectedThoughtClass
                    : "border-[var(--td-border)] bg-[var(--td-surface-soft)] hover:border-[var(--td-border-strong)]"
                }`}
              >
                {renderMarkdownBlocks(
                  memo,
                  "編集ボタンから、授業中の気づき・違和感・発言メモを自由に書きます。",
                )}
              </section>
              <p className="mt-2 text-right text-[11pt] text-[var(--td-muted)]">
                文字数：{memo.length}
              </p>
            </aside>
          </>
        )}
      </div>

      <footer className="border-t border-[var(--td-border)] bg-[var(--td-bg)] p-3 lg:hidden">
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--td-border)] bg-[var(--td-surface)] p-1">
            <button onClick={openOutputComposer} className={topButtonClass}>投稿作成</button>
            <button onClick={() => setExpandedEditor("input")} className={topButtonClass}>Input編集</button>
            <button onClick={openMemoEditor} className={topButtonClass}>メモ編集</button>
            <button onClick={() => setShowShortcutHelp(true)} className={`${topButtonClass} border-[var(--td-accent-border)] text-[var(--td-accent)]`}>使い方</button>
            <button onClick={() => setOpenTopMenu((v) => (v === "resources" ? null : "resources"))} className={topButtonClass}>リンク</button>
            <button onClick={() => setShowTemplatePanel(true)} className={topButtonClass}>テンプレ</button>
            <button onClick={() => setThemeMode((mode) => nextThemeMode(mode))} className={topButtonClass}>テーマ: {themeLabel(themeMode)}</button>
            <button onClick={changePerspective} className={topButtonClass}>視点</button>
            <button onClick={() => setShowLeft((v) => !v)} className={topButtonClass}>Input {showLeft ? "非表示" : "表示"}</button>
            <button onClick={() => setShowRight((v) => !v)} className={topButtonClass}>メモ {showRight ? "非表示" : "表示"}</button>
            <button onClick={downloadMd} className={topButtonClass}>MD保存</button>
            <button onClick={copyMd} className={topButtonClass}>MDコピー</button>
            <button onClick={saveToObsidian} className={topButtonClass}>Obsidian保存</button>
            <button onClick={createShare} className={topButtonClass}>QR表示</button>
            <button onClick={clearAll} className="rounded-lg border border-red-800 px-3 py-1.5 text-[11pt] text-red-400 hover:bg-red-950/40">クリア</button>
          </div>

          <div className="text-[10pt] text-[var(--td-muted)]">
            ThoughtDeck —{" "}
            <a
              href={THOUGHTDECK_HOME_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-[var(--td-text-soft)]"
            >
              thought-deck.vercel.app
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
