import { useState } from "react";
import { ArrowLeft, Star, Flag, MessageSquare } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { Button, Select, Modal, ModalFooter, Textarea, useToast, ToastContainer } from "../components/ui";

const eventName = "Summer Music Festival";

const initialReviews = [
  { 
    id: 1, 
    name: "John D.", 
    rating: 5, 
    date: "Aug 16, 2025", 
    text: "Amazing event! The lineup was incredible and the venue was perfect. Can't wait for next year!", 
    helpful: 24,
    response: null,
  },
  { 
    id: 2, 
    name: "Sarah M.", 
    rating: 4, 
    date: "Aug 16, 2025", 
    text: "Great music and atmosphere. Only complaint was the long lines for drinks. Otherwise perfect!", 
    helpful: 18,
    response: "Thanks for the feedback Sarah! We're working on adding more drink stations for next year.",
  },
  { 
    id: 3, 
    name: "Mike R.", 
    rating: 5, 
    date: "Aug 17, 2025", 
    text: "Best festival I've been to. Sound quality was top notch and staff were super friendly.", 
    helpful: 12,
    response: null,
  },
  { 
    id: 4, 
    name: "Emily K.", 
    rating: 3, 
    date: "Aug 17, 2025", 
    text: "Good music but parking was a nightmare. Took over an hour to get out after the show.", 
    helpful: 31,
    response: null,
  },
  { 
    id: 5, 
    name: "Alex T.", 
    rating: 2, 
    date: "Aug 18, 2025", 
    text: "VIP area was disappointing. Expected more amenities for the price. Regular GA would have been fine.", 
    helpful: 8,
    response: null,
  },
];

const ratingBreakdown = [
  { stars: 5, count: 156 },
  { stars: 4, count: 52 },
  { stars: 3, count: 18 },
  { stars: 2, count: 5 },
  { stars: 1, count: 3 },
];

const tabs = [
  { name: "Overview", path: "" },
  { name: "Summary", path: "/summary" },
  { name: "Reviews", path: "/reviews" },
];

export default function EventReviews() {
  const { id } = useParams();
  const basePath = "/venue/events/" + id;
  const toast = useToast();

  const [reviews, setReviews] = useState(initialReviews);
  const [sortBy, setSortBy] = useState("recent");
  const [filterBy, setFilterBy] = useState("all");
  
  const [showRespondModal, setShowRespondModal] = useState(false);
  const [respondingTo, setRespondingTo] = useState<typeof initialReviews[0] | null>(null);
  const [responseText, setResponseText] = useState("");

  const totalReviews = ratingBreakdown.reduce((sum, r) => sum + r.count, 0);
  const avgRating = ratingBreakdown.reduce((sum, r) => sum + (r.stars * r.count), 0) / totalReviews;
  const maxCount = Math.max(...ratingBreakdown.map(r => r.count));

  const openRespond = (review: typeof initialReviews[0]) => {
    setRespondingTo(review);
    setResponseText("");
    setShowRespondModal(true);
  };

  const handleRespond = () => {
    if (respondingTo && responseText) {
      setReviews(reviews.map(r => 
        r.id === respondingTo.id ? { ...r, response: responseText } : r
      ));
      setShowRespondModal(false);
      toast.success("Response posted!");
    }
  };

  const handleFlag = (_reviewId: number) => {
    toast.success("Review flagged for moderation");
  };

  const filteredReviews = reviews
    .filter(r => {
      if (filterBy === "needs-response") return !r.response;
      if (filterBy === "responded") return r.response;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "highest") return b.rating - a.rating;
      if (sortBy === "lowest") return a.rating - b.rating;
      return 0; // recent - already sorted
    });

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
            <p className="text-gray-500 mt-1">Reviews</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={
                tab.name === "Reviews"
                  ? "px-4 py-3 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Rating Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-center mb-6">
            <p className="text-5xl font-bold text-gray-900">{avgRating.toFixed(1)}</p>
            <div className="flex items-center justify-center gap-1 mt-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-5 h-5 ${star <= Math.round(avgRating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                />
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-1">{totalReviews} reviews</p>
          </div>

          <div className="space-y-2">
            {ratingBreakdown.map((rating) => (
              <div key={rating.stars} className="flex items-center gap-2">
                <span className="text-sm text-gray-600 w-12">{rating.stars} star</span>
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-yellow-400 rounded-full"
                    style={{ width: `${(rating.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="text-sm text-gray-500 w-8 text-right">{rating.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reviews List */}
        <div className="col-span-2">
          {/* Filters */}
          <div className="flex items-center justify-between mb-4">
            <Select
              options={[
                { value: "all", label: "All Reviews" },
                { value: "needs-response", label: "Needs Response" },
                { value: "responded", label: "Responded" },
              ]}
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value)}
            />
            <Select
              options={[
                { value: "recent", label: "Most Recent" },
                { value: "highest", label: "Highest Rating" },
                { value: "lowest", label: "Lowest Rating" },
              ]}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            />
          </div>

          {/* Reviews */}
          <div className="space-y-4">
            {filteredReviews.map((review) => (
              <div key={review.id} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-gray-900">{review.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-4 h-4 ${star <= review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-gray-500">{review.date}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!review.response && (
                      <Button variant="secondary" size="sm" onClick={() => openRespond(review)}>
                        <MessageSquare className="w-4 h-4" />
                        <span>Respond</span>
                      </Button>
                    )}
                    <button
                      onClick={() => handleFlag(review.id)}
                      className="p-1 text-gray-400 hover:text-red-600"
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-gray-700">{review.text}</p>

                <div className="flex items-center gap-4 mt-3">
                  <span className="text-sm text-gray-500">{review.helpful} found this helpful</span>
                </div>

                {review.response && (
                  <div className="mt-4 pl-4 border-l-2 border-purple-200 bg-purple-50 rounded-r-lg p-4">
                    <p className="text-sm font-medium text-purple-700 mb-1">Response from venue</p>
                    <p className="text-sm text-gray-700">{review.response}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Respond Modal */}
      <Modal
        isOpen={showRespondModal}
        onClose={() => setShowRespondModal(false)}
        title="Respond to Review"
        size="md"
      >
        {respondingTo && (
          <div className="space-y-4">
            {/* Original Review */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-gray-900">{respondingTo.name}</span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-3 h-3 ${star <= respondingTo.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-sm text-gray-700">{respondingTo.text}</p>
            </div>

            <Textarea
              label="Your Response"
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              rows={4}
              placeholder="Write your response..."
            />

            <p className="text-sm text-yellow-600">
              Note: Your response will be publicly visible
            </p>
          </div>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowRespondModal(false)}>Cancel</Button>
          <Button onClick={handleRespond}>Post Response</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
