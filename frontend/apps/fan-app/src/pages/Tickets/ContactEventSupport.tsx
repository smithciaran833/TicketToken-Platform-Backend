import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, X, CheckCircle } from "lucide-react";

const mockEvent = {
  title: "Japanese Breakfast",
  date: "Sat, Jul 15, 2025",
};

const issueTypes = [
  { value: "not-received", label: "Ticket not received" },
  { value: "wrong-ticket", label: "Wrong ticket" },
  { value: "cant-access", label: "Can't access ticket" },
  { value: "event-question", label: "Event question" },
  { value: "accessibility", label: "Accessibility request" },
  { value: "other", label: "Other" },
];

export default function ContactEventSupport() {
  const { ticketId: _ticketId } = useParams();
  const navigate = useNavigate();
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newPhotos = Array.from(files).map((file) =>
        URL.createObjectURL(file)
      );
      setPhotos((prev) => [...prev, ...newPhotos].slice(0, 3));
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!issueType || !description.trim()) return;

    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    setIsSubmitted(true);
  };

  const isValid = issueType && description.trim().length > 10;

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-5 py-12">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Request Submitted</h1>
          <p className="text-gray-500 text-center max-w-xs">
            We've received your request and will respond within 24 hours.
          </p>
          <p className="text-sm text-gray-400 mt-4">Reference: #SUP-{Date.now().toString(36).toUpperCase()}</p>
        </div>

        <div className="px-5 py-4 border-t border-gray-200">
          <button
            onClick={() => navigate("/tickets")}
            className="w-full py-3.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-32">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Event Support</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Event Info */}
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="font-semibold text-gray-900">{mockEvent.title}</p>
          <p className="text-sm text-gray-500">{mockEvent.date}</p>
        </div>

        {/* Issue Type */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Issue Type
          </label>
          <select
            value={issueType}
            onChange={(e) => setIssueType(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Select an issue...</option>
            {issueTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Please describe your issue in detail..."
            rows={5}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
          <p className="text-sm text-gray-400 mt-1">Minimum 10 characters</p>
        </div>

        {/* Photo Upload */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Attach Photos (Optional)
          </label>

          <div className="flex flex-wrap gap-3">
            {photos.map((photo, index) => (
              <div key={index} className="relative w-20 h-20">
                <img
                  src={photo}
                  alt={`Upload ${index + 1}`}
                  className="w-full h-full object-cover rounded-xl"
                />
                <button
                  onClick={() => removePhoto(index)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            {photos.length < 3 && (
              <label className="w-20 h-20 bg-gray-100 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors">
                <Camera className="w-6 h-6 text-gray-400" />
                <span className="text-xs text-gray-400 mt-1">Add</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-4">
        <button
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className={`w-full py-3.5 rounded-xl font-semibold text-lg transition-all ${
            isValid && !isSubmitting
              ? "bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isSubmitting ? "Submitting..." : "Submit"}
        </button>
      </div>
    </div>
  );
}
