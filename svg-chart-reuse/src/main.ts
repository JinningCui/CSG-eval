import { Plot } from './plot';
import { Axis, Legend } from './scaleGuide';
const svgs = import.meta.glob(
  '../infer_results/*.txt',
  { eager: true, as: 'raw' }
);

const downloadInfo: { filename: string, content: string }[] = [];

const downloadBtn = document.createElement('button');
downloadBtn.textContent = 'Download SVGs';
document.body.appendChild(downloadBtn);
downloadBtn.addEventListener('click', async () => {
  for (const { filename, content } of downloadInfo) {
    const link = document.createElement('a');
    link.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
});

for (const path in svgs) {
  const svg = svgs[path];
  const filename = path.split('/').pop()!.split('.')[0] + ".svg";
  const container = document.createElement('div');
  container.setAttribute('data-file', filename); // eval: identify source chart
  container.innerHTML = svg;
  document.body.appendChild(container);
  setTimeout(() => {
    console.log(path);
    preprocess(container);
    downloadInfo.push({ filename, content: container.innerHTML });
    console.log("___________________________");
  }, 0);
}

function preprocess(container: HTMLElement) {
  const svg = container.querySelector('svg');
  if (!svg) {
    console.error('No SVG element found in the container.');
    return;
  }

  pushDownTransforms(svg);
  removeClipPaths(svg);
  flattenGroups(svg);
  removeClassAndStyle(svg);
  removeInvisibleElements(svg);

  const plot = inferContent(svg);
  plot.addSVGAttributes();
}

function pushDownTransforms(element: Element, x: number = 0, y: number = 0) {
  const transform = element.getAttribute('transform');
  if (element.tagName == "g" || element.tagName == "svg") {
    // should recursively push down transforms
    if (transform) {
      const regex = /translate\([^)]*\)/;
      if (!regex.test(transform)) {
        console.error('Unsupported transform:', transform);
        return;
      }
      const { x: currentX, y: currentY } = parseTranslate(transform);
      const newX = currentX + x;
      const newY = currentY + y;
      for (const child of element.children) {
        pushDownTransforms(child, newX, newY);
      }
      element.removeAttribute('transform');
    } else {
      for (const child of element.children) {
        pushDownTransforms(child, x, y);
      }
    }
  } else {
    // should apply transforms to the element
    if (x == 0 && y == 0) {
      return;
    }
    if (!transform) {
      element.setAttribute('transform', `translate(${x} ${y})`);
      return;
    }
    if (transform.startsWith('translate')) {
      const { x: currentX, y: currentY } = parseTranslate(transform);
      const newX = currentX + x;
      const newY = currentY + y;
      const newTransform = transform.replace(/translate\([^)]*\)/, `translate(${newX} ${newY})`);
      element.setAttribute('transform', newTransform);
    } else {
      element.setAttribute('transform', `translate(${x} ${y})` + transform);
    }
  }
}

function parseTranslate(translate: string) {
  const regex = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/;
  const match = translate.match(regex);
  if (match) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    return { x, y };
  } else {
    const regexSingle = /translate\(([-\d.]+)\)/;
    const matchSingle = translate.match(regexSingle);
    if (matchSingle) {
      const x = parseFloat(matchSingle[1]);
      return { x, y: 0 };
    } else {
      console.error('Invalid translate transform:', translate);
      return { x: 0, y: 0 };
    }
  }
}

function removeClipPaths(svg: SVGSVGElement) {
  const clipPaths = svg.querySelectorAll('clipPath');
  clipPaths.forEach(clipPath => {
    const id = clipPath.getAttribute('id');
    if (id) {
      const elementsUsingClipPath = svg.querySelectorAll(`[clip-path="url(#${id})"]`);
      elementsUsingClipPath.forEach(el => {
        el.removeAttribute('clip-path');
      });
    }
    clipPath.remove();
  });
  const defses = svg.querySelectorAll('defs');
  for (const defs of defses) {
    if (defs.children.length === 0) {
      defs.remove();
    }
  }

}

