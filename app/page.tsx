"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Area = "left" | "center" | "right";

type Card = {
  id: string;
  title: string;
  area: Area;
  lines: string[];
};

type ResizeTarget = "input" | "memo" | null;

type SharePayload = {
  markdown: string;
  memo: string;
  starredCardIds?: string[];
};

const MAX_SHARE_URL_LENGTH = 3000;

const defaultMarkdown = `# タイトルを入力（例：マーケティング Day1 Hubble）

`;

const cardTemplate = `### 気づき
@area: center
@type: memo

`;

const demoMarkdown = `# マーケティング Day1 Hubble

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
- 従来の面倒な購買体験を変えた

### 成果・課題
@area: right

- 創業5年で==売上10倍==
- 品質・規制・CACが課題
- 持続的な差別化が必要`;

function encodePayload(payload: SharePayload) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function decodePayload(encoded: string): SharePayload | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}

function extractTitle(markdown: string) {
  const titleLine = markdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("# ") && !line.startsWith("## "));

  const title = titleLine?.replace(/^#\s+/, "").trim();

  if (!title || title === "タイトルを入力（例：マーケティング Day1 Hubble）") {
    return "タイトル未設定";
  }

  return title;
}

function parseCards(markdown: string): Card[] {
  const blocks = markdown.split(/\n(?=### )/);

  return blocks
    .map((block, index) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const titleLine = lines.find((line) => line.startsWith("### "));
      if (!titleLine) return null;

      const title = titleLine.replace("### ", "").trim();
      const areaLine = lines.find((line) => line.startsWith("@area:"));
      const rawArea = areaLine?.replace("@area:", "").trim();

      const area: Area =
        rawArea === "left" || rawArea === "center" || rawArea === "right"
          ? rawArea
          : "center";

      const bodyLines = lines.filter(
        (line) =>
          !line.startsWith("# ") &&
          !line.startsWith("### ") &&
          !line.startsWith("@area:")
      );

      return {
        id: `${area}-${index}-${title}`,
        title,
        area,
        lines: bodyLines,
      };
    })
    .filter(Boolean) as Card[];
}

function highlight(text: string) {
  const parts = text.split(/(==.*?==)/g);

  return parts.map((part, index) => {
    if (part.startsWith("==") && part.endsWith("==")) {
      return (
        <mark
          key={index}
          className="rounded bg-yellow-300/70 px-1 text-neutral-950"
        >
          {part.slice(2, -2)}
        </mark>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

function CardView({
  card,
  selected,
  starred,
  onClick,
  onToggleStar,
}: {
  card: Card;
  selected: boolean;
  starred: boolean;
  onClick: () => void;
  onToggleStar: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={[
        "relative w-full cursor-pointer rounded-xl border p-5 pr-12 text-left transition",
        "bg-neutral-900 hover:bg-neutral-800/80",
        selected ? "border-blue-400 ring-1 ring-blue-400" : "border-neutral-600",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleStar();
        }}
        aria-label={starred ? "重要マークを外す" : "重要マークを付ける"}
        title={starred ? "重要マークを外す" : "重要マークを付ける"}
        className={[
          "absolute right-4 top-4 text-2xl leading-none transition",
          starred
            ? "text-yellow-300 drop-shadow hover:text-yellow-200"
            : "text-neutral-400 hover:text-yellow-300",
        ].join(" ")}
      >
        {starred ? "★" : "☆"}
      </button>

      <h3 className="mb-4 text-lg font-bold leading-snug text-blue-400">
        {card.title}
      </h3>

      <ul className="space-y-2.5 text-sm leading-7 text-neutral-200">
        {card.lines.map((line, index) => (
          <li key={index} className="pl-1">
            {highlight(line.startsWith("-") ? line : `- ${line}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResizeHandle({
  onMouseDown,
}: {
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="hidden w-1 cursor-col-resize bg-neutral-800 hover:bg-blue-400 md:block"
    />
  );
}

function WritingGuide() {
  return (
    <details className="mb-4 rounded-xl border border-neutral-700 bg-neutral-900/70 p-3 text-sm text-neutral-300">
      <summary className="cursor-pointer select-none font-bold text-blue-300">
        書き方ガイド
      </summary>

      <div className="mt-4 space-y-3 border-t border-neutral-700 pt-4 text-xs leading-6">
        <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-neutral-800 pb-2">
          <code className="rounded bg-neutral-800 px-2 py-1 text-blue-300">
            # タイトル
          </code>
          <span>メモ全体のタイトル。1つだけ書きます。</span>
        </div>

        <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-neutral-800 pb-2">
          <code className="rounded bg-neutral-800 px-2 py-1 text-blue-300">
            ### 見出し
          </code>
          <span>カードの見出しになります。</span>
        </div>

        <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-neutral-800 pb-2">
          <code className="rounded bg-neutral-800 px-2 py-1 text-blue-300">
            @area:
          </code>
          <span>left / center / right で配置を指定します。</span>
        </div>

        <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-neutral-800 pb-2">
          <code className="rounded bg-neutral-800 px-2 py-1 text-blue-300">
            ==強調==
          </code>
          <span>重要語句を黄色でハイライトします。</span>
        </div>

        <div className="grid grid-cols-[120px_1fr] gap-3">
          <code className="rounded bg-neutral-800 px-2 py-1 text-blue-300">
            ★
          </code>
          <span>カード右上の星で重要カードをマークできます。</span>
        </div>
      </div>
    </details>
  );
}

export default function Home() {
  const markdownRef = useRef<HTMLTextAreaElement | null>(null);

  const [markdown, setMarkdown] = useState(defaultMarkdown);
  const [memo, setMemo] = useState("");
  const [starredCardIds, setStarredCardIds] = useState<string[]>([]);

  const [showInput, setShowInput] = useState(true);
  const [showMemo, setShowMemo] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const [inputWidth, setInputWidth] = useState(360);
  const [memoWidth, setMemoWidth] = useState(340);

  const [resizeTarget, setResizeTarget] = useState<ResizeTarget>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState("");
  const [showShare, setShowShare] = useState(false);

  const cards = useMemo(() => parseCards(markdown), [markdown]);
  const boardTitle = useMemo(() => extractTitle(markdown), [markdown]);

  const leftCards = cards.filter((card) => card.area === "left");
  const centerCards = cards.filter((card) => card.area === "center");
  const rightCards = cards.filter((card) => card.area === "right");

  const buildShareUrl = useCallback(() => {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;

    if (!markdown.trim() && !memo.trim() && starredCardIds.length === 0) {
      return baseUrl;
    }

    const encoded = encodePayload({
      markdown,
      memo,
      starredCardIds,
    });

    return `${baseUrl}?d=${encodeURIComponent(encoded)}`;
  }, [markdown, memo, starredCardIds]);

  const toggleStar = (cardId: string) => {
    setStarredCardIds((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : [...prev, cardId]
    );
  };

  const addTemplate = () => {
    setMarkdown((prev) => {
      const trimmedRight = prev.replace(/\s+$/g, "");
      const next = trimmedRight
        ? `${trimmedRight}\n\n${cardTemplate}`
        : cardTemplate;

      setTimeout(() => {
        markdownRef.current?.focus();
        const length = next.length;
        markdownRef.current?.setSelectionRange(length, length);
      }, 0);

      return next;
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const data = params.get("d");

    if (!data) return;

    const payload = decodePayload(data);
    if (!payload) return;

    setMarkdown(payload.markdown ?? defaultMarkdown);
    setMemo(payload.memo ?? "");
    setStarredCardIds(payload.starredCardIds ?? []);
    setShowInput(false);
    setShowMemo(true);
  }, []);

  useEffect(() => {
    const validIds = new Set(cards.map((card) => card.id));
    setStarredCardIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [cards]);

  useEffect(() => {
    if (!showShare) return;

    const url = buildShareUrl();

    if (url.length > MAX_SHARE_URL_LENGTH) {
      setShareError(
        `共有URLが長すぎます。現在 ${url.length} 文字です。${MAX_SHARE_URL_LENGTH} 文字以内にしてください。`
      );
      return;
    }

    setShareError("");
    setShareUrl(url);
  }, [markdown, memo, starredCardIds, showShare, buildShareUrl]);

  useEffect(() => {
    if (!resizeTarget) return;

    const onMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - resizeStartX;

      if (resizeTarget === "input") {
        setInputWidth(Math.min(Math.max(resizeStartWidth + delta, 300), 620));
      }

      if (resizeTarget === "memo") {
        setMemoWidth(Math.min(Math.max(resizeStartWidth - delta, 260), 680));
      }
    };

    const onMouseUp = () => {
      setResizeTarget(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizeTarget, resizeStartX, resizeStartWidth]);

  const startInputResize = (event: React.MouseEvent<HTMLDivElement>) => {
    setResizeTarget("input");
    setResizeStartX(event.clientX);
    setResizeStartWidth(inputWidth);
  };

  const startMemoResize = (event: React.MouseEvent<HTMLDivElement>) => {
    setResizeTarget("memo");
    setResizeStartX(event.clientX);
    setResizeStartWidth(memoWidth);
  };

  const createShareUrl = async () => {
    setShareError("");

    const url = buildShareUrl();

    if (url.length > MAX_SHARE_URL_LENGTH) {
      setShareUrl("");
      setShowShare(false);
      setShareError(
        `共有URLが長すぎます。現在 ${url.length} 文字です。${MAX_SHARE_URL_LENGTH} 文字以内にしてください。`
      );
      return;
    }

    setShareUrl(url);
    setShowShare(true);

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // コピー失敗時もURL表示はする
    }
  };

  const toggleShare = () => {
    if (showShare) {
      setShowShare(false);
      return;
    }

    createShareUrl();
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
  };

  const clearMarkdown = () => {
    setMarkdown(defaultMarkdown);
    setStarredCardIds([]);
    setSelectedCardId(null);
  };

  const renderColumn = (cards: Card[]) => (
    <section className="space-y-6">
      {cards.map((card) => (
        <CardView
          key={card.id}
          card={card}
          selected={selectedCardId === card.id}
          starred={starredCardIds.includes(card.id)}
          onClick={() => setSelectedCardId(card.id)}
          onToggleStar={() => toggleStar(card.id)}
        />
      ))}
    </section>
  );

  const currentShareDataLength =
    markdown.length + memo.length + starredCardIds.join("").length;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="flex flex-col gap-3 border-b border-neutral-800 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          <h1 className="text-xl font-bold tracking-wide text-neutral-100">
            ThoughtDeck
          </h1>
          <p className="text-sm tracking-wider text-neutral-400">
            Think. Deck. Share.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={toggleShare}
            className={[
              "whitespace-nowrap rounded-lg border px-4 py-2 text-sm transition",
              showShare
                ? "border-blue-500 bg-blue-500/10 text-blue-300"
                : "border-neutral-600 text-neutral-100 hover:border-blue-500 hover:text-blue-300",
            ].join(" ")}
          >
            {showShare ? "共有を閉じる" : "共有URL / QR"}
          </button>

          {!showInput && (
            <button
              onClick={() => setShowInput(true)}
              className="whitespace-nowrap rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:border-blue-400 hover:text-blue-300"
            >
              MD入力を開く
            </button>
          )}

          {!showMemo && (
            <button
              onClick={() => setShowMemo(true)}
              className="whitespace-nowrap rounded-lg border border-orange-700 px-4 py-2 text-sm text-neutral-200 hover:border-orange-400 hover:text-orange-300"
            >
              メモを開く
            </button>
          )}
        </div>
      </header>

      {shareError && (
        <div className="border-b border-red-900 bg-red-950/40 px-6 py-3 text-sm text-red-300">
          {shareError}
        </div>
      )}

      {showShare && shareUrl && (
        <div className="border-b border-neutral-800 bg-neutral-950 px-4 py-5 md:px-6">
          <div className="grid gap-5 md:grid-cols-[200px_1fr]">
            <div>
              <p className="mb-2 text-center text-sm font-bold text-neutral-200 md:text-left">
                {boardTitle}
              </p>
              <div className="flex justify-center md:justify-start">
                <div className="inline-block rounded-xl bg-white p-2">
                  <QRCodeSVG value={shareUrl} size={170} />
                </div>
              </div>
            </div>

            <div>
              <h2 className="mb-2 font-bold text-blue-400">共有URL</h2>
              <p className="mb-2 text-sm text-neutral-400">
                このURLを開くと、現在のカード・授業メモ・重要マークが復元されます。
              </p>
              <p className="mb-3 rounded-lg border border-yellow-700/60 bg-yellow-950/30 px-3 py-2 text-xs leading-5 text-yellow-200">
                注意：共有URLには入力内容が含まれます。個人情報・社外秘情報・他人の発言は入力しないでください。
                このURLを知っている人は内容を閲覧できます。
              </p>

              <textarea
                value={shareUrl}
                readOnly
                className="h-24 w-full resize-none rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-xs leading-5 text-neutral-300"
              />

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={createShareUrl}
                  className="whitespace-nowrap rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-blue-400 hover:text-blue-300"
                >
                  更新
                </button>

                <button
                  onClick={copyShareUrl}
                  className="whitespace-nowrap rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-blue-400 hover:text-blue-300"
                >
                  URLをコピー
                </button>

                <button
                  onClick={() => setShowShare(false)}
                  className="whitespace-nowrap rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
                >
                  閉じる
                </button>

                <span className="text-xs text-neutral-500">
                  入力データ量：{currentShareDataLength} 文字 / URL上限目安：
                  {MAX_SHARE_URL_LENGTH} 文字
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={[
          "flex min-h-[calc(100vh-96px)] flex-col md:min-h-[calc(100vh-73px)] md:flex-row",
          resizeTarget ? "select-none" : "",
        ].join(" ")}
      >
        {showInput && (
          <>
            <aside
              className="w-full shrink-0 border-b border-neutral-800 p-4 md:w-[var(--input-width)] md:border-b-0 md:border-r md:p-5"
              style={
                {
                  "--input-width": `${inputWidth}px`,
                } as CSSProperties
              }
            >
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-bold text-blue-400">Markdown入力</h2>

                  <button
                    onClick={() => setShowInput(false)}
                    className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-blue-300"
                  >
                    ×
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={addTemplate}
                    className="whitespace-nowrap rounded border border-blue-500/60 px-2.5 py-1 text-xs text-blue-300 hover:bg-blue-500/10"
                  >
                    ＋テンプレ
                  </button>

                  <button
                    onClick={() => {
                      setMarkdown(demoMarkdown);
                      setStarredCardIds([]);
                      setSelectedCardId(null);
                    }}
                    className="whitespace-nowrap rounded px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-blue-300"
                  >
                    デモ
                  </button>

                  <button
                    onClick={clearMarkdown}
                    className="whitespace-nowrap rounded px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-blue-300"
                  >
                    クリア
                  </button>
                </div>
              </div>

              <textarea
                ref={markdownRef}
                value={markdown}
                onChange={(event) => setMarkdown(event.target.value)}
                placeholder="# タイトルを入力"
                className="h-72 w-full resize-none rounded-xl border border-neutral-600 bg-neutral-900 p-4 font-mono text-sm leading-7 text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 md:h-[calc(100vh-360px)]"
              />

              <div className="mt-4">
                <WritingGuide />
              </div>
            </aside>

            <ResizeHandle onMouseDown={startInputResize} />
          </>
        )}

        <section className="min-w-0 flex-1 overflow-auto p-4 md:p-8">
          <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/60 px-5 py-4">
            <p className="text-xs text-neutral-500">メモタイトル</p>
            <h2 className="mt-1 text-xl font-bold text-neutral-100">
              {boardTitle}
            </h2>
          </div>

          {cards.length === 0 ? (
            <div className="flex h-full min-h-64 items-center justify-center text-center text-neutral-500">
              <div>
                <p className="mb-2 text-lg font-bold text-blue-400">
                  テンプレを追加するとカードが表示されます
                </p>
                <p className="text-sm">
                  左の入力欄に、# タイトル / ### 見出し / @area /
                  ==マーカー== を使って書いてください。
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {renderColumn(leftCards)}
              {renderColumn(centerCards)}
              {renderColumn(rightCards)}
            </div>
          )}
        </section>

        {showMemo && (
          <>
            <ResizeHandle onMouseDown={startMemoResize} />

            <aside
              className="w-full shrink-0 border-t border-neutral-800 p-4 md:w-[var(--memo-width)] md:border-l md:border-t-0 md:p-5"
              style={
                {
                  "--memo-width": `${memoWidth}px`,
                } as CSSProperties
              }
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold text-orange-400">授業メモ</h2>

                <div className="flex gap-2">
                  <button
                    onClick={() => setMemo("")}
                    className="whitespace-nowrap rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-orange-300"
                  >
                    クリア
                  </button>

                  <button
                    onClick={() => setShowMemo(false)}
                    className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-orange-300"
                  >
                    ×
                  </button>
                </div>
              </div>

              <textarea
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="ここに授業中の気づき・発言メモを書く..."
                className="h-64 w-full resize-none rounded-xl border border-orange-700/70 bg-neutral-900 p-4 text-sm leading-7 text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 md:h-[calc(100vh-175px)]"
              />

              <p className="mt-2 text-right text-xs text-neutral-500">
                文字数：{memo.length}
              </p>
            </aside>
          </>
        )}
      </div>
    </main>
  );
}