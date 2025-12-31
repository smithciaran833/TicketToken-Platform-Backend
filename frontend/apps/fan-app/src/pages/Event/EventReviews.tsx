import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Star, ThumbsUp, ChevronDown } from "lucide-react";

interface Review {
  id: string;
  userName: string;
  userImage?: string;
  rating: number;
  date: string;
  text: string;
  helpfulCount: number;
  isHelpful?: boolean;
}

const mockReviews: Review[] = [
  {
    id: "1",
    userName: "Sarah M.",
    rating: 5,
    date: "Jul 20, 2025",
    text: "Incredible show! Michelle's voice was even better live. The Fillmore's acoustics made every song feel intimate. Highly recommend getting floor tickets if you can.",
    helpfulCount: 24,
  },
  {
    id: "2",
    userName: "James K.",
    rating: 4,
    date: "Jul 18, 2025",
    text: "Great performance overall. The setlist was perfect, mixing old favorites with new tracks. Only downside was the venue got pretty warm. Bring layers you can remove!",
    helpfulCount: 12,
  },
  {
    id: "3",
    userName: "Alex T.",
    rating: 5,
    date: "Jul 16, 2025",
    text: "This was my third time seeing Japanese Breakfast and it keeps getting better. The light show for this tour is stunning. Worth every penny.",
    helpfulCount: 18,
  },
  {
    id: "4",
    userName: "Maria L.",
    rating: 3,
    date: "Jul 15, 2025",
    text: "Good show but the opener went on too long. Sound mixing could have been better in the back sections. The main act was solid though.",
    helpfulCount: 5,
  },
];

const ratingBreakdown = [
  { stars: 5, count: 156, percentage: 65 },
  { stars: 4, count: 52, percentage: 22 },
  { stars: 3, count: 20, percentage: 8 },
  { stars: 2, count: 8, percentage: 3 },
  { stars: 1, count: 4, percentage: 2 },
];

const sortOptions = [
  { value: "recent", label: "Most Recent" },
  { value: "highest", label: "Highest Rated" },
  { value: "lowest", label: "Lowest Rated" },
  { value: "helpful", label: "Most Helpful" },
];

export default function EventReviews() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reviews, setReviews] = useState(mockReviews);
  const [sortBy, setSortBy] = useState("recent");
  const [showSortMenu, setShowSortMenu] = useState(false);

  const averageRating = 4.5;
  const totalReviews = 240;

  const handleHelpful = (reviewId: string) => {
    setReviews((prev) =>
      prev.map((review) =>
        review.id === reviewId
          ? {
              ...review,
              isHelpful: !review.isHelpful,
              helpfulCount: review.isHelpful
                ? review.helpfulCount - 1
                : review.helpfulCount + 1,
            }
          : review
      )
    );
  };

  const renderStars = (rating: number, size: "sm" | "lg" = "sm") => {
    const sizeClass = size === "lg" ? "w-6 h-6" : "w-4 h-4";
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${sizeClass} ${
              star <= rating
                ? "fill-yellow-400 text-yellow-400"
                : "fill-gray-200 text-gray-200"
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Reviews</h1>
        </div>
      </header>

      <div className="px-5 py-6">
        {/* Rating Summary */}
        <div className="flex items-start gap-6 mb-8">
          <div className="text-center">
            <p className="text-5xl font-bold text-gray-900">{averageRating}</p>
            <div className="mt-1">{renderStars(Math.round(averageRating), "lg")}</div>
            <p className="text-sm text-gray-500 mt-1">{totalReviews} reviews</p>
          </div>

          <div className="flex-1 space-y-2">
            {ratingBreakdown.map((item) => (
              <div key={item.stars} className="flex items-center gap-2">
                <span className="text-sm text-gray-600 w-3">{item.stars}</span>
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 rounded-full"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
                <span className="text-sm text-gray-500 w-8">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sort & Write Review */}
        <div className="flex items-center justify-between mb-6">
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
            >
              {sortOptions.find((o) => o.value === sortBy)?.label}
              <ChevronDown className="w-4 h-4" />
            </button>
            {showSortMenu && (
              <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 py-2 min-w-[160px] z-20">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSortBy(option.value);
                      setShowSortMenu(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                      sortBy === option.value
                        ? "text-purple-600 font-medium"
                        : "text-gray-700"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Link
            to={`/event/${id}/write-review`}
            className="px-4 py-2 bg-purple-600 text-white rounded-full text-sm font-semibold hover:bg-purple-700 transition-colors"
          >
            Write Review
          </Link>
        </div>

        {/* Reviews List */}
        <div className="space-y-6">
          {reviews.map((review) => (
            <div key={review.id} className="pb-6 border-b border-gray-100 last:border-0">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-purple-600 font-semibold">
                    {review.userName.charAt(0)}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900">{review.userName}</p>
                    <p className="text-sm text-gray-500">{review.date}</p>
                  </div>
                  <div className="mt-0.5">{renderStars(review.rating)}</div>
                </div>
              </div>

              <p className="text-gray-600 leading-relaxed mb-3">{review.text}</p>

              <button
                onClick={() => handleHelpful(review.id)}
                className={`flex items-center gap-1.5 text-sm ${
                  review.isHelpful
                    ? "text-purple-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <ThumbsUp
                  className={`w-4 h-4 ${review.isHelpful ? "fill-purple-600" : ""}`}
                />
                <span>Helpful ({review.helpfulCount})</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