function flattenGroups(svg: SVGSVGElement) {
  const elements: Element[] = [];
  function traverse(element: Element) {
    if (element.tagName !== 'g') {
      elements.push(element);
    } else {
      for (const child of element.children) {
        traverse(child);
      }
    }
  }
  for (const child of svg.children) {
    traverse(child);
  }
  // remove all children and append flattened elements
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
  elements.forEach(el => svg.appendChild(el));
}

function removeClassAndStyle(svg: SVGSVGElement) {
  const elements = svg.querySelectorAll('*');
  elements.forEach(el => {
    el.removeAttribute('class');
    el.removeAttribute('style');
  });
}

function removeInvisibleElements(svg: SVGSVGElement) {
  const rects = svg.querySelectorAll('rect');
  for (const rect of rects) {
    const fill = window.getComputedStyle(rect).fill;
    const stroke = window.getComputedStyle(rect).stroke;
    if (fill == 'none' && stroke == 'none') {
      rect.remove();
    }
    if (fill == 'rgb(255, 255, 255)' && stroke == 'none') {
      rect.remove();
      // todo: make sure the rect is not covering any other elements
    }
  }

  const lines = svg.querySelectorAll('line');
  for (const line of lines) {
    const stroke = window.getComputedStyle(line).stroke;
    if (stroke == 'none') {
      line.remove();
    }
  }

  const paths = svg.querySelectorAll('path');
  for (const path of paths) {
    const fill = window.getComputedStyle(path).fill;
    const stroke = window.getComputedStyle(path).stroke;
    if (fill == 'none' && stroke == 'none') {
      path.remove();
    }
  }
}

