import { IdCounter } from './idCounter';
import type { LegendMarkWithCoordinates, TextWithCoordinates, TickWithCoordinates } from './main';

export class Axis {
  orientation: "x" | "y";
  labels: TextWithCoordinates[];
  ticks: TickWithCoordinates[];
  constructor(orientation: "x" | "y", labels: TextWithCoordinates[], ticks: TickWithCoordinates[] = []) {
    this.orientation = orientation;
    this.labels = labels;
    this.ticks = ticks;
  }

  addTextToExclusionSet(excludedElements: Set<Element>) {
    for (const label of this.labels) {
      excludedElements.add(label.element);
    }
  }

  addSVGAttributes(svg: SVGSVGElement, IdCounter: IdCounter) {
    for (const label of this.labels) {
      const id = IdCounter.getIdByPrefix(`axis-${this.orientation}-label`);
      label.element.setAttribute("id", id);
      label.element.setAttribute("class", `axis-${this.orientation} label`);
    }
    for (const tick of this.ticks) {
      const id = IdCounter.getIdByPrefix(`axis-${this.orientation}-tick`);
      tick.element.setAttribute("id", id);
      tick.element.setAttribute("class", `axis-${this.orientation} tick`);
    }
  }
}

export class Legend {
  labels: TextWithCoordinates[];
  marks: LegendMarkWithCoordinates[][];
  constructor(labels: TextWithCoordinates[], marks: LegendMarkWithCoordinates[][]) {
    this.labels = labels;
    this.marks = marks;
  }

  addTextToExclusionSet(excludedElements: Set<Element>) {
    for (const label of this.labels) {
      excludedElements.add(label.element);
    }
  }

  addSVGAttributes(svg: SVGSVGElement, IdCounter: IdCounter) {
    for (const label of this.labels) {
      const id = IdCounter.getIdByPrefix("legend-label");
      label.element.setAttribute("id", id);
      label.element.setAttribute("class", "legend label");
    }
    let legendMarkIdCounter = 1;
    for (const row of this.marks) {
      const rowId = legendMarkIdCounter++;
      for (const mark of row) {
        const id = IdCounter.getIdByPrefix(`legend-mark-${rowId}`);
        mark.element.setAttribute("id", id);
        mark.element.setAttribute("class", `legend mark legend-${rowId}`);
      }
    }
  }
}
