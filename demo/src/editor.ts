import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, RangeSetBuilder } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  gutter,
  GutterMarker,
  highlightActiveLine,
  keymap,
  lineNumbers
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { actionLabel } from './engine/program';

/** What a code panel can do besides showing code */
export interface EditorOptions {
  /** Called with an action's label when its ▶ button, in the margin of its `// ▶ Label` line, is pressed */
  onRunAction?: (label: string) => void;
}

/** A code panel: read-only until `setEditable(true)`; Cmd/Ctrl+Enter calls `onRun` */
export interface CodeEditor {
  getCode(): string;
  setCode(code: string): void;
  setEditable(editable: boolean): void;
  focus(): void;
  destroy(): void;
}

// Code panels are dark in both themes (daisyUI's neutral), so the syntax colors are the same in both
const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword],
    color: 'var(--code-keyword)'
  },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-number)' },
  { tag: [tags.propertyName], color: 'var(--code-property)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--code-function)' },
  { tag: [tags.comment, tags.lineComment], color: 'var(--code-comment)', fontStyle: 'italic' }
]);

const theme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--color-neutral)',
      color: 'var(--color-neutral-content)',
      fontSize: '13px',
      borderRadius: 'var(--radius-box)',
      // A panel with a set height (the workbench's code card, a widget's Code tab) scrolls inside
      height: '100%'
    },
    '.cm-run-gutter .cm-gutterElement': { display: 'flex', alignItems: 'center', paddingLeft: '4px' },
    '.cm-run': {
      color: 'var(--code-string)',
      background: 'none',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '11px',
      lineHeight: '1',
      padding: '3px 5px'
    },
    '.cm-run:hover, .cm-run:focus-visible': { backgroundColor: 'rgb(163 230 53 / 0.18)', outline: 'none' },
    '.cm-content': { fontFamily: 'var(--font-mono)', padding: '12px 0', caretColor: 'var(--code-keyword)' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', overflow: 'auto' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--code-comment)', border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgb(255 255 255 / 0.04)' },
    '&.cm-focused': { outline: '2px solid var(--color-primary)', outlineOffset: '2px' },
    '.cm-cursor': { borderLeftColor: 'var(--code-keyword)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgb(34 211 238 / 0.25)' }
  },
  { dark: true }
);

/** A ▶ button in the margin of an action's line */
class RunMarker extends GutterMarker {
  constructor(readonly label: string) {
    super();
  }

  override eq(other: RunMarker): boolean {
    return other.label === this.label;
  }

  override toDOM(): Node {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-run';
    button.textContent = '▶';
    button.title = `Run “${this.label}”`;
    button.setAttribute('aria-label', `Run “${this.label}”`);
    return button;
  }
}

/** The margin with a ▶ button on each `// ▶ Label` line, which calls `onRunAction` with the label */
function runGutter(onRunAction: (label: string) => void) {
  return gutter({
    class: 'cm-run-gutter',
    markers: view => {
      const markers = new RangeSetBuilder<GutterMarker>();
      for (let number = 1; number <= view.state.doc.lines; number++) {
        const line = view.state.doc.line(number);
        const label = actionLabel(line.text);
        if (label !== undefined) markers.add(line.from, line.from, new RunMarker(label));
      }
      return markers.finish();
    },
    domEventHandlers: {
      click: (view, block, event) => {
        if (!(event.target instanceof Element) || !event.target.closest('.cm-run')) return false;
        const label = actionLabel(view.state.doc.lineAt(block.from).text);
        if (label !== undefined) onRunAction(label);
        return true;
      }
    }
  });
}

export function createEditor(
  parent: HTMLElement,
  code: string,
  onRun: () => void,
  options: EditorOptions = {}
): CodeEditor {
  const editable = new Compartment();
  // The ▶ buttons run the program that's running, so they go while the code is being edited
  const runButtons = new Compartment();
  const runs = (on: boolean) => (on && options.onRunAction ? runGutter(options.onRunAction) : []);
  const readOnly = (on: boolean) => [EditorView.editable.of(!on), EditorState.readOnly.of(on)];
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: code,
      extensions: [
        runButtons.of(runs(true)),
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        bracketMatching(),
        javascript(),
        syntaxHighlighting(highlight),
        theme,
        EditorView.contentAttributes.of({ 'aria-label': 'Scenario code' }),
        keymap.of([
          { key: 'Mod-Enter', run: () => (onRun(), true) },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap
        ]),
        editable.of(readOnly(true))
      ]
    })
  });
  return {
    getCode: () => view.state.doc.toString(),
    setCode: next => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } }),
    setEditable: on =>
      view.dispatch({ effects: [editable.reconfigure(readOnly(!on)), runButtons.reconfigure(runs(!on))] }),
    focus: () => view.focus(),
    destroy: () => view.destroy()
  };
}