export type TextWithCoordinates = { element: SVGTextElement, coordinates: any };
export type TickWithCoordinates = { element: SVGGraphicsElement, coordinates: any };
export type LegendMarkWithCoordinates = { element: SVGGraphicsElement, coordinates: any };
export type ElementWithCoordinates = { element: Element, coordinates: any };
export type AxisMatchResult = { text: TextWithCoordinates[], tick: TickWithCoordinates[] };
export type LegendMatchResult = { text: TextWithCoordinates[], mark: LegendMarkWithCoordinates[][] };
export type Boundary = { xMin: number, xMax: number, yMin: number, yMax: number };
function inferContent(svg: SVGSVGElement) {
  const yAlignThreshold = 1 // threshold to determine if texts are in the same row
  const xAlignThreshold = 1 // threshold to determine if texts are in the same column
  const tickLengthThreshold = 10; // threshold to determine if a line is a tick
  const tickLabelOffsetThreshold = 5; // threshold to determine if a tick label is close to a tick
  const tickLabelAlignThreshold = 5; // threshold to determine if a tick label is aligned with a tick
  const legendMarkSizeThreshold = 30; // threshold to determine if a element is a legend mark
  const legendOffsetXThreshold = 20; // threshold to determine if a legend mark is close to a text
  const legendOffsetYThreshold = 20; // threshold to determine if a legend mark is close to a text
  const backgroundSizeRatioThreshold = 0.95; // minimum ratio of background size to graph size
  const backgroundAspectRatioThreshold = 2; // maximum aspect ratio of background
  const graphSize = 512; // assume graph size is 512x512
  const gridLengthRatioThreshold = 0.9; // minimum ratio of grid length to graph size

  const textLists = svg.querySelectorAll('text');
  const texts = Array.from(textLists).map(
    text => ({ element: text, coordinates: getElementCoordinates(svg, text) }));

  for (const text of texts) {
    const typeHash = getTextTypeHash(svg, text.element);
    console.log(typeHash);
  }

  const textGroups = groupElementsByType(texts,
    (text: TextWithCoordinates) => getTextTypeHash(svg, text.element)
  );

  // find text rows and columns
  const textRows: TextWithCoordinates[][] = [];
  const textColumns: TextWithCoordinates[][] = [];
  for (const group of textGroups.values()) {
    const rows = groupByAttribute(group, 'y', yAlignThreshold);
    textRows.push(...rows);
    const columns1 = groupByAttribute(group, 'xMin', xAlignThreshold);
    const columns2 = groupByAttribute(group, 'xMax', xAlignThreshold);
    const columns = conbineGroups(columns1, columns2);
    textColumns.push(...columns);
  }

  const { tickXs, tickYs } = findTicks(svg, tickLengthThreshold);
  const tickXGroups = groupElementsByType(tickXs, getTickTypeHash);
  const tickYGroups = groupElementsByType(tickYs, getTickTypeHash);

  // find tick rows and columns
  const tickRows: TickWithCoordinates[][] = [];
  const tickColumns: TickWithCoordinates[][] = [];
  for (const group of tickXGroups.values()) {
    const rows = groupByAttribute(group, 'y', yAlignThreshold);
    tickRows.push(...rows);
  }
  for (const group of tickYGroups.values()) {
    const columns = groupByAttribute(group, 'x', xAlignThreshold);
    tickColumns.push(...columns);
  }

  // find legend marks
  const legendMarks = findLegendMarks(svg, legendMarkSizeThreshold, tickLengthThreshold);
  console.log("legend marks", legendMarks);
  const legendMarkGroups = groupElementsByType(legendMarks, getLegendMarkTypeHash);

  // if marks are identical, they are not legend marks
  for (const key of legendMarkGroups.keys()) {
    const group = legendMarkGroups.get(key)!;
    let identical = false;
    for (const mark1 of group) {
      const fill1 = window.getComputedStyle(mark1.element).fill;
      const stroke1 = window.getComputedStyle(mark1.element).stroke;
      const strokeWidth1 = window.getComputedStyle(mark1.element).strokeWidth;
      for (const mark2 of group) {
        if (mark1.element === mark2.element) {
          continue;
        }
        const fill2 = window.getComputedStyle(mark2.element).fill;
        const stroke2 = window.getComputedStyle(mark2.element).stroke;
        const strokeWidth2 = window.getComputedStyle(mark2.element).strokeWidth;
        if (fill1 === fill2 && stroke1 === stroke2 && strokeWidth1 === strokeWidth2) {
          identical = true;
          break;
        }
      }
      if (identical) {
        break;
      }
    }
    if (identical) {
      legendMarkGroups.delete(key);
    }
  }

  const legendRows: LegendMarkWithCoordinates[][] = [];
  const legendColumns: LegendMarkWithCoordinates[][] = [];
  for (const group of legendMarkGroups.values()) {
    const rows = groupByAttribute(group, 'y', yAlignThreshold);
    legendRows.push(...rows);
    const columns = groupByAttribute(group, 'x', xAlignThreshold);
    legendColumns.push(...columns);
  }

  // sort by position
  for (const row of textRows) {
    row.sort((a, b) => a.coordinates.x - b.coordinates.x);
  }
  for (const column of textColumns) {
    column.sort((a, b) => b.coordinates.y - a.coordinates.y);
  }
  for (const row of tickRows) {
    row.sort((a, b) => a.coordinates.x - b.coordinates.x);
  }
  for (const column of tickColumns) {
    column.sort((a, b) => b.coordinates.y - a.coordinates.y);
  }
  for (const row of legendRows) {
    row.sort((a, b) => a.coordinates.x - b.coordinates.x);
  }
  for (const column of legendColumns) {
    column.sort((a, b) => b.coordinates.y - a.coordinates.y);
  }
  console.log("text", textRows, textColumns)
  console.log("tick", tickRows, tickColumns)
  console.log("legend", legendRows, legendColumns);

  // match text, ticks and legend marks
  const { axisMatched: axisMatchedX, legendMatched: legendMatchedX, noMatchedText: noMatchedTextX }
    = matchTextWithTicksAndLegendMarks(
      textRows, tickRows, legendRows,
      tickLabelAlignThreshold, tickLabelOffsetThreshold,
      legendOffsetXThreshold, legendOffsetYThreshold
    );

  const { axisMatched: axisMatchedY, legendMatched: legendMatchedY, noMatchedText: noMatchedTextY }
    = matchTextWithTicksAndLegendMarks(
      textColumns, tickColumns, legendColumns,
      tickLabelOffsetThreshold, tickLabelAlignThreshold,
      legendOffsetXThreshold, legendOffsetYThreshold
    );

  console.log("axis matches", axisMatchedX, axisMatchedY);
  console.log("legend matches", legendMatchedX, legendMatchedY);
  console.log("no matched text", noMatchedTextX, noMatchedTextY);


  const background = getBackground(
    svg,
    backgroundSizeRatioThreshold,
    backgroundAspectRatioThreshold,
    graphSize
  );

  console.log("background", background);

  const excludedElements = getExcludedElements(background, axisMatchedX, axisMatchedY, legendMatchedX, legendMatchedY);

  const plotBoundaries = getPlotBoudaries(svg, excludedElements);

  let xAxis: Axis | null = null;
  let yAxis: Axis | null = null;
  let legend: Legend | null = null;

  if (axisMatchedX.length > 0) {
    const labels = axisMatchedX[0].text;
    const ticks = axisMatchedX[0].tick;
    xAxis = new Axis('x', labels, ticks);
  } else {
    const axisXCandidates = noMatchedTextX.filter(
      (row) => {
        for (const text of row) {
          if (inside(text.coordinates, plotBoundaries)) {
            return false;
          }
        }
        return true;
      }
    )
    if (axisXCandidates.length > 0) {
      if (axisXCandidates.length > 1) {
        console.warn("multiple x axis candidates found", axisXCandidates);
      }
      xAxis = new Axis('x', axisXCandidates[0]);
    }
  }

  if (axisMatchedY.length > 0) {
    const labels = axisMatchedY[0].text;
    const ticks = axisMatchedY[0].tick;
    yAxis = new Axis('y', labels, ticks);
  } else {
    const axisYCandidates = noMatchedTextY.filter(
      (column) => {
        for (const text of column) {
          if (inside(text.coordinates, plotBoundaries)) {
            return false;
          }
          return true;
        }
      }
    )
    if (axisYCandidates.length > 0) {
      if (axisYCandidates.length > 1) {
        console.warn("multiple y axis candidates found", axisYCandidates);
      }
      yAxis = new Axis('y', axisYCandidates[0]);
    }
  }

  if (legendMatchedX.length > 0) {
    const labels = legendMatchedX[0].text;
    const marks = legendMatchedX[0].mark;
    legend = new Legend(labels, marks);
  } else if (legendMatchedY.length > 0) {
    const labels = legendMatchedY[0].text;
    const marks = legendMatchedY[0].mark;
    legend = new Legend(labels, marks);
  }

  if (xAxis) {
    xAxis.addTextToExclusionSet(excludedElements);
  }
  if (yAxis) {
    yAxis.addTextToExclusionSet(excludedElements);
  }
  if (legend) {
    legend.addTextToExclusionSet(excludedElements);
  }

  console.log("x axis", xAxis);
  console.log("y axis", yAxis);
  console.log("legend", legend);

  const { gridX, gridY, domainX, domainY, markGroups, labels, titles } = classfyRestElements(svg, excludedElements, plotBoundaries, gridLengthRatioThreshold);
  console.log("grid", gridX, gridY);
  console.log("domain", domainX, domainY);
  console.log("mark groups", markGroups);
  console.log("labels", labels);
  console.log("titles", titles);

  return new Plot(titles, markGroups, labels, gridX, gridY, domainX, domainY, xAxis, yAxis, legend, background, svg)
}

