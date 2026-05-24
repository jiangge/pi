import assert from "node:assert";
import { describe, it } from "node:test";
import { Text } from "../src/components/text.ts";
import { visibleWidth } from "../src/utils.ts";

describe("Text component", () => {
	it("pads output lines to exactly match width", () => {
		const text = new Text("Hello world", 1, 0);
		const lines = text.render(50);

		// Should have exactly one content line (no vertical padding)
		assert.strictEqual(lines.length, 1);

		// Line should be exactly 50 visible characters
		assert.strictEqual(visibleWidth(lines[0]), 50);
	});

	it("pads output with vertical padding lines to width", () => {
		const text = new Text("Hello", 0, 2);
		const lines = text.render(40);

		// Should have 2 padding lines + 1 content line + 2 padding lines = 5 total
		assert.strictEqual(lines.length, 5);

		// All lines should be exactly 40 characters
		for (const line of lines) {
			assert.strictEqual(visibleWidth(line), 40);
		}
	});

	it("renders empty text as empty array", () => {
		// Text returns [] for empty text (different from TruncatedText which returns [""])
		const text = new Text("", 1, 0);
		const lines = text.render(30);
		assert.strictEqual(lines.length, 0);
	});

	it("handles whitespace-only text as empty", () => {
		// Whitspace-only text returns [] (same as empty)
		const text = new Text("   ", 1, 0);
		const lines = text.render(30);
		assert.strictEqual(lines.length, 0);
	});

	it("preserves ANSI codes in output and pads correctly", () => {
		const text = new Text("\x1b[31mHello\x1b[0m world", 1, 0);
		const lines = text.render(40);

		assert.strictEqual(lines.length, 1);

		// Should be exactly 40 visible characters (ANSI codes don't count)
		assert.strictEqual(visibleWidth(lines[0]), 40);

		// Should preserve the color codes
		assert.ok(lines[0].includes("\x1b["));
	});

	it("handles multi-line wrapped text", () => {
		const longText = "This is a very long piece of text that will wrap across multiple lines";
		const text = new Text(longText, 1, 0);
		const lines = text.render(20);

		// Should have multiple wrapped lines
		assert.ok(lines.length > 1);

		// Every line should be exactly 20 characters
		for (const line of lines) {
			assert.strictEqual(visibleWidth(line), 20);
		}
	});

	it("handles text with tabs (replaced with 3 spaces)", () => {
		const text = new Text("a\tb", 0, 0);
		const lines = text.render(20);

		assert.strictEqual(lines.length, 1);
		assert.strictEqual(visibleWidth(lines[0]), 20);

		// Tab should be replaced with 3 spaces
		const stripped = lines[0].replace(/\x1b\[[0-9;]*m/g, "");
		assert.ok(stripped.includes("   "));
	});

	it("adds top and bottom padding lines", () => {
		const text = new Text("Hello", 1, 2);
		const lines = text.render(30);

		// 2 top + 1 content + 2 bottom = 5
		assert.strictEqual(lines.length, 5);

		// All lines at full width
		for (const line of lines) {
			assert.strictEqual(visibleWidth(line), 30);
		}
	});

	it("cooperates with cache invalidation", () => {
		const text = new Text("Hello", 1, 0);
		const first = text.render(30);
		assert.strictEqual(first.length, 1);
		assert.strictEqual(visibleWidth(first[0]), 30);

		// Change text, invalidate, render again
		text.setText("New longer text that should wrap");
		const second = text.render(30);
		assert.ok(second.length >= 1);
		assert.strictEqual(visibleWidth(second[0]), 30);

		// Cache miss should produce different content
		assert.notStrictEqual(first[0], second[0]);
	});
});

describe("Text over-width safety clamp", () => {
	it("clamps over-width line when paddingX is too large for width", () => {
		// Scenario: paddingX = 5, width = 10
		// contentWidth = max(1, 10 - 10) = 1
		// wrapTextWithAnsi("A", 1) → ["A"]
		// lineWithMargins = "     A     " → visibleWidth = 11 > width=10
		// Safety clamp should truncate to width=10
		const text = new Text("A", 5, 0);
		const lines = text.render(10);

		assert.ok(lines.length > 0, "should produce at least one line");
		for (const line of lines) {
			const vw = visibleWidth(line);
			assert.ok(vw <= 10, `line visibleWidth ${vw} must not exceed requested width 10: ${JSON.stringify(line)}`);
		}
	});

	it("clamps over-width line with large asymmetric padding", () => {
		// paddingX = 10, width = 15
		// contentWidth = max(1, 15 - 20) = 1
		// lineWithMargins = "          A          " → visibleWidth = 21 > 15
		const text = new Text("Hello!", 10, 0);
		const lines = text.render(15);

		assert.ok(lines.length > 0);
		for (const line of lines) {
			const vw = visibleWidth(line);
			assert.ok(vw <= 15, `line visibleWidth ${vw} must not exceed requested width 15`);
		}
	});

	it("clamps over-width line with custom background function", () => {
		// Scenario: paddingX too large + custom bg function
		// Both render branches (with and without bg) should be safe
		const customBg = (s: string) => `\x1b[44m${s}\x1b[0m`;
		const text = new Text("BB", 6, 0, customBg);
		const lines = text.render(12);

		assert.ok(lines.length > 0);
		for (const line of lines) {
			const vw = visibleWidth(line);
			assert.ok(vw <= 12, `line with bg visibleWidth ${vw} must not exceed 12: ${JSON.stringify(line)}`);
		}
	});

	it("clamps over-width line with multi-line wrapped content", () => {
		// Long text + large paddingX → contentWidth=1, each wrapped line is short
		// but lineWithMargins exceeds width
		const longText = "This is a multi-line wrapped text that should produce several wrapped lines";
		const paddingX = 8;
		const width = 20;
		const text = new Text(longText, paddingX, 0);
		const lines = text.render(width);

		assert.ok(lines.length > 0);
		for (const line of lines) {
			const vw = visibleWidth(line);
			assert.ok(vw <= width, `multi-line line visibleWidth ${vw} must not exceed ${width}`);
		}
	});

	it("clamps over-width line with vertical padding and custom background", () => {
		// paddingY + paddingX tight scenario with custom background
		const customBg = (s: string) => `\x1b[41m${s}\x1b[0m`;
		const text = new Text("X", 7, 1, customBg);
		const lines = text.render(14);

		// 1 top + content + 1 bottom = 3+
		assert.ok(lines.length >= 3);
		for (const line of lines) {
			const vw = visibleWidth(line);
			assert.ok(vw <= 14, `bg+padding line visibleWidth ${vw} must not exceed 14: ${JSON.stringify(line)}`);
		}
	});

	it("never exceeds width even with pathological paddingY+paddingX", () => {
		// Extreme case: width barely bigger than 2*paddingX
		// Edge case where both branches get exercised
		const customBg = (s: string) => `\x1b[42m${s}\x1b[0m`;
		const text = new Text("Z", 4, 1, customBg);
		const width = 9;

		const lines = text.render(width);
		assert.ok(lines.length >= 3);
		for (const line of lines) {
			const vw = visibleWidth(line);
			assert.ok(vw <= width, `pathological line visibleWidth ${vw} must not exceed ${width}`);
		}
	});

	it("still works normally when padding is reasonable", () => {
		// No-overflow case: paddingX small enough that lineWithMargins fits
		const text = new Text("Normal text here", 1, 0);
		const lines = text.render(40);

		assert.strictEqual(lines.length, 1);
		assert.strictEqual(visibleWidth(lines[0]), 40);

		// Content should start with a space (left margin) and end with spaces (right padding)
		assert.ok(lines[0].startsWith(" "));
	});
});
