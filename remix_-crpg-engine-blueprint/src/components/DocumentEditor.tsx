import React from "react";
import { useEngineStore } from "../store/engineStore";
import { Plus, Trash2, FileText } from "lucide-react";
import { DocumentData } from "../schema/game";

export function DocumentEditor() {
  const { gamePackage, addDocument, updateDocument, selectedDocumentId, setSelectedDocumentId } = useEngineStore();

  const activeDocument = gamePackage.documents?.find((d) => d.id === selectedDocumentId) || null;

  const handleCreate = () => {
    const id = `doc_${Date.now()}`;
    const newDoc: DocumentData = {
      id,
      display_name: "New Document",
      content: "",
    };
    addDocument(newDoc);
    setSelectedDocumentId(id);
  };

  const handleUpdate = (updates: Partial<DocumentData>) => {
    if (!activeDocument) return;
    updateDocument(activeDocument.id, updates);
  };

  const handleDelete = () => {
     if (!activeDocument) return;
     // simple delete omitted for now. Just a stub.
  };

  return (
    <div className="flex h-full bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden m-4">
      {/* Sidebar ListView */}
      <div className="w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">
          <h2 className="text-sm font-semibold text-neutral-200">Documents</h2>
          <button
            onClick={handleCreate}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto w-full">
          {gamePackage.documents?.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDocumentId(d.id)}
              className={`w-full text-left px-4 py-3 border-b flex items-center justify-between transition-colors ${
                selectedDocumentId === d.id
                  ? "bg-neutral-800 border-neutral-700 border-l-2 border-l-amber-500"
                  : "border-neutral-800/50 hover:bg-neutral-800/50 border-l-2 border-l-transparent"
              }`}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-neutral-200 truncate">{d.display_name}</span>
                <span className="text-xs text-neutral-500 truncate">{d.id}</span>
              </div>
            </button>
          ))}
          {(!gamePackage.documents || gamePackage.documents.length === 0) && (
            <div className="p-4 text-center text-neutral-500 text-sm">
              No documents yet. Create one!
            </div>
          )}
        </div>
      </div>

      {/* Editor Main */}
      <div className="flex-1 flex flex-col bg-neutral-900 overflow-y-auto">
        {activeDocument ? (
          <div className="max-w-4xl w-full p-6 space-y-6 mx-auto">
            <div className="flex justify-between items-start">
               <div>
                  <h2 className="text-lg font-bold text-white mb-1">Edit Document</h2>
                  <p className="text-xs text-neutral-500 font-mono">{activeDocument.id}</p>
               </div>
               <button
                 onClick={handleDelete}
                 className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
               >
                 <Trash2 className="w-4 h-4" />
               </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={activeDocument.display_name}
                  onChange={(e) => handleUpdate({ display_name: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition-shadow"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Content (Markdown compatible)</label>
                <textarea
                  value={activeDocument.content}
                  onChange={(e) => handleUpdate({ content: e.target.value })}
                  rows={20}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition-shadow font-serif leading-relaxed"
                  placeholder="Once upon a time..."
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
            <FileText className="w-12 h-12 mb-4 opacity-20" />
            <p>Select a document or create a new one to start editing.</p>
          </div>
        )}
      </div>
    </div>
  );
}