function getElementCoordinates(svg: SVGSVGElement, element: SVGGraphicsElement) {
  const bBox = element.getBBox();
  const svgCtm = svg.getScreenCTM();
  const elementCtm = element.getScreenCTM();
  // console.log(svgCtm, elementCtm);
  if (!svgCtm || !elementCtm) {
    return {
      x: bBox.x + bBox.width / 2,
      y: bBox.y + bBox.height / 2,
      xMin: bBox.x,
      xMax: bBox.x + bBox.width,
      yMin: bBox.y,
      yMax: bBox.y + bBox.height
    };
  }
  const ctm = svgCtm.inverse().multiply(elementCtm);
  const corners = [
    new DOMPoint(bBox.x, bBox.y).matrixTransform(ctm),
    new DOMPoint(bBox.x + bBox.width, bBox.y).matrixTransform(ctm),
    new DOMPoint(bBox.x, bBox.y + bBox.height).matrixTransform(ctm),
    new DOMPoint(bBox.x + bBox.width, bBox.y + bBox.height).matrixTransform(ctm),
  ];

  const xMin = Math.min(...corners.map(c => c.x));
  const xMax = Math.max(...corners.map(c => c.x));
  const yMin = Math.min(...corners.map(c => c.y));
  const yMax = Math.max(...corners.map(c => c.y));

  return { x: (xMin + xMax) / 2, y: (yMin + yMax) / 2, yMin, yMax, xMin, xMax };
}

