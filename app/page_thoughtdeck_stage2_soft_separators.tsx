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

type FocusItem =
  | (Card & { focusKind: "card"; focusLabel: string })
  | (OneColumnSection & { focusKind: "section"; focusLabel: string });

type DeckState = {
  raw: string;
  memo: string;
  addedCards: AddedCard[];
  starred: string[];
};

type ParsedDeck = {
  title: string;
  topSections: OneColumnSection[];
  cards: ParsedCard[];
  bottomSections: OneColumnSection[];
};

const STORAGE_KEY = "thoughtdeck:v4";
const MAX_URL_LENGTH = 3000;
const THOUGHTDECK_HOME_URL = "https://thought-deck.vercel.app/";

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

const demoRaw = `# マーケティング Day1 Hubble

## 設問
- Hubbleはどの顧客を狙うべきか？
- 成長のボトルネックは何か？
- 今後の打ち手は何か？

### 市場・業界
@area: left
- 米国では==75%==が視力矯正を必要とする
- 市場規模は==40億ドル==
- 大手4社が強い寡占市場

### 顧客
@area: left
- 初期顧客は平均28歳
- 女性比率は==70%==
- SNS・モバイル経由が多い

### 価値提案
@area: center
- 低価格・サブスク・オンライン直販
- 従来の**面倒な購買体験**を変えた

### 成果・課題
@area: right
- 創業5年で==売上10倍==
- 品質・規制・CACが課題
- 持続的な差別化が必要

## まとめ
Hubbleは低価格・利便性を武器に成長したが、今後は品質・規制・CACを管理しながら持続的な差別化する必要がある。`;

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
      currentCard = {
        id: `raw-${cards.length}-${trimmed}`,
        source: "raw",
        area: "center",
        title: trimmed.replace(/^###[ \t\u3000]*/, "").trim() || "見出し",
        lines: [],
        visualGroup,
      };
      continue;
    }

    if (currentCard) {
      if (trimmed.startsWith("@area:"))
        currentCard.area = areaFromLine(trimmed);
      else currentCard.lines.push(line);
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

function rawCardIndexFromId(id: string) {
  const match = id.match(/^raw-(\d+)-/);
  return match ? Number(match[1]) : null;
}

function changeRawCardArea(raw: string, cardId: string, nextArea: Area) {
  const targetIndex = rawCardIndexFromId(cardId);
  if (targetIndex === null) return raw;

  const lines = raw.split("\n");
  let cardIndex = -1;
  let h3LineIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (isH3(lines[i])) {
      cardIndex += 1;
      if (cardIndex === targetIndex) {
        h3LineIndex = i;
        break;
      }
    }
  }

  if (h3LineIndex < 0) return raw;

  let blockEnd = lines.length;
  for (let i = h3LineIndex + 1; i < lines.length; i += 1) {
    if (isH1(lines[i]) || isH2(lines[i]) || isH3(lines[i])) {
      blockEnd = i;
      break;
    }
  }

  const areaLineIndex = lines.findIndex(
    (line, index) =>
      index > h3LineIndex &&
      index < blockEnd &&
      line.trim().startsWith("@area:"),
  );

  if (areaLineIndex >= 0) {
    lines[areaLineIndex] = `@area: ${nextArea}`;
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
          className="rounded bg-yellow-300/80 px-1 text-neutral-950"
        >
          {part.slice(2, -2)}
        </mark>
      );
    }

    if (part.startsWith("=") && part.endsWith("=") && part.length > 2) {
      return (
        <mark
          key={i}
          className="rounded bg-yellow-300/80 px-1 text-neutral-950"
        >
          {part.slice(1, -1)}
        </mark>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={i}>{part}</span>;
  });
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

  return `${noteMeta}${sourceMarkdown}${added}\n\n---\n\n## 学びの殴り書きメモ\n${memoMeta}${memo.trim() || "（メモなし）"}${footer}`;
}

