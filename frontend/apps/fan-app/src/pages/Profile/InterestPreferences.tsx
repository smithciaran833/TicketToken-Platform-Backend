import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";

interface Category {
  id: string;
  name: string;
  emoji: string;
  subcategories: string[];
}

const categories: Category[] = [
  { id: "music", name: "Music", emoji: "🎵", subcategories: ["Rock", "Hip Hop", "Electronic", "Country", "R&B", "Jazz", "Classical", "Pop", "Indie"] },
  { id: "sports", name: "Sports", emoji: "🏀", subcategories: ["Basketball", "Football", "Baseball", "Soccer", "Hockey", "Tennis", "Golf", "MMA"] },
  { id: "comedy", name: "Comedy", emoji: "😂", subcategories: ["Stand-up", "Improv", "Sketch"] },
  { id: "theater", name: "Theater", emoji: "🎭", subcategories: ["Musicals", "Plays", "Opera", "Ballet", "Dance"] },
  { id: "festivals", name: "Festivals", emoji: "🎪", subcategories: ["Music Festivals", "Food & Drink", "Art", "Cultural"] },
  { id: "family", name: "Family", emoji: "👨‍👩‍👧", subcategories: ["Kids Shows", "Theme Parks", "Exhibitions", "Educational"] },
];

export default function InterestPreferences() {
  const navigate = useNavigate();
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["music", "comedy"]);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>(["Rock", "Indie", "Stand-up"]);
  const [isSaving, setIsSaving] = useState(false);

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleSubcategory = (sub: string) => {
    setSelectedSubcategories((prev) =>
      prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    navigate("/profile/settings", { state: { interestsUpdated: true } });
  };

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Interests</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-8">
        <p className="text-gray-500">
          Select your interests to get personalized event recommendations
        </p>

        {categories.map((category) => {
          const isSelected = selectedCategories.includes(category.id);
          return (
            <div key={category.id}>
              <button
                onClick={() => toggleCategory(category.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors ${
                  isSelected
                    ? "border-purple-600 bg-purple-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="text-2xl">{category.emoji}</span>
                <span className="flex-1 text-left font-semibold text-gray-900">
                  {category.name}
                </span>
                {isSelected && (
                  <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </button>

              {isSelected && (
                <div className="flex flex-wrap gap-2 mt-3 ml-4">
                  {category.subcategories.map((sub) => {
                    const isSubSelected = selectedSubcategories.includes(sub);
                    return (
                      <button
                        key={sub}
                        onClick={() => toggleSubcategory(sub)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          isSubSelected
                            ? "bg-purple-600 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {sub}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-3.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Interests"}
        </button>
      </div>
    </div>
  );
}