function getTextTypeHash(svg: SVGSVGElement, text: SVGGraphicsElement) {
  // rotation
  let rotation = 0;
  const svgCtm = svg.getScreenCTM();
  const elementCtm = text.getScreenCTM();
  if (!svgCtm || !elementCtm) {
    rotation = 0;
  } else {
    const ctm = svgCtm.inverse().multiply(elementCtm);
    rotation = Math.atan2(ctm.b, ctm.a) * (180 / Math.PI);
    rotation = Math.round(rotation / 5) * 5; // round to nearest 5 degrees
  }

  // font size
  const fontSize = window.getComputedStyle(text).fontSize;
  const fontSizeValue = parseFloat(fontSize);

  // font family
  const fontFamily = window.getComputedStyle(text).fontFamily;
  const fontFamilyHash = fontFamily.split(',').map(f => f.trim()).sort().join(',');

  // font weight
  const fontWeight = window.getComputedStyle(text).fontWeight;

  return `${rotation}_${fontSizeValue}_${fontFamilyHash}_${fontWeight}`;
}

function groupByAttribute<T extends { coordinates: any }>(elements: T[], attribute: string, threshold: number): T[][] {
  const groups: T[][] = [];
  const sortTextsByY = elements.toSorted((a, b) => a.coordinates[attribute] - b.coordinates[attribute]);

  {
    const currentRow: T[] = [];
    for (const text of sortTextsByY) {
      currentRow.push(text);
      const lastY = text.coordinates[attribute];
      while (lastY - currentRow[0].coordinates[attribute] > threshold) {
        currentRow.splice(0, 1);
      }
      if (currentRow.length > 1) {
        if (groups.length > 0 && groups[groups.length - 1][0] == currentRow[0]) {
          groups[groups.length - 1].push(text);
        } else {
          groups.push([...currentRow]);
        }
      }
    }
  }
  return groups;
}

function conbineGroups<T>(groups1: T[][], groups2: T[][]): T[][] {
  const combinedGroups: T[][] = [];
  for (const group1 of groups1) {
    let isSubset = false;
    for (const group2 of groups2) {
      if (group1.every(item1 => group2.some(item2 => item1 === item2))) {
        isSubset = true;
        break;
      }
    }
    if (!isSubset) {
      combinedGroups.push(group1);
    }
  }
  for (const group2 of groups2) {
    let isSubset = false;
    for (const group1 of groups1) {
      if (group1.length == group2.length) {
        continue;
      }
      if (group2.every(item2 => group1.some(item1 => item1 === item2))) {
        isSubset = true;
        break;
      }
    }
    if (!isSubset) {
      combinedGroups.push(group2);
    }
  }
  return combinedGroups;
}

function findTicks(svg: SVGSVGElement, tickLengthThreshold: number) {
  const lines = svg.querySelectorAll('line');
  const tickXs: TickWithCoordinates[] = [];
  const tickYs: TickWithCoordinates[] = [];
  lines.forEach(line => {
    const x1 = parseFloat(line.getAttribute('x1') || '0');
    const y1 = parseFloat(line.getAttribute('y1') || '0');
    const x2 = parseFloat(line.getAttribute('x2') || '0');
    const y2 = parseFloat(line.getAttribute('y2') || '0');
    if (Math.abs(x1 - x2) < 0.1 && Math.abs(y2 - y1) < tickLengthThreshold) {
      tickXs.push({ element: line, coordinates: getElementCoordinates(svg, line) });
    }
    if (Math.abs(y1 - y2) < 0.1 && Math.abs(x2 - x1) < tickLengthThreshold) {
      tickYs.push({ element: line, coordinates: getElementCoordinates(svg, line) });
    }
  });
  // console.log(tickXs, tickYs);
  return { tickXs, tickYs };
}

