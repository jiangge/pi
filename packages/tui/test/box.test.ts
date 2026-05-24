import assert from "node:assert";
import { describe, it } from "node:test";
import { Box } from "../src/components/box.ts";
import type { Component } from "../src/tui.ts";
import { visibleWidth } from "../src/utils.ts";

/**
 * A dummy component that returns a line longer than the requested width.
 * This simulates a misbehaving child (e.g. a custom renderer) to verify
 * that Box's safety clamp prevents over-width lines from escaping.
 */
class OverWidthChild implements Component {
	private text: string;

	constructor(text: string) {
		this.text = text;
	}

	render(_width: number): string[] {
		// Return a line exactly as wide as the stored text, irrespective of `_width`.
		// This is intentionally wider than _width for the test scenarios.
		return [this.text];
	}

	invalidate(): void {
		// no-op
	}
}

describe("Box component over-width safety clamp", () => {
	it("clamps over-width child lines to requested width (no bg)", () => {
		// paddingX=1 so contentWidth = width - 2
		// leftPad = " " (1 char)
		// OverWidthChild returns a line of 50 chars
		// padded line = " " + 50 chars = 51 chars
		// width = 10 → 51 > 10, should clamp
		const child = new OverWidthChild("A".repeat(50));
		const box = new Box(1, 0);
		box.addChild(child);

		const lines = box.render(10);
		assert.ok(lines.length > 0, "should produce at least one line");
		for (const line of lines) {
			const vw = visibleWidth(line);
			assert.ok(vw <= 10, `no-bg line visibleWidth ${vw} must not exceed 10: ${JSON.stringify(line)}`);
		}
	});

	it("clamps over-width child lines with background function", () => {
		const customBg = (s: string) => `\x1b[44m${s}\x1b[0m`;
		const child = new OverWidthChild("BB".repeat(30));
		const box = new Box(1, 0, customBg);
		box.addChild(child);

		const lines = box.render(20);
		assert.ok(lines.length > 0);
		for (const line of lines) {
			const vw = visibleWidth(line);
			assert.ok(vw <= 20, `bg line visibleWidth ${vw} must not exceed 20: ${JSON.stringify(line)}`);
		}
	});

	it("clamps over-width with vertical padding", () => {
		const child = new OverWidthChild("HelloWorld".repeat(10));
		const box = new Box(2, 1); // paddingX=2, paddingY=1
		box.addChild(child);

		const lines = box.render(15);
		assert.ok(lines.length >= 3, "should have top padding + content + bottom padding");
		for (const line of lines) {
			const vw = visibleWidth(line);
			assert.ok(vw <= 15, `vpad line visibleWidth ${vw} must not exceed 15: ${JSON.stringify(line)}`);
		}
	});

	it("clamps over-width with both bg and vertical padding", () => {
		const customBg = (s: string) => `\x1b[41m${s}\x1b[0m`;
		const child = new OverWidthChild("XYZ".repeat(20));
		const box = new Box(3, 2, customBg);
		box.addChild(child);

		const lines = box.render(16);
		assert.ok(lines.length >= 5, "should have 2 top + 1 content + 2 bottom padding lines");
		for (const line of lines) {
			const vw = visibleWidth(line);
			assert.ok(vw <= 16, `bg+vpad line visibleWidth ${vw} must not exceed 16: ${JSON.stringify(line)}`);
		}
	});

	it("still works correctly when children fit within width", () => {
		// Normal case: child lines are shorter than width, so no clamping
		const child = new OverWidthChild("Hello");
		const box = new Box(1, 0);
		box.addChild(child);

		const lines = box.render(20);
		assert.ok(lines.length > 0);
		// Line should be exactly 20 chars: leftPad(1) + "Hello"(5) + rightPadding(14)
		for (const line of lines) {
			assert.strictEqual(visibleWidth(line), 20);
		}
		// Content should have left margin
		assert.ok(lines[0].startsWith(" "));
	});

	it("empty children returns empty array", () => {
		const box = new Box(1, 1);
		assert.deepStrictEqual(box.render(10), []);
	});

	it("handles multiple over-width children", () => {
		const child1 = new OverWidthChild("Overflow1");
		const child2 = new OverWidthChild("Overflow2");
		const box = new Box(1, 0);
		box.addChild(child1);
		box.addChild(child2);

		const lines = box.render(8);
		assert.ok(lines.length >= 2);
		for (const line of lines) {
			const vw = visibleWidth(line);
			assert.ok(vw <= 8, `multi-child line visibleWidth ${vw} must not exceed 8`);
		}
	});

	it("handles pathological paddingX greater than width", () => {
		// When paddingX * 2 > width, contentWidth = max(1, width - 2*paddingX) = 1
		// leftPad is huge, so lineWithMargins will likely exceed width
		const child = new OverWidthChild("X");
		const box = new Box(20, 0); // paddingX=20, width=30
		box.addChild(child);

		const lines = box.render(30);
		assert.ok(lines.length > 0);
		for (const line of lines) {
			const vw = visibleWidth(line);
			assert.ok(vw <= 30, `pathological-padding line visibleWidth ${vw} must not exceed 30`);
		}
	});

	it("preserves background on normal (non-overflow) lines", () => {
		// Verify that bgFn is applied correctly in the normal path
		let bgCallCount = 0;
		const customBg = (s: string) => {
			bgCallCount++;
			return `\x1b[42m${s}\x1b[0m`;
		};
		const child = new OverWidthChild("OK");
		const box = new Box(1, 0, customBg);
		box.addChild(child);

		const lines = box.render(30);
		assert.ok(lines.length > 0);

		// bgFn should have been called
		assert.ok(bgCallCount > 0, "bgFn should be called at least once");

		// All lines at exact width (normal path, no overflow expected)
		for (const line of lines) {
			assert.strictEqual(visibleWidth(line), 30);
			assert.ok(line.includes("\x1b[42m"), "background should be present in output");
		}
	});
});
