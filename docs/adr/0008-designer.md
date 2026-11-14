# ADR 0008: The designer

- Status: accepted
- Date: 14 November 2026
- Phase: 2

## Context

Phase 2 builds the form designer: a toolbox, a canvas, an outline, undo, and saving. Four things about it are expensive to change later, and the Phase 2 spec asks for them to be recorded: how a document is edited and undone, how dragging works, how the canvas shows components, and how saving works. Three of them are frozen after this phase: the editing operations and the history model, the naming rule for new instances, and autosave with conflict handling.

The document format (ADR 0003), the component contract (ADR 0004) and the forms API (ADR 0007) were already frozen. Nothing here changes them.

## Decision

### 1. The editing model

**Three operations.** Every change the designer makes to a document is one of these, applied by `applyOperation` in `web/src/designer/model/operations.ts`:

| Operation | Does |
| --- | --- |
| `insert { instance, at }` | Puts a new instance, with everything inside it, at a position |
| `move { id, to }` | Moves an instance, with everything inside it, to a position |
| `remove { id }` | Removes an instance and everything inside it |

A **position** is `{ parent, region, index }`: the id of the instance whose region it is (or none, for the form's own list), the region's name, and an index. For `move`, the index is where the instance ends up: it counts the region without the instance being moved.

- Operations name instances **by id**, never by a path of indexes, so an operation means the same thing whatever happened before it.
- An operation applies completely or is **refused** and changes nothing. The refusals are: the instance or the target is not in the document; the target is not a region the form shows; a container would go inside itself; the instance is already there; the result would nest deeper, or be larger, than the server reads.
- The document is **never mutated**. An operation returns a new document that shares every instance it did not touch with the old one.

**Commands.** What a person does is a command: `add`, `move`, `step` (one place up or down), `remove`, `duplicate`, `undo`, `redo`, `select`. `runCommand` in `editor.ts` turns a command into at most one operation, works out what is selected afterwards, and says in words what happened or why nothing did. It is a pure function from a state and a command to the next state, so the designer, its unit tests and its property-based test all run the same code.

**History is a list of whole documents.** The state is `{ document, selection, past, future }`. A change pushes the document and selection from before it onto `past`; undo puts them back and pushes the current ones onto `future`; a new change empties `future`. Because documents share everything untouched, a step costs one small path of new objects, not a copy.

- Undo puts back **the same object** that was there, so it cannot disagree with what was: same ids, same names, same place.
- Undo also restores the **selection** from before the change, and redo the one from after it.
- The last 100 changes can be undone.
- Selecting is not a change. It is not in the history and does not cause a save.
- Preview is a mode of the canvas, not a state of the document: switching to it and back touches neither the document nor the history.

**What is selected after a command.** After `add` and `duplicate`: the new instance. After `move`: the moved one. After `remove`: the next sibling, else the previous one, else the container, else nothing. Keyboard focus follows the selection in whichever view it was in (canvas or outline).

**Adding without a place** puts the instance after the selected one, or at the end of the form when nothing is selected or the selection is not shown.

### 2. New instances

| | Rule |
| --- | --- |
| Id | `c_` plus ten random characters of Crockford's base 32 in lower case (`0-9`, `a-z` without `i l o u`), from the browser's cryptographic source, never one already in the document |
| Name | The type id in camelCase plus the lowest number that is free in the whole form: `textField1`, `datePicker2`, `columns1` |
| Data path | An input is bound to a path equal to its name. A number is passed over when that path would clash with one already used (equal to it, or inside it, or around it) |
| Settings and styles | None are stored: a new instance uses its component's defaults (ADR 0003, D5) |

Duplicating gives every copied instance a new id, a new name by the same rule, and a data path equal to that name. Settings and styles are kept.

### 3. The designer never makes a document the server would refuse

The server is the judge of what may be stored. The designer needs the same judgement before it sends anything: to refuse a drop while the pointer is still moving, and to be testable. So:

- **`web/src/designer/model/rules.ts` is the server's validation in TypeScript.** It reports the same problems at the same paths.
- **One file holds the two together:** `crates/server/tests/fixtures/document-rules.json`, 95 documents each with the paths of its problems. The server's tests and the designer's tests both run every case. A rule added to one side and not the other fails a test.
- **The server's limits on a request are now named**, in `crates/contracts`, and generated into TypeScript:

  | Constant | Value | What it is |
  | --- | --- | --- |
  | `MAX_JSON_DEPTH` | 127 | How deep the JSON of a request may nest. This is the server's nesting limit for forms |
  | `MAX_REQUEST_BYTES` | 2 MiB | The largest request body the server reads |

  Neither number is new. The depth is the JSON parser's own limit, and the size was the web framework's default; both were in force in Phase 1. A server test now nests a request to exactly 127 levels and to 128, and sends one of exactly 2 MiB and one byte more, so the constants cannot drift from what the server does. No response changes.

  A top-level instance sits at level 4 of a save, and each level of containers adds 3, so **instances nest 42 deep** when the innermost holds nothing nested itself. The limit is on the JSON, not on instances: a Select's options take three levels of their own. The Phase 1 report gave the limit as 41, measured with a document that carried an extra level; the number above is exact.

- **A property-based test** (`editor.property.test.ts`, check C2-15) runs random sequences of add, move, step, delete, duplicate, undo and redo through `runCommand`, from starting documents of every awkward kind: empty, the seeded demo form, random valid documents with unknown component types, hidden regions and custom names, containers nested to the limit, and inputs whose data paths are exactly the ones new instances would be given. After every command the document must pass `rules.ts` and the request limits, undo must give back the very document from before, and a refused command must have changed nothing.

### 4. Drag and drop: Pointer Events, no library

Dragging is `web/src/designer/drag/controller.ts`, about 270 lines with no dependencies. It serves the toolbox, the canvas and the outline:

- a **source** says what is dragged: a new instance of a type, or an existing instance;
- each **surface** (canvas, outline) says which position a point is over and where to draw the indicator;
- the **designer** says whether that position would accept the drop, by running the command without keeping the result. The same code that will perform the drop decides whether the indicator is shown, so the two cannot disagree. Over a position that would be refused, no indicator is shown and letting go changes nothing.

The controller owns the rest: a press becomes a drag after 5 pixels, so a click stays a click; the label that follows the pointer; scrolling a scrolling area when the pointer is near its top or bottom edge; Escape; and swallowing the click the browser sends after a drop.

The libraries considered, at their current versions:

| Library | Why not |
| --- | --- |
| dnd-kit, `@dnd-kit/core` 6.3 | Last released in December 2024; its successor is below. Its model is "which droppable does the dragged box collide with". Our target is not a droppable but an index of a region, found from the pointer, so we would supply our own collision detection and use the library for a threshold and an overlay |
| dnd-kit, `@dnd-kit/react` 0.5 | Still before 1.0, with an API that is still changing. The same mismatch |
| Pragmatic drag and drop 4.0 | Built on the browser's native drag and drop. That brings the browser's own drag image and cursor, a snap-back animation on a refused drop that delays the end of the drag, and weaker support on touch. A canvas drag wants full control of what is drawn |
| React Aria Components 1.22 | Drag and drop for its own collections (list, grid, tree). The canvas is not one of them |

What we need from a library is small: a threshold, a pointer to follow, and edge scrolling. What decides whether the designer feels right is the part no library has: where exactly a drop lands in a tree of real, arbitrarily laid-out components. Owning those lines keeps that in one place, and it is driven by Pointer Events, which end-to-end tests can produce exactly.

**The keyboard does not imitate a drag.** A component is moved with Alt and the arrow keys: one press moves it to the next place in document order, into and out of containers, so every position is a number of presses away. A press that would nest too deeply passes over that place. Each move is announced in a live region with where the component now is ("Moved textField1 to position 1 of 1 in col2 of row").

### 5. How the canvas renders components

**The canvas is the real renderer.** `FormRenderer` takes an optional `design` surface (`web/src/forms/runtime/design.ts`). With it, the renderer shows the same components in edit mode and hands every instance and every region to the surface: an `Instance` component to wrap an instance, and a `Region` component that stands where a region's children go. The renderer knows nothing about selecting or dragging, and the designer never renders a component.

**The form on the canvas is exactly the running form.**

- The designer's `Instance` wrapper is an element with `display: contents`. It has no box, so each component is laid out by the element its container put it in, just as when the form runs. An end-to-end test compares the box of every instance of the demo form on the canvas with the running form, to a tenth of a pixel.
- The whole rendered form is `inert`: it cannot be typed into, focused or reached by assistive technology.
- The only thing design mode adds to the form is a drop target in a region that holds nothing, because an empty region has to take up room to be dropped into.

**Interaction happens on a layer over the form.** The designer measures the box of every instance and every region (`canvas-measure.ts`), after each render and whenever the form changes size, and draws over the form:

- one transparent **button per instance**, exactly over it, in document order, so a child's button lies over its container's. It is what is hovered, selected, focused and dragged, and it carries the `canvas-<name>` test id. To the keyboard and to a screen reader it is the instance;
- a dashed **edge around each region** of a container, so it is plain where things will land.

**Which place a point is over is arithmetic** on the measured boxes (`canvas-geometry.ts`), with no DOM, and unit-tested with boxes written by hand: the innermost instance under the point; before or after it by which half the point is in; in a container, the nearest region and the nearest child. Within 6 pixels of a container's edge, a drop goes next to the container rather than into it, so a container whose content reaches its edge can still be dropped above and below. When several containers share an edge, that zone is split between them, outermost first.

**The outline shows what the canvas cannot.** Children stored in a region their container does not have (a third column of a two-column Columns, ADR 0003) are not rendered, so they are not on the canvas. The outline lists them, marked Hidden, and they can be selected, dragged back into the form, or deleted. Nothing can be dropped into a region the form does not show.

**The designer takes the whole window.** At `/designer/<id>` the app's sidebar gives way to the toolbox, the canvas and the outline. At 1280 pixels that leaves the canvas room to show the form at the width it has when it runs, which is what makes the canvas truthful.

### 6. Saving

`web/src/designer/save.ts`, plain TypeScript:

- **Autosave.** 700 ms after the last edit, the document is sent with `PUT /api/forms/{id}` and the revision it was based on.
- **Documents are compared by identity.** Opening a form, selecting, and previewing produce no new document, so they save nothing. Undoing back to what was saved needs no save either.
- **One request at a time.** An edit made while a save is on its way is sent when that save returns, on the revision it returned.
- **The status** is one of: saved; saving (a change is waiting or on its way); not saved, with the reason and a Retry; or conflict.
- **Conflict.** On 409 `revision_conflict` autosave stops for good. The designer says plainly that the form was changed somewhere else, locks itself so that no further work is done on a copy that cannot be saved, and offers to reload. Reloading takes the server's document, clears the history, and starts saving again. Nothing is ever sent without a revision, so nothing is overwritten silently.
- **Leaving.** Leaving the designer sends what is waiting at once. So does the page being hidden or closed, with `keepalive` so that the request outlives the page (browsers allow that for bodies up to 64 KiB; a larger form is sent the ordinary way). There is no "leave page?" dialog.
- **A failed save** keeps the document on screen and is tried again on the next edit, or on Retry.

## Alternatives considered

- **Inverse operations instead of whole documents in the history.** Each operation would compute the operation that undoes it. That is what real-time collaboration needs, and v1 has none. It doubles the code that must be right, and an inverse can be wrong in ways a remembered document cannot. Operations already name instances by id, so a later phase could add inverses without changing the three operations.
- **A flat, normalised copy of the document inside the designer.** Faster lookups, but two shapes of the same data and a conversion on every save. The tree is small; reading it against the registry is remembered per document.
- **Look-alike components for the canvas.** Ruled out by the spec, and it is where a designer and its forms drift apart.
- **A real box around each instance on the canvas**, to select and outline it. Simpler, but the box becomes the flex or grid item in place of the component, and the layout changes: a component that sets its own width or alignment no longer does so against its container. `display: contents` plus measured boxes costs one measuring pass and gives the exact layout.
- **Outlines and drop targets drawn by CSS on the components' own elements.** That is styling components from outside, which CLAUDE.md forbids, and it cannot be told apart from a style override in a document.
- **Emulating a drag with the keyboard** (pick up, move with arrows, drop). It walks pixels or drop targets with no sense of structure, and has to announce a pending state. Moving one place at a time is a single command with one announcement, and is undone by one undo.
- **An explicit limit on levels of nesting, checked by the server's validation.** Clearer to state than a limit on JSON depth, but it would refuse documents the server accepts today, which changes a frozen API. Naming the limit that already exists changes nothing.
- **Saving on a Save button.** The spec asks for autosave. With revisions, autosave is also what makes a conflict show up early, while there is little to lose.

## Which later phase this serves

| Decision | Serves |
| --- | --- |
| Operations by id on an immutable document | Phase 3: setting a setting or a style is one more operation of the same kind, undone the same way |
| `runCommand` as a pure function | Phase 3: the properties panel sends commands; nothing else changes |
| The rules in TypeScript, held to the server's by shared cases | Phase 3: renaming an instance and editing its data path can be checked as typed. Phase 5: the same for entity bindings |
| The `design` surface of the renderer | Phase 3: five more components appear on the canvas with no designer change. Phase 4: the canvas shows a theme because it is the form |
| Measured boxes per instance | Phase 3: the style editor can outline the slot being styled (ADR 0006) |
| Identity comparison in autosave | Phase 3: typing in a setting saves once, after the last keystroke |

Phase 3 will want two additions that are not built here: operations for settings, styles and names, and merging a run of edits to one setting into a single history step.

## Consequences

- Frozen after this phase: the three operations and positions; history as a list of documents with the selection; the naming rule and binding an input to its name; autosave with the revision and the stop-and-reload on a conflict. Changing any of them needs a new ADR.
- The designer owns its drag code, including its edge cases. Touch dragging is not built: a touch scrolls, and components are added by pressing a toolbox item.
- A component must draw a box to be selectable on the canvas. Every component does in edit mode; one that drew nothing would be reachable through the outline only.
- A rule added to the server's validation needs the same rule in `rules.ts` and a case in the shared file. The tests enforce it.
- Every document change renders the whole canvas again. With fifty instances that is not noticeable; remembering the prepared form of unchanged instances is the next step if it becomes so.
