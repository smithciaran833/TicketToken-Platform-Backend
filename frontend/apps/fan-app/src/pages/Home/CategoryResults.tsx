import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, SlidersHorizontal, Calendar, MapPin } from "lucide-react";
import FilterModal from "./FilterModal";

const categoryData: Record<string, { name: string; subcategories: string[] }> = {
  music: {
    name: "Music",
    subcategories: ["All", "Rock", "Hip Hop", "Electronic", "Country", "R&B", "Jazz", "Classical"],
  },
  sports: {
    name: "Sports",
    subcategories: ["All", "Basketball", "Football", "Baseball", "Soccer", "Hockey", "Tennis"],
  },
  comedy: {
    name: "Comedy",
    subcategories: ["All", "Stand-up", "Improv", "Sketch"],
  },
  theater: {
    name: "Theater",
    subcategories: ["All", "Musicals", "Plays", "Opera", "Ballet"],
  },
  festivals: {
    name: "Festivals",
    subcategories: ["All", "Music", "Food", "Art", "Cultural"],
  },
  family: {
    name: "Family",
    subcategories: ["All", "Kids Shows", "Theme Parks", "Exhibitions"],
  },
};

const mockEvents = [
  { id: "1", title: "Japanese Breakfast", date: "Sat, Jul 15", venue: "The Fillmore", city: "San Francisco", price: 45, image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80" },
  { id: "2", title: "Khruangbin", date: "Thu, Aug 3", venue: "The Greek Theatre", city: "Berkeley", price: 65, image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&q=80" },
  { id: "3", title: "Turnstile", date: "Fri, Aug 18", venue: "The Warfield", city: "San Francisco", price: 40, image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&q=80" },
  { id: "4", title: "Caroline Polachek", date: "Sat, Sep 2", venue: "The Fox Theater", city: "Oakland", price: 55, image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=300&q=80" },
];

export default function CategoryResults() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const [activeSubcategory, setActiveSubcategory] = useState("All");
  const [showFilterModal, setShowFilterModal] = useState(false);

  const category = categoryData[categoryId || "music"] || categoryData.music;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">{category.name}</h1>
          </div>
          <button
            onClick={() => setShowFilterModal(true)}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <SlidersHorizontal className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Subcategories */}
        <div className="flex px-5 pb-3 gap-2 overflow-x-auto">
          {category.subcategories.map((sub) => (
            <button
              key={sub}
              onClick={() => setActiveSubcategory(sub)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeSubcategory === sub
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      </header>

      {/* Results */}
      <div className="px-5 py-6">
        <p className="text-sm text-gray-500 mb-4">{mockEvents.length} events</p>

        <div className="space-y-4">
          {mockEvents.map((event) => (
            <Link
              key={event.id}
              to={`/event/${event.id}`}
              className="block bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all"
            >
              <div className="flex gap-4 p-3">
                <img
                  src={event.image}
                  alt={event.title}
                  className="w-24 h-24 object-cover rounded-xl"
                />
                <div className="flex-1 min-w-0 py-1">
                  <h3 className="font-semibold text-gray-900">{event.title}</h3>
                  <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{event.date}</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{event.venue}, {event.city}</span>
                  </div>
                  <p className="text-purple-600 font-semibold mt-2">From ${event.price}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Filter Modal */}
      <FilterModal
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onApply={() => setShowFilterModal(false)}
      />
    </div>
  );
}
