"use client";

import { useEffect, useMemo, useState } from "react";

type Area = "left" | "center" | "right";

type Card = {
  id: string;
  title: string;
  area: Area;
  lines: string[];
};

type ResizeTarget = "input" | "memo" | null;

const sampleMarkdown = `
### 市場・業界
@area: left

米国では==75%==が視力矯正を必要とする。
市場規模は==40億ドル==。
寡占市場で、大手4社が強い。

### 顧客
@area: left

初期顧客は平均28歳。
女性比率は==70%==。
SNS・モバイル経由が多い。

### 価値提案
@area: center

低価格・サブスク・オンライン直販。
従来の面倒な購買体験を変えた。

### ビジネスモデル
@area: center

D2Cモデル。
中間コストを削減。
オンライン販売に特化。

### 成果
@area: right

創業5年で==売上10倍==。
顧客満足度が高い。
ブランド認知が拡大。

### 課題・リスク
@area: right

品質・規制・CACが課題。
ブランドの持続的な差別化が必要。
`;

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
        (line) => !line.startsWith("### ") && !line.startsWith("@area:")
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
  onClick,
}: {
  card: Card;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full rounded-xl border p-5 text-left transition",
        "bg-neutral-900 hover:bg-neutral-800/80",
        selected
          ? "border-blue-400 ring-1 ring-blue-400"
          : "border-neutral-600",
      ].join(" ")}
    >
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
    </button>
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
      className="w-1 cursor-col-resize bg-neutral-800 hover:bg-blue-400"
    />
  );
}

export default function Home() {
  const [markdown, setMarkdown] = useState(sampleMarkdown);
  const [memo, setMemo] = useState("");
  const [showInput, setShowInput] = useState(true);
  const [showMemo, setShowMemo] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const [inputWidth, setInputWidth] = useState(320);
  const [memoWidth, setMemoWidth] = useState(340);

  const [resizeTarget, setResizeTarget] = useState<ResizeTarget>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  const cards = useMemo(() => parseCards(markdown), [markdown]);

  const leftCards = cards.filter((card) => card.area === "left");
  const centerCards = cards.filter((card) => card.area === "center");
  const rightCards = cards.filter((card) => card.area === "right");

  useEffect(() => {
    if (!resizeTarget) return;

    const onMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - resizeStartX;

      if (resizeTarget === "input") {
        setInputWidth(Math.min(Math.max(resizeStartWidth + delta, 240), 560));
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

  const renderColumn = (cards: Card[]) => (
    <section className="space-y-6">
      {cards.map((card) => (
        <CardView
          key={card.id}
          card={card}
          selected={selectedCardId === card.id}
          onClick={() => setSelectedCardId(card.id)}
        />
      ))}
    </section>
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">学習メモアプリ</h1>
          <p className="text-sm text-neutral-400">
            Markdownからファクトカードを表示し、授業メモを書く
          </p>
        </div>

        <div className="flex gap-3">
          {!showInput && (
            <button
              onClick={() => setShowInput(true)}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:border-blue-400 hover:text-blue-300"
            >
              MD入力を開く
            </button>
          )}

          {!showMemo && (
            <button
              onClick={() => setShowMemo(true)}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:border-blue-400 hover:text-blue-300"
            >
              メモを開く
            </button>
          )}
        </div>
      </header>

      <div
        className={[
          "flex min-h-[calc(100vh-73px)]",
          resizeTarget ? "select-none" : "",
        ].join(" ")}
      >
        {showInput && (
          <>
            <aside
              className="shrink-0 border-r border-neutral-800 p-5"
              style={{ width: inputWidth }}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold text-blue-400">Markdown入力</h2>
                <button
                  onClick={() => setShowInput(false)}
                  className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-blue-300"
                  title="MD入力を閉じる"
                >
                  ×
                </button>
              </div>

              <textarea
                value={markdown}
                onChange={(event) => setMarkdown(event.target.value)}
                className="h-[calc(100vh-150px)] w-full resize-none rounded-xl border border-neutral-600 bg-neutral-900 p-4 font-mono text-sm leading-6 text-neutral-200 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </aside>

            <ResizeHandle onMouseDown={startInputResize} />
          </>
        )}

        <section className="min-w-0 flex-1 overflow-auto p-8">
          <div className="grid grid-cols-3 gap-6">
            {renderColumn(leftCards)}
            {renderColumn(centerCards)}
            {renderColumn(rightCards)}
          </div>
        </section>

        {showMemo && (
          <>
            <ResizeHandle onMouseDown={startMemoResize} />

            <aside
              className="shrink-0 border-l border-neutral-800 p-5"
              style={{ width: memoWidth }}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold text-blue-400">授業メモ</h2>
                <button
                  onClick={() => setShowMemo(false)}
                  className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-blue-300"
                  title="メモを閉じる"
                >
                  ×
                </button>
              </div>

              <textarea
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="ここに授業中の気づき・発言メモを書く..."
                className="h-[calc(100vh-175px)] w-full resize-none rounded-xl border border-neutral-600 bg-neutral-900 p-4 text-sm leading-7 text-neutral-200 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
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