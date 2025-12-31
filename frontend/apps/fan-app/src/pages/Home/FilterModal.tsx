import { useState } from "react";
import { X } from "lucide-react";

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: FilterState) => void;
}

interface FilterState {
  dateRange: string | null;
  priceRange: [number, number];
  categories: string[];
  distance: number | null;
  accessibility: string[];
}

const dateOptions = [
  { value: "today", label: "Today" },
  { value: "weekend", label: "This Weekend" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "custom", label: "Custom" },
];

const categoryOptions = [
  { value: "music", label: "Music" },
  { value: "sports", label: "Sports" },
  { value: "comedy", label: "Comedy" },
  { value: "theater", label: "Theater" },
  { value: "festivals", label: "Festivals" },
  { value: "family", label: "Family" },
];

const accessibilityOptions = [
  { value: "wheelchair", label: "Wheelchair Accessible" },
  { value: "hearing", label: "Assistive Listening" },
  { value: "visual", label: "Visual Assistance" },
];

export default function FilterModal({ isOpen, onClose, onApply }: FilterModalProps) {
  const [filters, setFilters] = useState<FilterState>({
    dateRange: null,
    priceRange: [0, 500],
    categories: [],
    distance: null,
    accessibility: [],
  });

  if (!isOpen) return null;

  const handleReset = () => {
    setFilters({
      dateRange: null,
      priceRange: [0, 500],
      categories: [],
      distance: null,
      accessibility: [],
    });
  };

  const toggleCategory = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      categories: prev.categories.includes(value)
        ? prev.categories.filter((c) => c !== value)
        : [...prev.categories, value],
    }));
  };

  const toggleAccessibility = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      accessibility: prev.accessibility.includes(value)
        ? prev.accessibility.filter((a) => a !== value)
        : [...prev.accessibility, value],
    }));
  };

  const activeFilterCount =
    (filters.dateRange ? 1 : 0) +
    (filters.priceRange[0] > 0 || filters.priceRange[1] < 500 ? 1 : 0) +
    (filters.categories.length > 0 ? 1 : 0) +
    (filters.distance ? 1 : 0) +
    (filters.accessibility.length > 0 ? 1 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <button
            onClick={handleReset}
            className="text-purple-600 font-medium hover:text-purple-700"
          >
            Reset
          </button>
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Filters Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {/* Date Range */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Date</h3>
            <div className="flex flex-wrap gap-2">
              {dateOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      dateRange: prev.dateRange === option.value ? null : option.value,
                    }))
                  }
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    filters.dateRange === option.value
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Price Range</h3>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Min</label>
                <input
                  type="number"
                  value={filters.priceRange[0]}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      priceRange: [Number(e.target.value), prev.priceRange[1]],
                    }))
                  }
                  className="w-full px-3 py-2 bg-gray-100 rounded-lg text-gray-900"
                  min={0}
                  max={filters.priceRange[1]}
                />
              </div>
              <span className="text-gray-400 mt-5">—</span>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Max</label>
                <input
                  type="number"
                  value={filters.priceRange[1]}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      priceRange: [prev.priceRange[0], Number(e.target.value)],
                    }))
                  }
                  className="w-full px-3 py-2 bg-gray-100 rounded-lg text-gray-900"
                  min={filters.priceRange[0]}
                />
              </div>
            </div>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Category</h3>
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => toggleCategory(option.value)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    filters.categories.includes(option.value)
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Distance */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Distance</h3>
            <div className="flex flex-wrap gap-2">
              {[5, 10, 25, 50, 100].map((miles) => (
                <button
                  key={miles}
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      distance: prev.distance === miles ? null : miles,
                    }))
                  }
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    filters.distance === miles
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {miles} mi
                </button>
              ))}
            </div>
          </div>

          {/* Accessibility */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Accessibility</h3>
            <div className="space-y-2">
              {accessibilityOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={filters.accessibility.includes(option.value)}
                    onChange={() => toggleAccessibility(option.value)}
                    className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-gray-700">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200">
          <button
            onClick={() => onApply(filters)}
            className="w-full py-3.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
          >
            Apply Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
