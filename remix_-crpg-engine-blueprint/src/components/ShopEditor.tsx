import React from "react";
import { useEngineStore } from "../store/engineStore";
import { Plus, Trash2, Store } from "lucide-react";
import { ShopData } from "../schema/game";
import { ConditionEditor } from "./ConditionEditor";

export function ShopEditor() {
  const { gamePackage, addShop, updateShop, selectedShopId, setSelectedShopId } = useEngineStore();

  const activeShop = gamePackage.shops?.find((shop) => shop.id === selectedShopId) || null;

  const handleCreate = () => {
    const id = `shop_${Date.now()}`;
    const newShop: ShopData = {
      id,
      display_name: "New Shop",
      items: [],
    };
    addShop(newShop);
    setSelectedShopId(id);
  };

  const handleUpdate = (updates: Partial<ShopData>) => {
    if (!activeShop) return;
    updateShop(activeShop.id, updates);
  };

  const addItemToShop = () => {
    if (!activeShop) return;
    const items = [...activeShop.items, { item_id: "", price: 10, price_modifiers: [] }];
    updateShop(activeShop.id, { items });
  };

  const updateShopItem = (idx: number, updates: any) => {
    if (!activeShop) return;
    const items = [...activeShop.items];
    items[idx] = { ...items[idx], ...updates };
    updateShop(activeShop.id, { items });
  };

  const removeShopItem = (idx: number) => {
    if (!activeShop) return;
    const items = activeShop.items.filter((_, itemIndex) => itemIndex !== idx);
    updateShop(activeShop.id, { items });
  };

  const addPriceModifier = (idx: number) => {
    const item = activeShop?.items[idx];
    if (!item) return;
    updateShopItem(idx, {
      price_modifiers: [...(item.price_modifiers || []), { multiplier: 1, delta: 0 }],
    });
  };

  const updatePriceModifier = (itemIdx: number, modifierIdx: number, updates: any) => {
    const item = activeShop?.items[itemIdx];
    if (!item) return;
    const modifiers = [...(item.price_modifiers || [])];
    modifiers[modifierIdx] = { ...modifiers[modifierIdx], ...updates };
    updateShopItem(itemIdx, { price_modifiers: modifiers });
  };

  const removePriceModifier = (itemIdx: number, modifierIdx: number) => {
    const item = activeShop?.items[itemIdx];
    if (!item) return;
    updateShopItem(itemIdx, {
      price_modifiers: (item.price_modifiers || []).filter((_, idx) => idx !== modifierIdx),
    });
  };

  return (
    <div className="flex h-full bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden m-4">
      <div className="w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">
          <h2 className="text-sm font-semibold text-neutral-200">Shops</h2>
          <button onClick={handleCreate} className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto w-full">
          {gamePackage.shops?.map((shop) => (
            <button
              key={shop.id}
              onClick={() => setSelectedShopId(shop.id)}
              className={`w-full text-left px-4 py-3 border-b flex items-center justify-between transition-colors ${selectedShopId === shop.id ? "bg-neutral-800 border-neutral-700 border-l-2 border-l-amber-500" : "border-neutral-800/50 hover:bg-neutral-800/50 border-l-2 border-l-transparent"}`}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-neutral-200 truncate">{shop.display_name}</span>
                <span className="text-xs text-neutral-500 truncate">{shop.id}</span>
              </div>
            </button>
          ))}
          {(!gamePackage.shops || gamePackage.shops.length === 0) && (
            <div className="p-4 text-center text-neutral-500 text-sm">No shops yet.</div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-neutral-900 overflow-y-auto">
        {activeShop ? (
          <div className="max-w-4xl w-full p-6 space-y-6 mx-auto">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Edit Shop</h2>
                <p className="text-xs text-neutral-500 font-mono">{activeShop.id}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Display Name</label>
              <input
                type="text"
                value={activeShop.display_name}
                onChange={(event) => handleUpdate({ display_name: event.target.value })}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white focus:outline-none"
              />
            </div>

            <section className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-300">Shop Items</h3>
                  <p className="text-xs text-neutral-500">Conditions hide stock; modifiers apply in order.</p>
                </div>
                <button onClick={addItemToShop} className="text-xs bg-neutral-800 hover:bg-neutral-700 text-white px-2 py-1 rounded">Add Item</button>
              </div>

              <div className="space-y-3">
                {activeShop.items.map((item, itemIdx) => (
                  <div key={itemIdx} className="bg-neutral-950 p-3 rounded border border-neutral-800 space-y-3">
                    <div className="flex flex-wrap gap-2 items-center">
                      <select
                        value={item.item_id}
                        onChange={(event) => updateShopItem(itemIdx, { item_id: event.target.value })}
                        className="flex-1 min-w-[180px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                      >
                        <option value="">Select Item...</option>
                        {gamePackage.items?.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>{candidate.display_name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={item.price}
                        onChange={(event) => updateShopItem(itemIdx, { price: parseInt(event.target.value, 10) || 0 })}
                        className="w-24 bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                        placeholder="Price"
                      />
                      <button onClick={() => removeShopItem(itemIdx)} className="p-1 text-red-400 hover:bg-red-500/20 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <ConditionEditor
                      compact
                      label="Stock Condition"
                      value={item.condition}
                      onChange={(condition) => updateShopItem(itemIdx, { condition })}
                    />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-neutral-400">Price Modifiers</span>
                        <button
                          onClick={() => addPriceModifier(itemIdx)}
                          className="text-xs text-amber-300 hover:text-amber-200"
                        >
                          + Add Modifier
                        </button>
                      </div>
                      {(item.price_modifiers || []).map((modifier, modifierIdx) => (
                        <div key={modifierIdx} className="rounded border border-neutral-800 bg-neutral-900/60 p-2 space-y-2">
                          <div className="flex flex-wrap gap-2 items-center">
                            <label className="text-[11px] text-neutral-500">
                              Multiplier
                              <input
                                type="number"
                                step="0.1"
                                value={modifier.multiplier ?? 1}
                                onChange={(event) => updatePriceModifier(itemIdx, modifierIdx, { multiplier: Number(event.target.value) || 0 })}
                                className="ml-2 w-20 bg-black border border-neutral-800 rounded px-2 py-1 text-xs text-white"
                              />
                            </label>
                            <label className="text-[11px] text-neutral-500">
                              Delta
                              <input
                                type="number"
                                value={modifier.delta ?? 0}
                                onChange={(event) => updatePriceModifier(itemIdx, modifierIdx, { delta: Number(event.target.value) || 0 })}
                                className="ml-2 w-20 bg-black border border-neutral-800 rounded px-2 py-1 text-xs text-white"
                              />
                            </label>
                            <button
                              onClick={() => removePriceModifier(itemIdx, modifierIdx)}
                              className="ml-auto p-1 text-red-400 hover:bg-red-500/20 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <ConditionEditor
                            compact
                            label="Modifier Condition"
                            value={modifier.condition}
                            onChange={(condition) => updatePriceModifier(itemIdx, modifierIdx, { condition })}
                          />
                        </div>
                      ))}
                      {(item.price_modifiers || []).length === 0 && (
                        <p className="text-xs text-neutral-600 italic">No conditional price changes.</p>
                      )}
                    </div>
                  </div>
                ))}
                {activeShop.items.length === 0 && (
                  <div className="text-center text-sm text-neutral-500 py-4 border border-dashed border-neutral-800 rounded">No items in this shop.</div>
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
            <Store className="w-12 h-12 mb-4 opacity-20" />
            <p>Select a shop or create a new one to start editing.</p>
          </div>
        )}
      </div>
    </div>
  );
}