function getTickTypeHash(tick: TickWithCoordinates) {
  const coordinates = tick.coordinates;
  const length = Math.round((coordinates.xMax - coordinates.xMin + coordinates.yMax - coordinates.yMin) * 10) / 10;
  const stroke = window.getComputedStyle(tick.element).stroke;
  const strokeWidth = window.getComputedStyle(tick.element).strokeWidth;
  return `${length}_${strokeWidth}_${stroke}`;
}

function closeX(coordinates1: any, coordinates2: any, threshold: number) {
  const x1Min = coordinates1.xMin;
  const x1Max = coordinates1.xMax;
  const x2Min = coordinates2.xMin;
  const x2Max = coordinates2.xMax;
  if (x1Max < x2Min) {
    return x2Min - x1Max < threshold;
  }
  if (x1Min > x2Max) {
    return x1Min - x2Max < threshold;
  }
  // overlap
  return true;
}

function closeY(coordinates1: any, coordinates2: any, threshold: number) {
  const y1Min = coordinates1.yMin;
  const y1Max = coordinates1.yMax;
  const y2Min = coordinates2.yMin;
  const y2Max = coordinates2.yMax;
  if (y1Max < y2Min) {
    return y2Min - y1Max < threshold;
  }
  if (y1Min > y2Max) {
    return y1Min - y2Max < threshold;
  }
  // overlap
  return true;
}

function inside(coordinate: any, boundary: Boundary) {
  return coordinate.x >= boundary.xMin && coordinate.x <= boundary.xMax &&
    coordinate.y >= boundary.yMin && coordinate.y <= boundary.yMax;
}

function findLegendMarks(svg: SVGSVGElement, legendMarkSizeThreshold: number, tickLengthThreshold: number) {
  const result: LegendMarkWithCoordinates[] = [];
  for (const child of svg.children) {
    if (!(child instanceof SVGGraphicsElement)) {
      continue;
    }
    if (child.tagName == "text") {
      continue;
    }
    const coordinates = getElementCoordinates(svg, child);
    const width = coordinates.xMax - coordinates.xMin;
    const height = coordinates.yMax - coordinates.yMin;
    if (width > legendMarkSizeThreshold || height > legendMarkSizeThreshold) {
      continue;
    }
    if (width == 0 || height == 0) {
      if (width + height < tickLengthThreshold) {
        continue;
      }
    }
    result.push({ element: child, coordinates });
  }
  return result;
}

function getLegendMarkTypeHash(legendMark: LegendMarkWithCoordinates) {
  const tagName = legendMark.element.tagName;
  const coordinates = legendMark.coordinates;
  const width = Math.round((coordinates.xMax - coordinates.xMin) * 10) / 10;
  const height = Math.round((coordinates.yMax - coordinates.yMin) * 10) / 10;
  return `${tagName}_${width}_${height}`;
}

function matchTextWithTicksAndLegendMarks(
  textRows: TextWithCoordinates[][],
  tickRows: TickWithCoordinates[][],
  legendRows: LegendMarkWithCoordinates[][],
  tickLabelOffsetXThreshold: number,
  tickLabelIffsetYThreshold: number,
  legendOffsetXThreshold: number,
  legendOffsetYThreshold: number
) {
  const axisMatched: AxisMatchResult[] = [];
  const legendMatched: LegendMatchResult[] = [];
  const noMatchedText: TextWithCoordinates[][] = [];

  for (const textRow of textRows) {
    let matched = false;
    // match with ticks
    for (const tickRow of tickRows) {
      if (textRow.length != tickRow.length) {
        continue;
      }
      let match = true;
      for (let i = 0; i < textRow.length; i++) {
        const text = textRow[i];
        const tick = tickRow[i];
        const textCoordinates = text.coordinates;
        const tickCoordinates = tick.coordinates;
        if (!closeX(textCoordinates, tickCoordinates, tickLabelOffsetXThreshold)) {
          match = false;
          break;
        }
        if (!closeY(textCoordinates, tickCoordinates, tickLabelIffsetYThreshold)) {
          match = false;
          break;
        }
      }
      if (match) {
        axisMatched.push({ text: textRow, tick: tickRow });
        matched = true;
        break;
      }
    }
    if (matched) {
      continue;
    }
    // match with legend marks
    const matchedMarks: LegendMarkWithCoordinates[][] = [];
    for (const legendRow of legendRows) {
      if (textRow.length != legendRow.length) {
        continue;
      }
      let match = true;
      for (let i = 0; i < textRow.length; i++) {
        const text = textRow[i];
        const mark = legendRow[i];
        const textCoordinates = text.coordinates;
        const markCoordinates = mark.coordinates;
        if (!closeX(textCoordinates, markCoordinates, legendOffsetXThreshold)) {
          match = false;
          break;
        }
        if (!closeY(textCoordinates, markCoordinates, legendOffsetYThreshold)) {
          match = false;
          break;
        }
      }
      if (match) {
        matchedMarks.push(legendRow);
        matched = true;
      }
    }
    if (matchedMarks.length > 0) {
      legendMatched.push({ text: textRow, mark: matchedMarks });
    }
    if (!matched) {
      noMatchedText.push(textRow);
    }
  }

  return { axisMatched, legendMatched, noMatchedText }
}

