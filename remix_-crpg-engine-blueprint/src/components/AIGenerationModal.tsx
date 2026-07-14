import React, { useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";

interface AIGenerationModalProps {
  title: string;
  placeholder: string;
  schema: any;
  context?: string;
  onGenerate: (data: any) => void;
  onClose: () => void;
}

export function AIGenerationModal({ title, placeholder, schema, context, onGenerate, onClose }: AIGenerationModalProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, schema, context }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Network error");
      
      const parsed = JSON.parse(data.result);
      onGenerate(parsed);
      setPrompt("");
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 w-full max-w-lg shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
        
        <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          {title}
        </h2>
        <p className="text-neutral-400 text-sm mb-6">Describe what you want to generate. AI will author the content directly.</p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={placeholder}
          className="w-full h-32 bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-sm text-neutral-200 outline-none focus:border-indigo-500/50 transition-colors resize-none mb-4"
        />

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
