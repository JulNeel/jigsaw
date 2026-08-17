import { describe, expect, it } from "vitest";
import { classifyPieceShape } from "./classify-piece-shape";

describe("classifyPieceShape", () => {
  it("classifies all four corners of a normal grid", () => {
    const rows = 4;
    const cols = 5;
    expect(classifyPieceShape(0, 0, rows, cols)).toBe("corner");
    expect(classifyPieceShape(0, cols - 1, rows, cols)).toBe("corner");
    expect(classifyPieceShape(rows - 1, 0, rows, cols)).toBe("corner");
    expect(classifyPieceShape(rows - 1, cols - 1, rows, cols)).toBe("corner");
  });

  it("classifies a non-corner border piece as an edge", () => {
    expect(classifyPieceShape(0, 2, 4, 5)).toBe("edge");
    expect(classifyPieceShape(2, 0, 4, 5)).toBe("edge");
  });

  it("classifies a piece with no boundary row/col as interior", () => {
    expect(classifyPieceShape(1, 1, 4, 5)).toBe("interior");
    expect(classifyPieceShape(2, 3, 4, 5)).toBe("interior");
  });

  it("classifies the ends of a single-row grid as corners and the middle as edges", () => {
    expect(classifyPieceShape(0, 0, 1, 5)).toBe("corner");
    expect(classifyPieceShape(0, 4, 1, 5)).toBe("corner");
    expect(classifyPieceShape(0, 2, 1, 5)).toBe("edge");
  });

  it("classifies a single-cell grid as a corner", () => {
    expect(classifyPieceShape(0, 0, 1, 1)).toBe("corner");
  });
});
