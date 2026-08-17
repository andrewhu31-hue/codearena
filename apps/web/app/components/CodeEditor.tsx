"use client";

import dynamic from "next/dynamic";
import type { Language } from "@codearena/shared";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center text-sm text-slate-500">
      Loading editor…
    </div>
  ),
});

const MONACO_LANGUAGE: Record<Language, string> = {
  PYTHON: "python",
  JAVASCRIPT: "javascript",
  CPP: "cpp",
};

interface CodeEditorProps {
  language: Language;
  value: string;
  onChange: (value: string) => void;
}

export function CodeEditor({ language, value, onChange }: CodeEditorProps) {
  return (
    <MonacoEditor
      height="420px"
      theme="vs-dark"
      language={MONACO_LANGUAGE[language]}
      value={value}
      onChange={(next) => onChange(next ?? "")}
      options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true }}
    />
  );
}
