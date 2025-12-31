import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, X, TrendingUp, Clock } from "lucide-react";

const recentSearches = [
  "Japanese Breakfast",
  "The Fillmore",
  "Comedy shows",
];

const trendingSearches = [
  "Tyler the Creator",
  "Warriors vs Lakers",
  "Outside Lands",
  "Dave Chappelle",
  "Hamilton",
];

const quickCategories = [
  { id: "music", label: "Music", emoji: "🎵" },
  { id: "sports", label: "Sports", emoji: "🏀" },
  { id: "comedy", label: "Comedy", emoji: "😂" },
  { id: "theater", label: "Theater", emoji: "🎭" },
  { id: "festivals", label: "Festivals", emoji: "🎪" },
  { id: "family", label: "Family", emoji: "👨‍👩‍👧" },
];

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [recentList, setRecentList] = useState(recentSearches);

  const handleSearch = (searchTerm: string) => {
    if (searchTerm.trim()) {
      navigate(`/search/results?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch(query);
    }
  };

  const clearRecent = () => {
    setRecentList([]);
  };

  const removeRecentItem = (item: string) => {
    setRecentList((prev) => prev.filter((i) => i !== item));
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex-1 flex items-center gap-3 bg-gray-100 rounded-xl px-4 py-2.5">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search events, artists, venues..."
              className="flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-400"
            />
            {query && (
              <button onClick={() => setQuery("")}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            )}
          </div>
          <button
            onClick={() => navigate(-1)}
            className="text-purple-600 font-medium"
          >
            Cancel
          </button>
        </div>
      </header>

      <div className="p-5 space-y-8">
        {/* Quick Categories */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Browse Categories
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {quickCategories.map((cat) => (
              <Link
                key={cat.id}
                to={`/search/category/${cat.id}`}
                className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <span className="text-2xl">{cat.emoji}</span>
                <span className="text-sm font-medium text-gray-700">{cat.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Searches */}
        {recentList.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Recent Searches
              </h2>
              <button
                onClick={clearRecent}
                className="text-sm text-purple-600 font-medium hover:text-purple-700"
              >
                Clear
              </button>
            </div>
            <div className="space-y-1">
              {recentList.map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                >
                  <button
                    onClick={() => handleSearch(item)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{item}</span>
                  </button>
                  <button
                    onClick={() => removeRecentItem(item)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trending Searches */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Trending
          </h2>
          <div className="space-y-1">
            {trendingSearches.map((item, index) => (
              <button
                key={item}
                onClick={() => handleSearch(item)}
                className="flex items-center gap-3 w-full py-3 border-b border-gray-100 last:border-0 text-left hover:bg-gray-50 -mx-2 px-2 rounded-lg"
              >
                <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <span className="text-gray-700">{item}</span>
                <span className="text-gray-400 text-sm ml-auto">#{index + 1}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
