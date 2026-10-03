import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';

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
      borderRadius: 'var(--radius-box)'
    },
    '.cm-content': { fontFamily: 'var(--font-mono)', padding: '12px 0', caretColor: 'var(--code-keyword)' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--code-comment)', border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgb(255 255 255 / 0.04)' },
    '&.cm-focused': { outline: '2px solid var(--color-primary)', outlineOffset: '2px' },
    '.cm-cursor': { borderLeftColor: 'var(--code-keyword)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgb(34 211 238 / 0.25)' }
  },
  { dark: true }
);

export function createEditor(parent: HTMLElement, code: string, onRun: () => void): CodeEditor {
  const editable = new Compartment();
  const readOnly = (on: boolean) => [EditorView.editable.of(!on), EditorState.readOnly.of(on)];
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: code,
      extensions: [
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
    setEditable: on => view.dispatch({ effects: editable.reconfigure(readOnly(!on)) }),
    focus: () => view.focus(),
    destroy: () => view.destroy()
  };
}
