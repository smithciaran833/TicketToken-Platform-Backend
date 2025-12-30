import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Upload, X, GripVertical, Play, Plus, Image } from "lucide-react";
import { Button, Input, useToast, ToastContainer } from "../../components/ui";

const mockPhotos = [
  { id: 1, url: "/placeholder-1.jpg", alt: "Main stage" },
  { id: 2, url: "/placeholder-2.jpg", alt: "Seating area" },
  { id: 3, url: "/placeholder-3.jpg", alt: "Lobby" },
  { id: 4, url: "/placeholder-4.jpg", alt: "Bar area" },
  { id: 5, url: "/placeholder-5.jpg", alt: "VIP section" },
];

const mockVideos = [
  { id: 1, url: "https://youtube.com/watch?v=abc123", title: "Venue Tour", thumbnail: "/video-thumb-1.jpg" },
  { id: 2, url: "https://vimeo.com/123456", title: "2024 Highlights", thumbnail: "/video-thumb-2.jpg" },
];

export default function VenueMedia() {
  const toast = useToast();
  const [photos, setPhotos] = useState(mockPhotos);
  const [videos, setVideos] = useState(mockVideos);
  const [newVideoUrl, setNewVideoUrl] = useState("");

  const handleDeletePhoto = (id: number) => {
    setPhotos(photos.filter(p => p.id !== id));
    toast.success("Photo deleted");
  };

  const handleAddVideo = () => {
    if (!newVideoUrl.trim()) {
      toast.error("Please enter a video URL");
      return;
    }
    toast.success("Video added!");
    setNewVideoUrl("");
  };

  const handleDeleteVideo = (id: number) => {
    setVideos(videos.filter(v => v.id !== id));
    toast.success("Video removed");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Photos & Videos</h1>
            <p className="text-gray-500">Manage your venue media</p>
          </div>
        </div>
      </div>

      {/* Cover Photo */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Cover Photo</h2>
        <div className="aspect-[3/1] bg-gray-100 rounded-lg flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-purple-800" />
          <div className="relative z-10 text-center text-white">
            <Image className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm opacity-75">Current cover photo</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">Recommended: 1920x640 pixels</p>
          <Button variant="secondary">
            <Upload className="w-4 h-4" />
            Change Cover
          </Button>
        </div>
      </div>

      {/* Photo Gallery */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Photo Gallery</h2>
          <Button variant="secondary">
            <Plus className="w-4 h-4" />
            Add Photos
          </Button>
        </div>
        <p className="text-sm text-gray-500 mb-4">Drag to reorder. First photo appears in search results.</p>
        
        <div className="grid grid-cols-4 gap-4">
          {photos.map((photo, index) => (
            <div key={photo.id} className="relative group aspect-square bg-gray-100 rounded-lg overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                <Image className="w-8 h-8 text-gray-400" />
              </div>
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button className="p-1 bg-white rounded text-gray-600 hover:text-gray-900">
                  <GripVertical className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDeletePhoto(photo.id)}
                  className="p-1 bg-white rounded text-red-600 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {index === 0 && (
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-purple-600 text-white text-xs rounded">
                  Primary
                </span>
              )}
            </div>
          ))}
          <button className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-purple-300 hover:text-purple-500 transition-colors">
            <Plus className="w-8 h-8 mb-1" />
            <span className="text-sm">Add</span>
          </button>
        </div>
      </div>

      {/* Videos */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Videos</h2>
        
        <div className="flex gap-3 mb-4">
          <Input
            label=""
            placeholder="Paste YouTube or Vimeo URL..."
            value={newVideoUrl}
            onChange={(e) => setNewVideoUrl(e.target.value)}
          />
          <Button onClick={handleAddVideo}>Add Video</Button>
        </div>

        <div className="space-y-3">
          {videos.map((video) => (
            <div key={video.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
              <div className="w-24 h-14 bg-gray-200 rounded flex items-center justify-center">
                <Play className="w-6 h-6 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{video.title}</p>
                <p className="text-sm text-gray-500 truncate">{video.url}</p>
              </div>
              <button 
                onClick={() => handleDeleteVideo(video.id)}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ))}
          {videos.length === 0 && (
            <p className="text-center text-gray-500 py-8">No videos added yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