function getBackground(svg: SVGSVGElement, backgroundSizeRatioThreshold: number, aspectRatioThreshold: number, graphSize: number) {
  const candiates = svg.querySelectorAll('rect, path');
  const result: Element[] = [];
  for (const candidate of candiates) {
    const coordeinates = getElementCoordinates(svg, candidate as SVGGraphicsElement);
    const width = coordeinates.xMax - coordeinates.xMin;
    const height = coordeinates.yMax - coordeinates.yMin;
    if (width == 0 || height == 0) {
      continue;
    }
    const aspectRatio = Math.max(width, height) / Math.min(width, height);
    if (aspectRatio > aspectRatioThreshold) {
      continue;
    }
    const sizeThreshold = graphSize * backgroundSizeRatioThreshold;
    if (width < sizeThreshold && height < sizeThreshold) {
      continue;
    }
    result.push(candidate);
  }
  return result;
}

function getExcludedElements(
  background: Element[],
  axisMatchedX: AxisMatchResult[],
  axisMatchedY: AxisMatchResult[],
  legendMatchedX: LegendMatchResult[],
  legendMatchedY: LegendMatchResult[]
) {
  const result = new Set<Element>(background);
  for (const { tick: ticks } of axisMatchedX) {
    for (const tick of ticks) {
      result.add(tick.element);
    }
  }
  for (const { tick: ticks } of axisMatchedY) {
    for (const tick of ticks) {
      result.add(tick.element);
    }
  }
  for (const { mark: markRows } of legendMatchedX) {
    for (const marks of markRows) {
      for (const mark of marks) {
        result.add(mark.element);
      }
    }
  }
  for (const { mark: markRows } of legendMatchedY) {
    for (const marks of markRows) {
      for (const mark of marks) {
        result.add(mark.element);
      }
    }
  }
  return result;
}

function getPlotBoudaries(svg: SVGSVGElement, excludedElements: Set<Element>) {
  const elements = svg.children;
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;

  for (const element of elements) {
    if (!(element instanceof SVGGraphicsElement)) {
      continue;
    }
    if (element.tagName == "text" || element.tagName == "defs") {
      continue;
    }
    if (excludedElements.has(element)) {
      continue;
    }
    const coordinates = getElementCoordinates(svg, element);
    xMin = Math.min(xMin, coordinates.xMin);
    xMax = Math.max(xMax, coordinates.xMax);
    yMin = Math.min(yMin, coordinates.yMin);
    yMax = Math.max(yMax, coordinates.yMax);
  }

  // const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  // rect.setAttribute('x', xMin.toString());
  // rect.setAttribute('y', yMin.toString());
  // rect.setAttribute('width', (xMax - xMin).toString());
  // rect.setAttribute('height', (yMax - yMin).toString());
  // rect.setAttribute('fill', 'red');
  // rect.setAttribute('stroke', 'black');
  // rect.setAttribute('stroke-width', '1');
  // rect.setAttribute('opacity', '0.3');
  // svg.appendChild(rect);

  return { xMin, xMax, yMin, yMax };
}

