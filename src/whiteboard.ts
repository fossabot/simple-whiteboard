import { LitElement, css, html } from "lit";
import rough from "roughjs";
import { icons } from "feather-icons";
import getStroke from "perfect-freehand";
import { customElement, state } from "lit/decorators.js";
import { RoughCanvas } from "roughjs/bin/canvas";
import { Options as RoughCanvasOptions } from "roughjs/bin/core";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

/**
 * Calculate the average of two numbers.
 *
 * @param a The first number.
 * @param b The second number.
 * @returns The average of the two numbers.
 */
const average = (a: number, b: number) => (a + b) / 2;

/**
 * Get a SVG path from a stroke.
 *
 * @param points Coordinates of the points.
 * @param closed If the path should be closed.
 * @returns The SVG path.
 */
const getSvgPathFromStroke = (points: number[][], closed = true) => {
  const len = points.length;

  if (len < 4) {
    return ``;
  }

  let a = points[0];
  let b = points[1];
  const c = points[2];

  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(
    2
  )},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(
    b[1],
    c[1]
  ).toFixed(2)} T`;

  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i];
    b = points[i + 1];
    result += `${average(a[0], b[0]).toFixed(2)},${average(a[1], b[1]).toFixed(
      2
    )} `;
  }

  if (closed) {
    result += "Z";
  }

  return result;
};

type WhiteboardRect = {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  options: RoughCanvasOptions;
};
type WhiteboardCircle = {
  kind: "circle";
  x: number;
  y: number;
  diameter: number;
  options: RoughCanvasOptions;
};
type WhiteboardLine = {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  options: RoughCanvasOptions;
};
type WhiteboardPen = {
  kind: "pen";
  path: { x: number; y: number }[];
  options: {
    color?: string;
  };
};
type WhiteboardMove = {
  kind: "move";
  x: number;
  y: number;
};
type WhiteboardItem =
  | WhiteboardRect
  | WhiteboardCircle
  | WhiteboardLine
  | WhiteboardPen
  | WhiteboardMove;

const svgs = {
  rect: icons.square.toSvg(),
  circle: icons.circle.toSvg(),
  line: icons.minus.toSvg(),
  pen: icons["edit-2"].toSvg(),
};

@customElement("simple-whiteboard")
export class Whiteboard extends LitElement {
  private canvas?: HTMLCanvasElement;
  private toolsMenu?: HTMLDivElement;

  @state() private items: WhiteboardItem[] = [];
  @state() private canvasCoords: { x: number; y: number } = { x: 0, y: 0 };
  private currentDrawing: WhiteboardItem | undefined;
  private currentTool = "none";

  static styles = css`
    #root {
      height: 100%;
      width: 100%;
      background-color: #fcfcff;
      position: relative;
    }

    .tools {
      gap: 8px;
      padding: 16px;
      border-radius: 8px;
      background-color: #fff;
      margin: auto;
      position: absolute;
      z-index: 1;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.1);
    }

    .tools button {
      background-color: transparent;
      border: none;
      cursor: pointer;
      padding: 8px;
      border-radius: 4px;
      transition: background-color 0.2s;
    }

    .tools button:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }

    .tools button:active,
    .tools .tools--active {
      background-color: rgba(0, 0, 0, 0.1);
    }

    canvas {
      top: 0;
      left: 0;
      position: absolute;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
    }
  `;

  protected firstUpdated(): void {
    this.canvas = this.shadowRoot?.querySelector("canvas") || undefined;
    if (!this.canvas) {
      throw new Error("Canvas not found");
    }

    this.toolsMenu = this.shadowRoot?.querySelector(".tools") || undefined;
    if (!this.toolsMenu) {
      throw new Error("Tools menu not found");
    }

    this.handleResize();
  }

  handleResize() {
    if (!this.canvas) {
      return;
    }

    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;

    this.draw();
  }

  handleVisibilityChange() {
    if (!this.canvas) {
      return;
    }

    this.draw();
  }

  drawItem(
    rc: RoughCanvas,
    context: CanvasRenderingContext2D,
    item: WhiteboardItem
  ) {
    switch (item.kind) {
      case "rect":
        rc.rectangle(
          item.x + this.canvasCoords.x,
          item.y + this.canvasCoords.y,
          item.width,
          item.height,
          item.options
        );
        break;
      case "circle":
        rc.circle(
          item.x + this.canvasCoords.x,
          item.y + this.canvasCoords.y,
          item.diameter,
          item.options
        );
        break;
      case "line":
        rc.line(
          item.x1 + this.canvasCoords.x,
          item.y1 + this.canvasCoords.y,
          item.x2 + this.canvasCoords.x,
          item.y2 + this.canvasCoords.y,
          item.options
        );
        break;
      case "pen":
        const outlinePoints = getStroke(
          item.path.map((p) => ({
            x: p.x + this.canvasCoords.x,
            y: p.y + this.canvasCoords.y,
          })),
          {
            size: 6,
            smoothing: 0.5,
            thinning: 0.5,
            streamline: 0.5,
          }
        );
        const pathData = getSvgPathFromStroke(outlinePoints);

        const path = new Path2D(pathData);
        const prevFillStyle = context.fillStyle;
        context.fillStyle = item.options.color || "black";
        context.fill(path);
        context.fillStyle = prevFillStyle;
        break;
    }
  }

  draw() {
    if (!this.canvas) {
      return;
    }

    const context = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const rc = rough.canvas(this.canvas, { options: { seed: 42 } });
    this.items.forEach((item) => this.drawItem(rc, context, item));
    if (this.currentDrawing) {
      this.drawItem(rc, context, this.currentDrawing);
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("resize", this.handleResize.bind(this));
    document.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange.bind(this)
    );
  }

  disconnectedCallback(): void {
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange.bind(this)
    );
    window.removeEventListener("resize", this.handleResize.bind(this));
    super.disconnectedCallback();
  }

  handleDrawingStart(x: number, y: number) {
    this.currentDrawing = undefined;

    switch (this.currentTool) {
      case "rect":
        this.currentDrawing = {
          kind: "rect",
          x: x - this.canvasCoords.x,
          y: y - this.canvasCoords.y,
          width: 0,
          height: 0,
          options: {},
        };
        break;
      case "circle":
        this.currentDrawing = {
          kind: "circle",
          x: x - this.canvasCoords.x,
          y: y - this.canvasCoords.y,
          diameter: 0,
          options: {},
        };
        break;
      case "line":
        this.currentDrawing = {
          kind: "line",
          x1: x - this.canvasCoords.x,
          y1: y - this.canvasCoords.y,
          x2: x - this.canvasCoords.x,
          y2: y - this.canvasCoords.y,
          options: {},
        };
        break;
      case "pen":
        this.currentDrawing = {
          kind: "pen",
          path: [{ x: x - this.canvasCoords.x, y: y - this.canvasCoords.y }],
          options: {},
        };
        break;
      case "move":
        this.currentDrawing = {
          kind: "move",
          x: x,
          y: y,
        };
        break;
    }
  }

  handleDrawingMove(x: number, y: number) {
    if (!this.currentDrawing) {
      return;
    }

    switch (this.currentDrawing.kind) {
      case "rect":
        const { x: currentX, y: currentY } = this.currentDrawing;
        this.currentDrawing.width = x - currentX - this.canvasCoords.x;
        this.currentDrawing.height = y - currentY - this.canvasCoords.y;
        break;
      case "circle":
        const { x: x1, y: y1 } = this.currentDrawing;
        const x2 = x - this.canvasCoords.x;
        const y2 = y - this.canvasCoords.y;
        const dx = x2 - x1;
        const dy = y2 - y1;
        this.currentDrawing.diameter = Math.sqrt(dx * dx + dy * dy) * 2;
        break;
      case "line":
        this.currentDrawing.x2 = x - this.canvasCoords.x;
        this.currentDrawing.y2 = y - this.canvasCoords.y;
        break;
      case "pen":
        this.currentDrawing.path.push({
          x: x - this.canvasCoords.x,
          y: y - this.canvasCoords.y,
        });
        break;
      case "move":
        const { x: startX, y: startY } = this.currentDrawing;
        const moveX = x - startX;
        const moveY = y - startY;

        this.canvasCoords.x += moveX;
        this.canvasCoords.y += moveY;

        this.currentDrawing.x = x;
        this.currentDrawing.y = y;

        break;
    }

    this.draw();
  }

  handleDrawingEnd() {
    if (!this.currentDrawing) {
      return;
    }

    if (this.currentDrawing.kind !== "move") {
      this.items.push(this.currentDrawing);
    }
    this.currentDrawing = undefined;

    this.draw();
  }

  handleMouseDown(e: MouseEvent) {
    this.handleDrawingStart(e.offsetX, e.offsetY);
  }

  handleMouseMove(e: MouseEvent) {
    this.handleDrawingMove(e.offsetX, e.offsetY);
  }

  handleMouseUp() {
    this.handleDrawingEnd();
  }

  handleTouchStart(e: TouchEvent) {
    if (e.touches.length < 1 || !this.canvas) {
      return;
    }

    // Prevent the default action to prevent scrolling
    e.preventDefault();

    // Get the first touch
    const touch = e.touches[0];

    // Get the position of the touch relative to the canvas
    const rect = this.canvas.getBoundingClientRect();

    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    this.handleDrawingStart(x, y);
  }

  handleTouchMove(e: TouchEvent) {
    if (e.touches.length < 1 || !this.canvas) {
      return;
    }

    // Prevent the default action to prevent scrolling
    e.preventDefault();

    // Get the first touch
    const touch = e.touches[0];

    // Get the position of the touch relative to the canvas
    const rect = this.canvas.getBoundingClientRect();

    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    this.handleDrawingMove(x, y);
  }

  handleTouchEnd() {
    this.handleDrawingEnd();
  }

  handleTouchCancel() {
    if (!this.currentDrawing) {
      return;
    }

    this.currentDrawing = undefined;

    this.draw();
  }

  handleToolChange(event: Event, tool: string) {
    event.stopPropagation();
    this.currentTool = tool;
    this.toolsMenu?.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("tools--active", button === event.currentTarget);
    });
  }

  render() {
    return html`
      <div id="root">
        <div class="tools">
          <button
            @click="${(e: Event) => this.handleToolChange(e, "move")}"
            title="Move Tool"
          >
            ${unsafeHTML(icons.move.toSvg())}
          </button>
          <button
            @click="${(e: Event) => this.handleToolChange(e, "rect")}"
            title="Rectangle Tool"
          >
            ${unsafeHTML(svgs.rect)}
          </button>
          <button
            @click="${(e: Event) => this.handleToolChange(e, "circle")}"
            title="Circle Tool"
          >
            ${unsafeHTML(svgs.circle)}
          </button>
          <button
            @click="${(e: Event) => this.handleToolChange(e, "line")}"
            title="Line Tool"
          >
            ${unsafeHTML(svgs.line)}
          </button>
          <button
            @click="${(e: Event) => this.handleToolChange(e, "pen")}"
            title="Pen Tool"
          >
            ${unsafeHTML(svgs.pen)}
          </button>
        </div>

        <canvas
          @mousedown="${this.handleMouseDown}"
          @mouseup="${this.handleMouseUp}"
          @mousemove="${this.handleMouseMove}"
          @touchstart="${this.handleTouchStart}"
          @touchmove="${this.handleTouchMove}"
          @touchend="${this.handleTouchEnd}"
          @touchcancel="${this.handleTouchCancel}"
        ></canvas>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "simple-whiteboard": Whiteboard;
  }
}
