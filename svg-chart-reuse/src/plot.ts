import { IdCounter } from "./idCounter";
import type { ElementWithCoordinates } from "./main";
import type { Axis, Legend } from "./scaleGuide";

export class Plot {
  titles: ElementWithCoordinates[];
  markGroups: Map<string, ElementWithCoordinates[]>;
  labels: ElementWithCoordinates[];
  gridX: ElementWithCoordinates[];
  gridY: ElementWithCoordinates[];
  domainX: ElementWithCoordinates | null;
  domainY: ElementWithCoordinates | null;
  xAxis: Axis | null;
  yAxis: Axis | null;
  legend: Legend | null;
  background: Element[];
  svg: SVGSVGElement;

  idCounter: IdCounter;

  constructor(
    titles: ElementWithCoordinates[],
    markGroups: Map<string, ElementWithCoordinates[]>,
    labels: ElementWithCoordinates[],
    gridX: ElementWithCoordinates[],
    gridY: ElementWithCoordinates[],
    domainX: ElementWithCoordinates | null,
    domainY: ElementWithCoordinates | null,
    xAxis: Axis | null,
    yAxis: Axis | null,
    legend: Legend | null,
    background: Element[],
    svg: SVGSVGElement,
  ) {
    this.titles = titles;
    this.markGroups = markGroups;
    this.labels = labels;
    this.gridX = gridX;
    this.gridY = gridY;
    this.domainX = domainX;
    this.domainY = domainY;
    this.xAxis = xAxis;
    this.yAxis = yAxis;
    this.legend = legend;
    this.background = background;
    this.svg = svg;

    this.idCounter = new IdCounter();
  }

  addSVGAttributes() {
    // marks
    let markIdCounter = 1;
    for (const [_, marks] of this.markGroups) {
      const markTypeId = `mark-${markIdCounter++}`;
      for (const mark of marks) {
        const markId = this.idCounter.getIdByPrefix(markTypeId);
        mark.element.setAttribute("id", markId);
        mark.element.setAttribute("class", markTypeId);
      }
    }
    // labels
    for (const label of this.labels) {
      const labelId = this.idCounter.getIdByPrefix("label");
      label.element.setAttribute("id", labelId);
      label.element.setAttribute("class", "label");
    }
    // grid
    for (const grid of this.gridX) {
      const gridId = this.idCounter.getIdByPrefix("grid-x");
      grid.element.setAttribute("id", gridId);
      grid.element.setAttribute("class", "grid-x");
    }
    for (const grid of this.gridY) {
      const gridId = this.idCounter.getIdByPrefix("grid-y");
      grid.element.setAttribute("id", gridId);
      grid.element.setAttribute("class", "grid-y");
    }
    // domain
    if (this.domainX) {
      this.domainX.element.setAttribute("id", "domain-x");
      this.domainX.element.setAttribute("class", "domain-x");
    }
    if (this.domainY) {
      this.domainY.element.setAttribute("id", "domain-y");
      this.domainY.element.setAttribute("class", "domain-y");
    }
    // background
    for (const element of this.background) {
      const elementId = this.idCounter.getIdByPrefix("background");
      element.setAttribute("id", elementId);
      element.setAttribute("class", "background");
    }
    // titles
    for (const title of this.titles) {
      const titleId = this.idCounter.getIdByPrefix("title");
      title.element.setAttribute("id", titleId);
      title.element.setAttribute("class", "title");
    }
    // axes and legend
    if (this.xAxis) {
      this.xAxis.addSVGAttributes(this.svg, this.idCounter);
    }
    if (this.yAxis) {
      this.yAxis.addSVGAttributes(this.svg, this.idCounter);
    }
    if (this.legend) {
      this.legend.addSVGAttributes(this.svg, this.idCounter);
    }
  }
}