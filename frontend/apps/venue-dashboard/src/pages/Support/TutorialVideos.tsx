import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, Clock } from "lucide-react";

const categories = ["All", "Getting Started", "Events", "Scanning", "Analytics", "Settings"];

const videos = [
  { id: 1, title: "Getting Started with TicketToken", category: "Getting Started", duration: "5:32", thumbnail: null },
  { id: 2, title: "Creating Your First Event", category: "Events", duration: "8:15", thumbnail: null },
  { id: 3, title: "Setting Up Ticket Types", category: "Events", duration: "6:45", thumbnail: null },
  { id: 4, title: "Using the Scanner App", category: "Scanning", duration: "4:20", thumbnail: null },
  { id: 5, title: "Understanding Analytics", category: "Analytics", duration: "7:10", thumbnail: null },
  { id: 6, title: "Managing Your Team", category: "Settings", duration: "5:55", thumbnail: null },
  { id: 7, title: "Processing Refunds", category: "Events", duration: "3:45", thumbnail: null },
  { id: 8, title: "Creating Promo Codes", category: "Events", duration: "4:30", thumbnail: null },
  { id: 9, title: "Configuring Payouts", category: "Settings", duration: "6:20", thumbnail: null },
];

export default function TutorialVideos() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [playingVideo, setPlayingVideo] = useState<number | null>(null);

  const filteredVideos = selectedCategory === "All" 
    ? videos 
    : videos.filter(v => v.category === selectedCategory);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tutorial Videos</h1>
            <p className="text-gray-500">Learn how to use TicketToken</p>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              selectedCategory === category
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Video Grid */}
      <div className="grid grid-cols-3 gap-6">
        {filteredVideos.map((video) => (
          <div key={video.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
            {/* Thumbnail */}
            <button
              onClick={() => setPlayingVideo(video.id)}
              className="relative w-full aspect-video bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center group"
            >
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <Play className="w-8 h-8 text-white fill-white" />
              </div>
              <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 rounded text-white text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {video.duration}
              </div>
            </button>

            {/* Info */}
            <div className="p-4">
              <h3 className="font-medium text-gray-900 mb-1">{video.title}</h3>
              <p className="text-sm text-purple-600">{video.category}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Video Modal */}
      {playingVideo && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setPlayingVideo(null)}>
          <div className="w-full max-w-4xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="aspect-video bg-black rounded-lg flex items-center justify-center">
              <p className="text-white">Video Player Placeholder</p>
            </div>
            <div className="mt-4 flex justify-between items-center">
              <h3 className="text-white font-medium">
                {videos.find(v => v.id === playingVideo)?.title}
              </h3>
              <button 
                onClick={() => setPlayingVideo(null)}
                className="text-white hover:text-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
