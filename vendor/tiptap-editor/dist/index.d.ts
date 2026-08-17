import { ComponentType } from 'react';

type UploadFunction = (
  file: File,
  onProgress?: (event: { progress: number }) => void,
  abortSignal?: AbortSignal
) => Promise<string>

interface SimpleEditorProps {
  content?: unknown
  contentType?: "json" | "html" | "markdown"
  editable?: boolean
  showThemeToggle?: boolean
  embedded?: boolean
  compactToolbar?: boolean
  toolbarPreset?: "full" | "annotation"
  imageUpload?: UploadFunction
  imageSrcResolver?: (src: string) => string
  onEditorReady?: (editor: unknown | null) => void
  onMarkdownChange?: (markdown: string) => void
  forceToolbarScrolled?: boolean
}

declare const SimpleEditor: ComponentType<SimpleEditorProps>

declare function useTiptapEditor(providedEditor?: unknown | null): {
  editor: unknown | null
  editorState?: unknown
  canCommand?: unknown
}

export { SimpleEditor, type SimpleEditorProps, type UploadFunction, useTiptapEditor };
