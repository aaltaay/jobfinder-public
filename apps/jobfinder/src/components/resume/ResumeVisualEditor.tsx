import {
  type MouseEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { sanitizeResumeHtml } from "@/lib/sanitizeHtml"

type Props = {
  /** Current draft HTML (controlled). */
  html: string
  onChange: (html: string) => void
  disabled?: boolean
}

function runFormat(command: string) {
  // Selection-preserving formatting; deprecated but fine for light local editing.
  document.execCommand(command, false)
}

export function ResumeVisualEditor({ html, onChange, disabled }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const suppressSync = useRef(false)
  const [showSource, setShowSource] = useState(false)
  const htmlRef = useRef(html)
  htmlRef.current = html

  // Seed on mount and when leaving source mode. Do not depend on `html` —
  // re-applying on every keystroke would reset the caret.
  useLayoutEffect(() => {
    if (showSource) return
    const el = editorRef.current
    if (!el) return
    const next = sanitizeResumeHtml(htmlRef.current)
    if (el.innerHTML === next) return
    suppressSync.current = true
    el.innerHTML = next
    suppressSync.current = false
  }, [showSource])

  function syncFromEditor() {
    if (suppressSync.current) return
    const el = editorRef.current
    if (!el) return
    onChange(el.innerHTML)
  }

  function onToolbarMouseDown(e: MouseEvent) {
    // Keep text selection so execCommand applies to the highlight.
    e.preventDefault()
  }

  function apply(command: string) {
    if (disabled || showSource) return
    editorRef.current?.focus()
    runFormat(command)
    syncFromEditor()
  }

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-2 py-1.5"
        role="toolbar"
        aria-label="Résumé formatting"
        onMouseDown={onToolbarMouseDown}
      >
        <ToolbarBtn label="Bold" title="Bold" onClick={() => apply("bold")} disabled={disabled || showSource}>
          <span className="font-semibold">B</span>
        </ToolbarBtn>
        <ToolbarBtn label="Italic" title="Italic" onClick={() => apply("italic")} disabled={disabled || showSource}>
          <span className="italic">I</span>
        </ToolbarBtn>
        <ToolbarBtn
          label="Bullet list"
          title="Bullet list"
          onClick={() => apply("insertUnorderedList")}
          disabled={disabled || showSource}
        >
          <span className="text-[13px] tracking-tight">• List</span>
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden />
        <ToolbarBtn label="Undo" title="Undo" onClick={() => apply("undo")} disabled={disabled || showSource}>
          Undo
        </ToolbarBtn>
        <ToolbarBtn label="Redo" title="Redo" onClick={() => apply("redo")} disabled={disabled || showSource}>
          Redo
        </ToolbarBtn>
        <div className="flex-1 min-w-2" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-[12px] px-2 py-1"
          onClick={() => {
            if (!showSource) {
              // Flush visual → draft before showing source
              syncFromEditor()
            }
            setShowSource((v) => !v)
          }}
          disabled={disabled}
        >
          {showSource ? "Hide source" : "Edit HTML"}
        </Button>
      </div>

      {showSource ? (
        <Textarea
          className="min-h-[280px] font-mono text-xs leading-relaxed resize-y"
          value={html}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          disabled={disabled}
          aria-label="Résumé HTML source"
        />
      ) : (
        <Card
          ref={editorRef}
          className="resume-doc p-6 sm:p-10 lg:p-12 resume-doc--editing outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)]/15"
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Résumé editor"
          onInput={syncFromEditor}
          onBlur={syncFromEditor}
        />
      )}
    </div>
  )
}

function ToolbarBtn({
  label,
  title,
  onClick,
  disabled,
  children,
}: {
  label: string
  title: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="min-w-8 px-2.5 py-1 text-[13px] tracking-tight"
      aria-label={label}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  )
}
