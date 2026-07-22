import { useState } from "react";

export interface ComboboxOption {
  id: string;
  label: string;
}

// id: null means "create a new one with this label" — the caller decides
// how/when to actually create it (e.g. on form submit), this component is
// just the picker.
export type ComboboxSelection = { id: string | null; label: string };

interface ComboboxProps {
  options: ComboboxOption[];
  value: ComboboxSelection | null;
  onChange: (selection: ComboboxSelection) => void;
  placeholder?: string;
}

export function Combobox({ options, value, onChange, placeholder }: ComboboxProps) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [isOpen, setIsOpen] = useState(false);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));
  const exactMatch = options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  function selectExisting(option: ComboboxOption) {
    onChange({ id: option.id, label: option.label });
    setQuery(option.label);
    setIsOpen(false);
  }

  function selectNew() {
    const label = query.trim();
    if (!label) return;
    onChange({ id: null, label });
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          onChange({ id: null, label: e.target.value.trim() });
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 100)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />
      {isOpen && query && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {filtered.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onMouseDown={() => selectExisting(option)}
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                {option.label}
              </button>
            </li>
          ))}
          {!exactMatch && (
            <li>
              <button
                type="button"
                onMouseDown={selectNew}
                className="block w-full px-3 py-2 text-left text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Create &quot;{query.trim()}&quot;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