function classfyRestElements(svg: SVGSVGElement, excludedElements: Set<Element>, plotBoundaries: Boundary,
  gridLengthRatioThreshold: number,
) {
  const restElements: ElementWithCoordinates[] = [];
  for (const element of svg.children) {
    if (!(element instanceof SVGGraphicsElement)) {
      continue;
    }
    if (element.tagName == "text" || element.tagName == "defs") {
      continue;
    }
    if (excludedElements.has(element)) {
      continue;
    }
    const coordinates = getElementCoordinates(svg, element);
    restElements.push({ element, coordinates });
  }

  const gridXCandidates: ElementWithCoordinates[] = [];
  const gridYCandidates: ElementWithCoordinates[] = [];
  const boundaryHeight = plotBoundaries.yMax - plotBoundaries.yMin;
  const boundaryWidth = plotBoundaries.xMax - plotBoundaries.xMin;
  const markCandidates: ElementWithCoordinates[] = [];
  for (const element of restElements) {
    const { xMin, xMax, yMin, yMax } = element.coordinates;
    if (xMin == xMax) {
      const height = yMax - yMin;
      if (height / boundaryHeight > gridLengthRatioThreshold) {
        gridYCandidates.push(element);
      } else {
        markCandidates.push(element);
      }
    } else if (yMin == yMax) {
      const width = xMax - xMin;
      if (width / boundaryWidth > gridLengthRatioThreshold) {
        gridXCandidates.push(element);
      } else {
        markCandidates.push(element);
      }
    } else {
      markCandidates.push(element);
    }
  }

  const gridXGroups = groupElementsByType(gridXCandidates, getGridTypeHash);
  const gridYGroups = groupElementsByType(gridYCandidates, getGridTypeHash);
  const markGroups = groupElementsByType(markCandidates, getMarkTypeHash);

  let gridX: ElementWithCoordinates[] = [];
  let domainX: ElementWithCoordinates | null = null;
  let gridY: ElementWithCoordinates[] = [];
  let domainY: ElementWithCoordinates | null = null;

  for (const group of gridXGroups.values()) {
    if (group.length == 1) {
      if (domainX != null) {
        console.warn('Multiple domain X found');
      }
      domainX = group[0];
    } else {
      if (gridX.length > 0) {
        console.warn('Multiple grid X found');
      }
      gridX = group;
    }
  }
  for (const group of gridYGroups.values()) {
    if (group.length == 1) {
      if (domainY != null) {
        console.warn('Multiple domain Y found');
      }
      domainY = group[0];
    } else {
      if (gridY.length > 0) {
        console.warn('Multiple grid Y found');
      }
      gridY = group;
    }
  }

  for (const keys of markGroups.keys()) {
    const marks = markGroups.get(keys)!;
    if (marks.length == 1) {
      console.warn("only one mark found")
      const mark = marks[0];
      const coordinates = mark.coordinates;
      if (coordinates.xMin == coordinates.xMax || coordinates.yMin == coordinates.yMax) {
        markGroups.delete(keys);
        mark.element.remove();
      }
    }
  }

  const texts = svg.querySelectorAll('text');
  const labels: ElementWithCoordinates[] = [];
  const titles: ElementWithCoordinates[] = [];
  for (const text of texts) {
    if (excludedElements.has(text)) {
      continue;
    }
    const coordinates = getElementCoordinates(svg, text);
    if (inside(coordinates, plotBoundaries)) {
      labels.push({ element: text, coordinates });
    } else {
      titles.push({ element: text, coordinates });
    }
  }

  return { gridX, domainX, gridY, domainY, markGroups, labels, titles };
}

function getGridTypeHash(grid: ElementWithCoordinates) {
  const element = grid.element;
  const tagName = element.tagName;
  const stroke = window.getComputedStyle(element).stroke;
  const strokeWidth = window.getComputedStyle(element).strokeWidth;
  return `${tagName}_${strokeWidth}_${stroke}`;
}

function getMarkTypeHash(mark: ElementWithCoordinates) {
  const element = mark.element;
  const tagName = element.tagName;
  const strokeWidth = window.getComputedStyle(element).strokeWidth;
  return `${tagName}_${strokeWidth}`;
}

function groupElementsByType<T extends { element: Element, coordinates: any }>(element: T[], getHash: (element: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of element) {
    const hash = getHash(item);
    if (groups.has(hash)) {
      groups.get(hash)!.push(item);
    } else {
      groups.set(hash, [item]);
    }
  }
  return groups;
}
