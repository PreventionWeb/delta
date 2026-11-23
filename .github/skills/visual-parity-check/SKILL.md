---
name: visual-parity-check
description:
  "Methodology for comparing a rebuilt page/component against a reference (a legacy page,
  a mock, or a design spec) for genuine visual/UX parity. Run as Gate 9 for any
  presentation-layer change. Invoke the visual-parity-reviewer agent to execute this
  methodology end-to-end and produce a structured report."
---

# Visual Parity Check — DELTA Resilience

This methodology exists because narrow checks have repeatedly missed real, visible defects on
this project — a missing icon, a plain link where legacy renders a button, a field pulled out of
its grid, a `getComputedStyle` pixel reading misread as a zoom artifact when it was actually a
real `html { font-size }` override. Every one of these passed a check that only looked at the
specific element already expected to differ, or trusted a computed pixel value without tracing it
back to source. This checklist exists to stop that pattern from repeating.

## The two failure modes this guards against

1. **Narrow scope** — checking only the element the brief says should differ, not the whole page.
   A sibling-adjacency bug (a field in the wrong grid, a missing wrapper around multiple
   children) is invisible to a check that only inspects one element's own styling.
2. **Trusting computed pixels without tracing them to source** — `getComputedStyle()` /
   `getBoundingClientRect()` give you _a_ number, not _the_ number. A non-round pixel value is a
   signal to go find the actual rule that produces it, not to round it, approximate it, or assume
   it reflects a rendering artifact (zoom, scaling) without checking the alternative first: a
   non-default root font-size (`html { font-size: ... }` in a global stylesheet), a stacked
   padding/margin from nested wrapper elements, or a theme default the reference never overrode.

## Procedure

1. **Identify the reference.** A legacy page's live URL, a static mock/image, or a design spec.
   If it's a live page, navigate to it; if it's a mock, read it directly.
2. **Trace every visual property back to its real source before trusting any number.**
   - A literal Tailwind/CSS class name on the reference element is the most reliable source — read
     it directly from the rendered DOM's `className`/`class` attribute, not from a computed style.
   - When the reference uses a third-party component library (e.g. a UI kit) with no visible
     override, check that library's own default theme/stylesheet for the real value — don't
     assume a bare utility class like `shadow-none` cancels a library-level `box-shadow`; check
     the actual cascade (source order, specificity) rather than assuming the last-written class
     wins.
   - If a `getComputedStyle()`/`getBoundingClientRect()` reading produces a non-round number,
     stop and find the rule that produces it — check for: a non-default root font-size set
     globally (grep for `html { font-size` in the project's own stylesheets before assuming a
     16px root), a value stacked from more than one nested element (a parent and a child both
     contributing padding/margin to the same visual gap), or a response you haven't yet traced to
     a literal source at all.
3. **Do a full-page pass, not a single-element check.** Go section by section (or
   card by card, row by row — whatever the page's own structure is) and check, for each:
   - Structure: is every element present, in the right order, in the right parent/sibling
     relationship (not just correctly styled in isolation)?
   - Spacing: between siblings within a section, and between sections themselves — these are
     often governed by _different_ rules (e.g. a shared outer wrapper vs. each section's own
     margin) and can't be assumed to share one value just because they look similar.
   - Content: every label, every icon, every piece of text — word-for-word, not
     "close enough."
   - Interactive elements: does a link render as a link, a button as a button? Check the
     underlying element type, not just its visual appearance — a styled `<a>` and a real
     `<button>` can look identical but behave differently (navigation vs. side-effect).
4. **Use a real screenshot, not just DOM/class inspection, for at least one full pass.** Class
   names and computed styles can both be individually correct while the _overall visual rhythm_
   is still wrong (this is exactly how a sibling-adjacency bug slips through) — a screenshot
   catches what a property-by-property check cannot. If the primary screenshot mechanism is
   unavailable, use a scripted fallback (e.g. a throwaway browser-automation script that takes a
   real screenshot) rather than skipping this step — read the resulting image yourself.
5. **Report every finding with its source citation** — file and line number for the reference's
   real value, not just a description of what looked different. A finding without a citation
   can't be verified or fixed correctly later.

## Output Schema

```markdown
## Visual Parity Report

**Reference:** <URL / mock / spec reference>
**Subject:** <page/component under review>

### Findings

- **<Section/element name>** — <what's wrong>. Reference: `<file:line>` or `<literal class/value>`.
  Subject: `<file:line>` or `<literal class/value>`. <Confirmed via screenshot / DOM inspection /
  both>.

### Confirmed matching (spot-checked, not assumed)

- <Section/element> — matches, confirmed via <method>.

### Summary

N findings across M sections. <Any item that couldn't be verified on the record/data available,
named explicitly as unverified, not silently skipped.>
```

## What this does NOT do

- Does not decide whether a finding is worth fixing now vs. later — that's a human/implementer
  call (see the project's own "review findings need human decision" convention).
- Does not fix anything itself — report only.
- Does not assume a computed pixel value is correct just because it's round, or incorrect just
  because it's not — only tracing it to its real source settles that.
