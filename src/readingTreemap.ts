import type { HierarchyRectangularNode } from 'd3-hierarchy';

export function readingLabelBox(width: number, height: number) {
  const fontSize = width > 200 && height > 100 ? 19 : width > 125 && height > 70 ? 16 : height < 34 || width < 58 ? 11 : 13;
  const padding = height < 40 ? 6 : width > 100 ? 12 : 7;
  const maxLines = width < 32 || height < 20 ? 0 : Math.max(0, Math.min(3, 1 + Math.floor((height - padding - fontSize * .8 - 4) / (fontSize * 1.17))));
  return { fontSize, padding, maxLines };
}

// Choose horizontal rows once from the reference values. Subsequent years keep
// the same neighbours, while both row heights and cell widths follow real values.
export function readingTreemap<Datum>(wordWidths: (datum: Datum) => number[]) {
  let rows: HierarchyRectangularNode<Datum>[][] | undefined;
  return (parent: HierarchyRectangularNode<Datum>, x0: number, y0: number, x1: number, y1: number) => {
    const nodes = parent.children ?? [], width = x1 - x0, height = y1 - y0;
    if (!rows) {
      const labels = nodes.map(node => wordWidths(node.data));
      const sums = [0];
      nodes.forEach(node => sums.push(sums.at(-1)! + (node.value ?? 0)));
      const cost = new Array<number>(nodes.length + 1).fill(Infinity), next = new Array<number>(nodes.length);
      cost[nodes.length] = 0;
      for (let i = nodes.length - 1; i >= 0; --i) {
        for (let j = i + 1; j <= nodes.length; ++j) {
          const rowValue = sums[j] - sums[i], h = height * rowValue / sums.at(-1)!;
          let score = cost[j];
          for (let k = i; k < j; ++k) {
            const w = width * (nodes[k].value ?? 0) / rowValue;
            score += readingCost(labels[k], w - 2, h - 2);
          }
          if (score < cost[i]) { cost[i] = score; next[i] = j; }
        }
      }
      rows = [];
      for (let i = 0; i < nodes.length; i = next[i]) rows.push(nodes.slice(i, next[i]));
    }
    const total = parent.value ?? 0;
    let y = y0;
    for (const row of rows) {
      const value = row.reduce((sum, node) => sum + (node.value ?? 0), 0);
      const bottom = total ? y + height * value / total : y;
      let x = x0;
      for (const node of row) {
        node.x0 = x; node.y0 = y;
        node.x1 = x = value ? x + width * (node.value ?? 0) / value : x;
        node.y1 = bottom;
      }
      y = bottom;
    }
  };
}

function readingCost(words: number[], cellWidth: number, cellHeight: number) {
  const { fontSize, padding, maxLines } = readingLabelBox(cellWidth, cellHeight);
  const width = cellWidth - padding * 2, height = cellHeight - padding * 2;
  if (width <= 0 || height <= 0) return 1000;
  const scaledWords = words.map(word => word * fontSize / 13);
  let line = 1, used = 0, visible = 0;
  const total = scaledWords.reduce((sum, word) => sum + word, 0);
  for (const word of scaledWords) {
    if (used && used + 3.5 + word > width) { ++line; used = 0; }
    if (line <= maxLines) visible += Math.min(word, width);
    used += (used ? 3.5 : 0) + word;
  }
  const missing = total ? 1 - visible / total : 0;
  // Readable wrapped labels can use square/portrait cells; otherwise favour
  // landscape shapes. Very shallow strips are expensive even if they are wide.
  const shape = Math.log(cellWidth / cellHeight / 1.7);
  return 10 * missing + 10 * missing * missing + shape * shape * (missing < .01 ? .3 : .9) + (maxLines < 1 ? 30 : 0);
}
