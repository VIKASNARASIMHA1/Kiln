import { python } from '@codemirror/lang-python';
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';

interface Props {
  value: string;
  onChange: (code: string) => void;
  onRun?: () => void; // Ctrl/Cmd+Enter
  readOnly?: boolean;
}

/** Python editor (CodeMirror 6): syntax highlighting, indentation, Ctrl/Cmd+Enter to run. */
export default function CodeEditor({ value, onChange, onRun, readOnly }: Props) {
  const { theme } = useTheme();
  const extensions = useMemo(
    () => [
      python(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': 'Python code editor' }),
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => (onRun ? (onRun(), true) : false) }])),
    ],
    [onRun]
  );
  return (
    <CodeMirror
      className="editor"
      value={value}
      height="340px"
      theme={theme}
      extensions={extensions}
      onChange={onChange}
      readOnly={readOnly}
      basicSetup={{ autocompletion: false, closeBrackets: false, foldGutter: false, highlightActiveLine: false }}
    />
  );
}
