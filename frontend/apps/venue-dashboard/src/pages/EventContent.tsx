import { useState } from "react";
import { ArrowLeft, Upload, X, GripVertical, Plus, Youtube } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { Button, Input, Textarea, useToast, ToastContainer } from "../components/ui";

const eventName = "Summer Music Festival";

const initialContent = {
  description: "Join us for the biggest music festival of the summer featuring top artists from around the world. Experience three stages of live music, food vendors, and an unforgettable atmosphere.\n\nThis year's lineup includes chart-topping headliners and emerging talent across multiple genres.",
  primaryImage: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&h=400&fit=crop",
  gallery: [
    { id: 1, url: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&h=300&fit=crop" },
    { id: 2, url: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=300&fit=crop" },
    { id: 3, url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=300&fit=crop" },
  ],
  videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  tags: ["music", "festival", "summer", "live", "outdoor"],
  seo: {
    metaTitle: "Summer Music Festival 2025 | TicketToken",
    metaDescription: "Get tickets for Summer Music Festival 2025. Three stages, top artists, unforgettable atmosphere.",
  },
};

const tabs = [
  { name: "Overview", path: "" },
  { name: "Content", path: "/content" },
  { name: "Tickets", path: "/tickets" },
  { name: "Sales", path: "/sales" },
  { name: "Guest List", path: "/guests" },
  { name: "Settings", path: "/settings" },
];

export default function EventContent() {
  const { id } = useParams();
  const basePath = "/venue/events/" + id;
  const toast = useToast();

  const [content, setContent] = useState(initialContent);
  const [newTag, setNewTag] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success("Content saved successfully!");
  };

  const addTag = () => {
    if (newTag && !content.tags.includes(newTag.toLowerCase())) {
      setContent({ ...content, tags: [...content.tags, newTag.toLowerCase()] });
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setContent({ ...content, tags: content.tags.filter(t => t !== tag) });
  };

  const removeGalleryImage = (imageId: number) => {
    setContent({ ...content, gallery: content.gallery.filter(img => img.id !== imageId) });
  };

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to={`/venue/events/${id}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{eventName}</h1>
            <p className="text-gray-500 mt-1">Manage event content</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={
                tab.name === "Content"
                  ? "px-4 py-3 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {/* Description */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
          <Textarea
            value={content.description}
            onChange={(e) => setContent({ ...content, description: e.target.value })}
            rows={6}
            placeholder="Describe your event..."
            helper="This description will be shown on your event page"
          />
        </div>

        {/* Primary Image */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Primary Image</h2>
          <div className="relative">
            <img
              src={content.primaryImage}
              alt="Primary event image"
              className="w-full h-64 object-cover rounded-lg"
            />
            <button className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-md hover:bg-gray-100">
              <Upload className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">Recommended: 1920x1080px, JPG or PNG</p>
        </div>

        {/* Image Gallery */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Image Gallery</h2>
            <Button variant="secondary" size="sm">
              <Plus className="w-4 h-4" />
              <span>Add Images</span>
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {content.gallery.map((image) => (
              <div key={image.id} className="relative group">
                <img
                  src={image.url}
                  alt="Gallery image"
                  className="w-full h-32 object-cover rounded-lg"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                  <button className="p-1 bg-white rounded">
                    <GripVertical className="w-4 h-4 text-gray-600" />
                  </button>
                  <button
                    onClick={() => removeGalleryImage(image.id)}
                    className="p-1 bg-white rounded"
                  >
                    <X className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>
            ))}
            <button className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-purple-500 hover:text-purple-500 transition-colors">
              <Upload className="w-6 h-6 mb-1" />
              <span className="text-sm">Upload</span>
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">Drag images to reorder</p>
        </div>

        {/* Video */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Video</h2>
          <div className="flex items-center gap-2 mb-4">
            <Youtube className="w-5 h-5 text-red-500" />
            <span className="text-sm text-gray-500">YouTube or Vimeo URL</span>
          </div>
          <Input
            value={content.videoUrl}
            onChange={(e) => setContent({ ...content, videoUrl: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </div>

        {/* Tags */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tags</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {content.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm"
              >
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-purple-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add a tag..."
              onKeyDown={(e) => e.key === "Enter" && addTag()}
            />
            <Button variant="secondary" onClick={addTag}>Add</Button>
          </div>
        </div>

        {/* SEO */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">SEO Settings</h2>
          <div className="space-y-4">
            <Input
              label="Meta Title"
              value={content.seo.metaTitle}
              onChange={(e) => setContent({ ...content, seo: { ...content.seo, metaTitle: e.target.value } })}
              helper={`${content.seo.metaTitle.length}/60 characters`}
            />
            <Textarea
              label="Meta Description"
              value={content.seo.metaDescription}
              onChange={(e) => setContent({ ...content, seo: { ...content.seo, metaDescription: e.target.value } })}
              rows={2}
              helper={`${content.seo.metaDescription.length}/160 characters`}
            />
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-2">Search Preview</p>
              <p className="text-blue-600 text-lg">{content.seo.metaTitle}</p>
              <p className="text-green-700 text-sm">tickettoken.com/events/summer-music-festival</p>
              <p className="text-gray-600 text-sm">{content.seo.metaDescription}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
