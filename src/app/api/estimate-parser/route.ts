import { NextRequest, NextResponse } from "next/server";
import { PdfReader } from "pdfreader";

export const runtime = "nodejs";

type PdfToken = {
  text: string;
  x: number;
  y: number;
  page: number;
};

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

async function readPdfTokens(buffer: Buffer): Promise<PdfToken[]> {
  return new Promise((resolve, reject) => {
    const tokens: PdfToken[] = [];
    let currentPage = 1;

    new PdfReader().parseBuffer(buffer, (err: any, item: any) => {
      if (err) return reject(err);

      if (!item) {
        resolve(tokens);
        return;
      }

      if (item.page) {
        currentPage = item.page;
        return;
      }

      if (item.text) {
        tokens.push({
          text: String(item.text),
          x: Number(item.x ?? 0),
          y: Number(item.y ?? 0),
          page: currentPage,
        });
      }
    });
  });
}

function groupLinesByPage(tokens: PdfToken[]) {
  const byPage = new Map<number, PdfToken[]>();

  for (const t of tokens) {
    if (!byPage.has(t.page)) byPage.set(t.page, []);
    byPage.get(t.page)!.push(t);
  }

  const result = new Map<number, Array<{ y: number; cells: PdfToken[] }>>();

  for (const [page, pageTokens] of byPage.entries()) {
    const lines: Array<{ y: number; cells: PdfToken[] }> = [];

    for (const token of pageTokens) {
      const found = lines.find((l) => Math.abs(l.y - token.y) < 0.35);
      if (found) {
        found.cells.push(token);
      } else {
        lines.push({ y: token.y, cells: [token] });
      }
    }

    for (const line of lines) {
      line.cells.sort((a, b) => a.x - b.x);
    }

    lines.sort((a, b) => a.y - b.y);
    result.set(page, lines);
  }

  return result;
}

function parsePageText(lines: Array<{ y: number; cells: PdfToken[] }>) {
  return lines
    .map((line) => line.cells.map((c) => normalizeSpaces(c.text)).join(" "))
    .filter(Boolean)
    .join("\n");
}

function extractWorkNameOptions(firstPageTokens: PdfToken[]) {
  const lines: Array<{ y: number; cells: PdfToken[] }> = [];

  for (const token of firstPageTokens) {
    const found = lines.find((l) => Math.abs(l.y - token.y) < 0.35);
    if (found) {
      found.cells.push(token);
    } else {
      lines.push({ y: token.y, cells: [token] });
    }
  }

  for (const line of lines) {
    line.cells.sort((a, b) => a.x - b.x);
  }
  lines.sort((a, b) => a.y - b.y);

  // 헤더 줄 찾기
  let headerLine: { y: number; cells: PdfToken[] } | null = null;

  for (const line of lines) {
    const joined = line.cells.map((c) => normalizeSpaces(c.text)).join(" ");
    if (
      /N\s*O/i.test(joined) &&
      /시\s*공\s*명/.test(joined) &&
      /금\s*액/.test(joined)
    ) {
      headerLine = line;
      break;
    }
  }

  if (!headerLine) return [];

  const noCell =
    headerLine.cells.find((c) => /N\s*O/i.test(normalizeSpaces(c.text))) ?? null;

  const amountCell =
    headerLine.cells.find((c) => /금\s*액/.test(normalizeSpaces(c.text))) ?? null;

  if (!noCell || !amountCell) return [];

  const headerY = headerLine.y;

  const results: string[] = [];

  for (const line of lines) {
    if (line.y <= headerY + 0.5) continue;

    const cells = line.cells.map((c) => ({
      ...c,
      text: normalizeSpaces(c.text),
    }));

    // 번호 칸 존재 여부
    const hasNo = cells.some(
      (c) => c.x >= noCell.x - 0.5 && c.x <= noCell.x + 1.2 && /^\d+$/.test(c.text)
    );

    // 금액 칸 존재 여부
    const hasAmount = cells.some(
      (c) =>
        c.x >= amountCell.x - 1.5 &&
        c.x <= amountCell.x + 2 &&
        /^[\d,]+$/.test(c.text)
    );

    // 번호도 금액도 없는 줄은 공종 행이 아님
    if (!hasNo || !hasAmount) continue;

    // 시공명은 실제 로그상 x≈4.287 부근
    // 설명문은 x≈9 이상이라서 잘라낸다
    const workNameCells = cells.filter(
      (c) =>
        c.x >= noCell.x + 0.8 &&
        c.x <= noCell.x + 5.5 &&
        c.text &&
        !/^\d+$/.test(c.text) &&
        !/^[\d,]+$/.test(c.text) &&
        !/소\s*계|합\s*계|총\s*합\s*계|기업이윤/i.test(c.text)
    );

    const workName = workNameCells.map((c) => c.text).join(" ").trim();

    if (workName) {
      results.push(workName);
    }
  }

  return Array.from(new Set(results));
}

function extractUnitOptions(detailText: string) {
  const lines = detailText
    .split("\n")
    .map(normalizeSpaces)
    .filter(Boolean);

  const units: string[] = [];

  for (const line of lines) {
    const m = line.match(/^(.*)\s+([가-힣A-Za-z0-9*\/.]+)\s+([\d.,]+)\s+([\d,]+)\s+V\s+([\d,]+)$/);
    if (!m) continue;

    const unit = normalizeSpaces(m[2]);
    if (!unit) continue;

    if (
      unit !== "NO" &&
      unit !== "금액" &&
      unit !== "단가" &&
      unit !== "수량"
    ) {
      units.push(unit);
    }
  }

  return Array.from(new Set(units));
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { message: "PDF 파일이 필요합니다." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const tokens = await readPdfTokens(buffer);
    const linesByPage = groupLinesByPage(tokens);

    const firstPageText = parsePageText(linesByPage.get(1) ?? []);
    const firstPageTokens = tokens.filter((t) => t.page === 1);

    const detailPages = Array.from(linesByPage.keys())
      .sort((a, b) => a - b)
      .filter((page) => page >= 2)
      .map((page) => parsePageText(linesByPage.get(page) ?? []))
      .join("\n");

    const workNameOptions = extractWorkNameOptions(firstPageTokens);
    const unitOptions = extractUnitOptions(detailPages);

    console.log("WORK NAME OPTIONS:", workNameOptions);
    console.log("UNIT OPTIONS:", unitOptions);
    console.log(
  firstPageTokens.map((t) => ({
    text: t.text,
    x: t.x,
    y: t.y,
  }))
);

    return NextResponse.json({
      ok: true,
      workNameOptions,
      unitOptions,
      debugFirstPageText: firstPageText,
    });
  } catch (err: any) {
    console.error("estimate-parser error:", err);
    return NextResponse.json(
      { message: err?.message || "견적서 파싱 실패" },
      { status: 500 }
    );
  }
}