function buildRestoreUrl(
  raw: string,
  memo: string,
  addedCards: AddedCard[],
  starred: string[],
) {
  if (typeof window === "undefined") return "";
  const base = `${window.location.origin}${window.location.pathname}`;
  const deck: DeckState = { raw, memo, addedCards, starred };
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
  starred: string[],
) {
  const restoreUrl = buildRestoreUrl(raw, memo, addedCards, starred);
  const title = getTitle(raw);
  const ids: ObsidianExportIds = {
    noteId: generatePortableId("note"),
    groupId: generatePortableId("group"),
  };
  const body = buildExportMarkdown(raw, addedCards, memo, false, true, ids).trimEnd();

  const frontmatter = `---\nthoughtdeck_note_id: ${ids.noteId}\nthoughtdeck_group_id: ${ids.groupId}\ntags:\n  - thoughtdeck\n  - ${ids.groupId}\n---`;

  return `${frontmatter}\n\n[${title}](${restoreUrl})\n\n${body}\n\n---\n\n作成元: ThoughtDeck\n保存日時: ${formatObsidianTimestamp()}\n[thought-deck](${THOUGHTDECK_HOME_URL})\n`;
}

export default function Home() {
  const [raw, setRaw] = useState(blankRaw);
  const [memo, setMemo] = useState("");
  const [addedCards, setAddedCards] = useState<AddedCard[]>([]);
  const [starred, setStarred] = useState<string[]>([]);

  const [saveStatus, setSaveStatus] = useState("保存済");
  const [copyStatus, setCopyStatus] = useState("");
  const [obsidianToast, setObsidianToast] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [expandedEditor, setExpandedEditor] = useState<"input" | "memo" | null>(
    null,
  );
  const [shortcutHint, setShortcutHint] = useState("");
  const [perspectiveIndex, setPerspectiveIndex] = useState(1);

  const perspective = placeholderSets[perspectiveIndex];

  const baseCardClass =
    "border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-blue-500/40 hover:bg-blue-950/5 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.08)]";

  const selectedThoughtClass =
    "border-blue-500/60 bg-blue-950/10 shadow-[0_0_0_1px_rgba(59,130,246,0.16)]";

  const mutedQuestionClass = "text-[10.5pt] leading-none text-neutral-500";

  const changePerspective = () => {
    setPerspectiveIndex((prev) => (prev + 1) % placeholderSets.length);
  };

  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [leftWidth, setLeftWidth] = useState(350);
  const [rightWidth, setRightWidth] = useState(390);
  const [draggingLeft, setDraggingLeft] = useState(false);
  const [draggingRight, setDraggingRight] = useState(false);

  const memoRef = useRef<HTMLTextAreaElement | null>(null);

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

  const leftCards = allCards.filter((c) => c.area === "left");
  const centerCards = allCards.filter((c) => c.area === "center");
  const rightCards = allCards.filter((c) => c.area === "right");
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
        setAddedCards(decoded.addedCards || []);
        setStarred(decoded.starred || []);
        setShowLeft(false);
        return;
      }
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const deck = JSON.parse(saved) as DeckState;
        setRaw(deck.raw || blankRaw);
        setMemo(deck.memo || "");
        setAddedCards(deck.addedCards || []);
        setStarred(deck.starred || []);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    setSaveStatus("保存中");
    const timer = window.setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ raw, memo, addedCards, starred }),
      );
      setSaveStatus("保存済");
    }, 300);
    return () => window.clearTimeout(timer);
  }, [raw, memo, addedCards, starred]);

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
        showShortcutHint("Inputを集中表示します");
        return;
      }

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        setExpandedEditor("memo");
        showShortcutHint("学習メモを集中表示します");
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (!selectedFocusItem) {
          showShortcutHint("フォーカスするカードを選択してください");
          return;
        }
        setFocusMode((prev) => !prev);
      }

      if (event.key === "Escape") {
        if (expandedEditor) setExpandedEditor(null);
        else if (focusMode) setFocusMode(false);
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
    const deck: DeckState = { raw, memo, addedCards, starred };
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
    const md = buildExportMarkdown(raw, addedCards, memo);
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
      buildExportMarkdown(raw, addedCards, memo),
    );
    setCopyStatus("MDコピー済");
    window.setTimeout(() => setCopyStatus(""), 1800);
  };

  const saveToObsidian = () => {
    const md = buildObsidianMarkdown(raw, addedCards, memo, starred);
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
      "現在の入力内容・学びメモ・追加状態がデモ内容で上書きされます。よろしいですか？",
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
        <h3 className="mb-1 text-[12pt] font-bold text-neutral-200">
          {section.title}
        </h3>
        {section.lines.length > 0 ? (
          <div className="space-y-0.5 break-words text-[11pt] leading-5 text-neutral-200">
            {section.lines.map((line, index) => (
              <p key={index}>{renderInline(line)}</p>
            ))}
          </div>
        ) : (
          <p className="text-[11pt] text-neutral-500">
            本文はInput欄に入力してください。
          </p>
        )}
      </section>
    );
  };

  const renderCard = (card: Card, isCenter = false) => {
    const isSelected = selectedCardId === card.id;

    return (
      <div
        key={card.id}
        draggable
        onClick={() => setSelectedCardId(card.id)}
        onDragStart={() => {
          setDraggedCardId(card.id);
          setSelectedCardId(card.id);
        }}
        onDragEnd={() => setDraggedCardId(null)}
        className={`cursor-move rounded-xl border p-4 transition ${
          isSelected
            ? selectedThoughtClass
            : isCenter
              ? "border-neutral-600 bg-neutral-900 hover:border-blue-500/40 hover:bg-white/5"
              : baseCardClass
        }`}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="w-full text-[12pt] font-bold text-neutral-100">
            {card.title}
          </h3>
          <button
            onClick={(event) => {
              event.stopPropagation();
              toggleStar(card.id);
            }}
            className="shrink-0 text-[11pt] text-neutral-500 hover:text-neutral-300"
            title="重要マーク"
          >
            {starred.includes(card.id) ? "★" : "☆"}
          </button>
        </div>

        <ul className="space-y-0.5 break-words text-[11pt] leading-5 text-neutral-200">
          {card.lines.map((line, index) => (
            <li key={index}>{renderInline(line)}</li>
          ))}
        </ul>
      </div>
    );
  };

  const renderFocusedCard = (item: FocusItem) => {
    const areaLabel = item.focusLabel;

    return (
      <div className="mx-auto flex min-h-[55vh] max-w-5xl flex-col justify-center">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10.5pt] text-neutral-500">フォーカス中</p>
            <h2 className="text-[18pt] font-bold text-neutral-100">
              {item.title}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10.5pt] text-neutral-500">
            <span className="rounded-full border border-neutral-700 px-3 py-1">
              {areaLabel}
            </span>
            <span>F / Esc：戻る</span>
          </div>
        </div>

        <section className="rounded-2xl border border-blue-500/60 bg-blue-950/10 p-7 shadow-[0_0_0_1px_rgba(59,130,246,0.16)]">
          <div className="space-y-2 break-words text-[14pt] leading-8 text-neutral-100">
            {item.lines.length > 0 ? (
              item.lines.map((line, index) => (
                <p key={index}>{renderInline(line)}</p>
              ))
            ) : (
              <p className="text-neutral-500">
                本文はInput欄に入力してください。
              </p>
            )}
          </div>
        </section>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            onClick={() => setFocusMode(false)}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-[11pt] text-neutral-200 transition hover:border-neutral-500 hover:bg-white/5"
          >
            一覧に戻る
          </button>
        </div>
      </div>
    );
  };

  const renderColumn = (items: Card[], area?: Area) => {
    const isCenter = area === "center";

    return (
      <section
        onDragOver={(event) => {
          if (!area || !draggedCardId) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          if (!area || !draggedCardId) return;
          event.preventDefault();
          moveCardToArea(draggedCardId, area);
          setDraggedCardId(null);
        }}
        className={`min-h-16 space-y-3 rounded-xl transition ${
          isCenter
            ? "border border-neutral-800/70 p-2"
            : draggedCardId
              ? "border border-dashed border-neutral-800 p-2"
              : ""
        }`}
      >
        {items.map((card, index) => {
          const prev = items[index - 1];
          const hasSoftBreak =
            index > 0 &&
            card.visualGroup !== undefined &&
            prev?.visualGroup !== undefined &&
            card.visualGroup !== prev.visualGroup;

          return (
            <div key={card.id} className={hasSoftBreak ? "mt-7" : ""}>
              {renderCard(card, isCenter)}
            </div>
          );
        })}
        {draggedCardId && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-800 p-4 text-center text-[10.5pt] text-neutral-600">
            ここへ移動
          </div>
        )}
      </section>
    );
  };

  const renderExpandedEditor = () => {
    if (!expandedEditor) return null;

    const isInput = expandedEditor === "input";
    const title = isInput
      ? "インプット（集中モード）"
      : "学びの殴り書き（集中モード）";
    const value = isInput ? raw : memo;
    const setValue = isInput ? setRaw : setMemo;
    const placeholder = isInput
      ? "AI出力やObsidianの内容をここにコピペ..."
      : "授業中の気づき・違和感・発言メモを自由に書く...";

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        <section className="flex h-[86vh] w-full max-w-6xl flex-col rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-5 py-4">
            <div>
              <p className="text-[10.5pt] text-neutral-500">
                Esc：閉じる / Ctrl+Enter：保存して閉じる
              </p>
              <h2 className="text-[15pt] font-bold text-neutral-100">
                {title}
              </h2>
            </div>
            <button
              onClick={() => setExpandedEditor(null)}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-[11pt] text-neutral-200 transition hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-white"
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
            className={`no-scrollbar flex-1 resize-none bg-neutral-950 p-6 outline-none ${
              isInput
                ? "font-mono text-[12pt] leading-7 text-neutral-100"
                : "text-[13pt] leading-8 text-neutral-100"
            }`}
          />

          <div className="flex items-center justify-between border-t border-neutral-800 px-5 py-3 text-[10.5pt] text-neutral-500">
            <span>
              {isInput
                ? "Inputが唯一の元データです"
                : "授業中の気づきだけに集中できます"}
            </span>
            <span>文字数：{value.length}</span>
          </div>
        </section>
      </div>
    );
  };

  const topButtonClass =
    "rounded-lg border border-neutral-700 px-3 py-2 text-[11pt] text-neutral-200 transition hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-white";
  const insertButtonClass =
    "rounded-lg border border-neutral-700 px-3 py-2 text-[11pt] text-neutral-200 transition hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-white";
  const panelButtonClass =
    "rounded-lg border border-neutral-700 px-3 py-1.5 text-[11pt] text-neutral-300 transition hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-white";

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 lg:h-screen lg:overflow-hidden">
      {renderExpandedEditor()}
      <style jsx global>{`
        .no-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {obsidianToast && (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-[11pt] text-neutral-300 shadow-lg">
          {obsidianToast}
        </div>
      )}

      {shortcutHint && (
        <div className="fixed left-1/2 top-16 z-[60] -translate-x-1/2 rounded-xl border border-blue-500/40 bg-blue-950/40 px-4 py-2 text-[11pt] text-blue-100 shadow-lg">
          {shortcutHint}
        </div>
      )}

      <header className="flex min-h-[70px] flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-6 py-3">
        <div>
          <h1 className="text-[20px] font-bold leading-tight">
            <a
              href={THOUGHTDECK_HOME_URL}
              target="_blank"
              rel="noreferrer"
              className="text-neutral-100 no-underline transition-colors hover:text-neutral-300"
            >
              ThoughtDeck
            </a>
          </h1>
          <p className="text-[11pt] text-neutral-400">Think. Deck. Share.</p>
        </div>

        <div className="hidden flex-wrap items-center justify-end gap-3 lg:flex">
          <span className="text-[11pt] text-blue-400">✔ {saveStatus}</span>
          {copyStatus && (
            <span className="text-[11pt] text-neutral-200">{copyStatus}</span>
          )}

          <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-1">
            <button
              onClick={changePerspective}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-[11pt] text-neutral-200 transition hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-white"
            >
              🔄 視点を変える
              <span className="ml-2 text-neutral-500">{perspective.label}</span>
            </button>
            <button
              onClick={() => {
                if (!selectedFocusItem) {
                  showShortcutHint("フォーカスするカードを選択してください");
                  return;
                }
                setFocusMode((prev) => !prev);
              }}
              className={`rounded-lg border px-3 py-2 text-[11pt] transition ${
                focusMode
                  ? "border-blue-500/60 bg-blue-950/20 text-blue-100"
                  : "border-neutral-700 text-neutral-200 hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-white"
              }`}
            >
              Focus
            </button>
            {selectedCard && (
              <span className="hidden px-2 text-[10.5pt] text-neutral-500 xl:inline">
                1/2/3で移動・Sで★・Fで集中
              </span>
            )}
            <button onClick={confirmLoadDemo} className={topButtonClass}>
              デモ
            </button>
            <button
              onClick={clearAll}
              className="rounded-lg border border-red-800 px-3 py-2 text-[11pt] text-red-400 hover:bg-red-950/40"
            >
              クリア
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-1">
            <button
              onClick={() => setShowLeft((v) => !v)}
              className={topButtonClass}
            >
              Input
            </button>
            <button
              onClick={() => setShowRight((v) => !v)}
              className={topButtonClass}
            >
              Memo
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-1">
            <button onClick={downloadMd} className={topButtonClass}>
              MD保存
            </button>
            <button onClick={copyMd} className={topButtonClass}>
              MDコピー
            </button>
            <button onClick={saveToObsidian} className={topButtonClass}>
              Obsidian保存
            </button>
            <button
              onClick={createShare}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-[11pt] text-neutral-200 transition hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-white"
            >
              QR表示
            </button>
          </div>
        </div>

        <div className="text-[11pt] text-neutral-200 lg:hidden">
          ✔ {saveStatus}
          {copyStatus ? ` / ${copyStatus}` : ""}
        </div>
      </header>

      {showQr && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-8">
          <h2 className="mb-3 text-[13pt] font-bold">{title}</h2>
          <p className="mb-4 text-[11pt] text-neutral-400">
            QRまたはURLでDeckを共有
          </p>

          {qrError ? (
            <div className="mb-5 max-w-2xl rounded-xl border border-red-800 bg-red-950/50 p-4 text-[11pt] text-red-300">
              {qrError}
            </div>
          ) : (
            <div className="rounded-2xl bg-white p-5">
              <QRCodeSVG value={shareUrl} size={320} />
            </div>
          )}

          <textarea
            value={shareUrl}
            readOnly
            className="mt-6 h-24 w-full max-w-3xl resize-none rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-[11pt] leading-[1.45] text-neutral-300 outline-none"
          />

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => navigator.clipboard.writeText(shareUrl)}
              className={topButtonClass}
            >
              URLコピー
            </button>
            <button onClick={() => setShowQr(false)} className={topButtonClass}>
              閉じる
            </button>
          </div>
        </div>
      )}

      <div className="flex h-[calc(100vh-70px)] overflow-hidden max-lg:h-auto max-lg:flex-col max-lg:overflow-visible">
        {showLeft && (
          <>
            <aside
              className="no-scrollbar w-full shrink-0 overflow-auto border-r border-neutral-800 p-5 max-lg:border-b max-lg:border-r-0 lg:w-[var(--left-width)]"
              style={{ "--left-width": `${leftWidth}px` } as CSSProperties}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13pt] font-bold text-neutral-200">
                  インプット
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedEditor("input")}
                    className={panelButtonClass}
                  >
                    拡大
                  </button>
                  <button
                    onClick={() => setShowGuide((v) => !v)}
                    className={panelButtonClass}
                  >
                    使い方
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

              {showGuide && (
                <div className="mb-3 rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-[11pt] leading-6 text-neutral-300">
                  <p className="font-bold text-neutral-200">書き方</p>
                  <p># タイトル</p>
                  <p>## 上部1カラム（設問・前提など）</p>
                  <p>### 3カラムカード見出し</p>
                  <p>@area: left / center / right</p>
                  <p>## 下部1カラム（まとめ・次回アクションなど）</p>
                  <p>==強調== / **太字** に対応</p>
                </div>
              )}

              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="AI出力やObsidianの内容をここにコピペ..."
                className="no-scrollbar h-[calc(100vh-205px)] w-full resize-none rounded-xl border border-neutral-700 bg-neutral-900 p-4 font-mono text-[11pt] leading-6 outline-none focus:border-neutral-500 max-lg:h-[42vh]"
              />
            </aside>
            <div
              onMouseDown={() => setDraggingLeft(true)}
              className="w-1 cursor-col-resize bg-neutral-800 hover:bg-neutral-500 max-lg:hidden"
            />
          </>
        )}

        {!showLeft && (
          <button
            onClick={() => setShowLeft(true)}
            className="hidden w-9 shrink-0 border-r border-neutral-800 bg-neutral-900 text-[11pt] text-neutral-200 hover:bg-white/5 lg:block"
            title="Inputを開く"
          >
            ▶
          </button>
        )}

        <section className="no-scrollbar flex-1 overflow-auto p-4 max-lg:overflow-visible max-lg:p-4">
          <div className="mb-5 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-[11pt] text-neutral-500">タイトル</p>
            <h2 className="text-xl font-bold">{title}</h2>
          </div>

          {topSections.length > 0 && !focusMode && (
            <div className="mb-5 space-y-4">
              {topSections.map(renderOneColumnSection)}
            </div>
          )}

          {focusMode && selectedFocusItem ? (
            renderFocusedCard(selectedFocusItem)
          ) : (
            <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-1">
              <div className="space-y-2">
                {perspective.left && (
                  <p className={`${mutedQuestionClass} px-1`}>
                    {perspective.left}
                  </p>
                )}
                {renderColumn(leftCards, "left")}
              </div>

              <div className="space-y-2">
                {perspective.center && (
                  <p className={`${mutedQuestionClass} px-1`}>
                    {perspective.center}
                  </p>
                )}
                {renderColumn(centerCards, "center")}
              </div>

              <div className="space-y-2">
                {perspective.right && (
                  <p className={`${mutedQuestionClass} px-1`}>
                    {perspective.right}
                  </p>
                )}
                {renderColumn(rightCards, "right")}
              </div>
            </div>
          )}

          {bottomSections.length > 0 && !focusMode && (
            <div className="mt-5 border-t border-neutral-800 pt-4">
              <div className="mb-2 px-1 text-[10.5pt] text-neutral-500">
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
                          : "border-neutral-700 bg-neutral-950/70 hover:border-blue-500/40 hover:bg-white/5"
                      }`}
                    >
                      <h3 className="mb-2 text-[12pt] font-bold text-neutral-100">
                        {section.title}
                      </h3>

                      {section.lines.length > 0 ? (
                        <div className="space-y-0.5 break-words text-[11pt] leading-5 text-neutral-200">
                          {section.lines.map((line, index) => (
                            <p key={index}>{renderInline(line)}</p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11pt] text-neutral-500">
                          本文はInput欄に入力してください。
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {!showRight && (
          <button
            onClick={() => setShowRight(true)}
            className="hidden w-9 shrink-0 border-l border-neutral-800 bg-neutral-900 text-[11pt] text-neutral-200 hover:bg-white/5 lg:block"
            title="Memoを開く"
          >
            ◀
          </button>
        )}

        {showRight && (
          <>
            <div
              onMouseDown={() => setDraggingRight(true)}
              className="w-1 cursor-col-resize bg-neutral-800 hover:bg-neutral-500 max-lg:hidden"
            />
            <aside
              className="no-scrollbar w-full shrink-0 overflow-auto border-l border-neutral-800 p-5 max-lg:border-l-0 max-lg:border-t lg:w-[var(--right-width)]"
              style={{ "--right-width": `${rightWidth}px` } as CSSProperties}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13pt] font-bold text-neutral-200">
                  学びの殴り書き
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedEditor("memo")}
                    className={panelButtonClass}
                  >
                    拡大
                  </button>
                  <button
                    onClick={() => setShowRight(false)}
                    className={panelButtonClass}
                  >
                    閉じる
                  </button>
                </div>
              </div>
              <textarea
                ref={memoRef}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="授業中の気づき・違和感・発言メモを自由に書く..."
                className="no-scrollbar h-[calc(100vh-150px)] w-full resize-none rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-[11pt] leading-6 outline-none focus:border-neutral-500 max-lg:h-[34vh]"
              />
              <p className="mt-2 text-right text-[11pt] text-neutral-500">
                文字数：{memo.length}
              </p>
            </aside>
          </>
        )}
      </div>

      <footer className="border-t border-neutral-800 bg-neutral-950 p-3 lg:hidden">
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-neutral-800 bg-neutral-900/80 p-1">
            <button onClick={confirmLoadDemo} className={topButtonClass}>
              デモ
            </button>
            <button
              onClick={clearAll}
              className="rounded-lg border border-red-800 px-3 py-2 text-[11pt] text-red-400 hover:bg-red-950/40"
            >
              クリア
            </button>
            <button
              onClick={() => setShowLeft((v) => !v)}
              className={topButtonClass}
            >
              Input
            </button>
            <button
              onClick={() => setShowRight((v) => !v)}
              className={topButtonClass}
            >
              Memo
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-neutral-800 bg-neutral-900/80 p-1">
            <button onClick={downloadMd} className={topButtonClass}>
              MD保存
            </button>
            <button onClick={copyMd} className={topButtonClass}>
              MDコピー
            </button>
            <button onClick={saveToObsidian} className={topButtonClass}>
              Obsidian保存
            </button>
            <button
              onClick={createShare}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-[11pt] text-neutral-200 transition hover:border-blue-500/50 hover:bg-blue-950/10 hover:text-white"
            >
              QR表示
            </button>
          </div>

          <div className="text-[10pt] text-neutral-500">
            ThoughtDeck —{" "}
            <a
              href={THOUGHTDECK_HOME_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-neutral-300"
            >
              thought-deck.vercel.app
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
