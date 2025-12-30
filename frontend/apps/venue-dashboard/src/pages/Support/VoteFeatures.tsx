import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ThumbsUp, MessageCircle, Plus } from "lucide-react";
import { Button } from "../../components/ui";

const features = [
  { id: 1, title: "Multi-day event support", description: "Create events that span multiple days with single purchase", category: "Events", votes: 284, comments: 42, status: "planned", voted: false },
  { id: 2, title: "Apple Wallet integration", description: "Add tickets directly to Apple Wallet", category: "Tickets", votes: 256, comments: 38, status: "in-progress", voted: true },
  { id: 3, title: "Custom email domains", description: "Send emails from your own domain", category: "Marketing", votes: 198, comments: 25, status: "planned", voted: false },
  { id: 4, title: "Waitlist functionality", description: "Allow customers to join waitlist for sold-out events", category: "Tickets", votes: 187, comments: 31, status: "under-review", voted: false },
  { id: 5, title: "Offline scanning mode", description: "Scan tickets without internet connection", category: "Scanning", votes: 156, comments: 19, status: "shipped", voted: true },
  { id: 6, title: "Recurring events", description: "Set up events that repeat on a schedule", category: "Events", votes: 145, comments: 22, status: "under-review", voted: false },
  { id: 7, title: "Group booking discounts", description: "Automatic discounts for large group purchases", category: "Tickets", votes: 132, comments: 17, status: "under-review", voted: false },
  { id: 8, title: "SMS marketing", description: "Send promotional SMS to ticket holders", category: "Marketing", votes: 121, comments: 28, status: "planned", voted: false },
];

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  "under-review": { bg: "bg-yellow-100", text: "text-yellow-700", label: "Under Review" },
  "planned": { bg: "bg-blue-100", text: "text-blue-700", label: "Planned" },
  "in-progress": { bg: "bg-purple-100", text: "text-purple-700", label: "In Progress" },
  "shipped": { bg: "bg-green-100", text: "text-green-700", label: "Shipped" },
};

export default function VoteFeatures() {
  const [featureList, setFeatureList] = useState(features);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("votes");

  const handleVote = (id: number) => {
    setFeatureList(featureList.map(f => 
      f.id === id 
        ? { ...f, voted: !f.voted, votes: f.voted ? f.votes - 1 : f.votes + 1 }
        : f
    ));
  };

  const filteredFeatures = featureList
    .filter(f => filter === "all" || f.status === filter)
    .sort((a, b) => sort === "votes" ? b.votes - a.votes : b.comments - a.comments);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Feature Requests</h1>
            <p className="text-gray-500">Vote on features you want to see</p>
          </div>
        </div>
        <Link to="/venue/support/feature-request">
          <Button>
            <Plus className="w-4 h-4" />
            Submit Request
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {["all", "under-review", "planned", "in-progress", "shipped"].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === status
                    ? "bg-purple-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {status === "all" ? "All" : statusColors[status]?.label || status}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="votes">Most Votes</option>
            <option value="comments">Most Comments</option>
          </select>
        </div>
      </div>

      {/* Feature List */}
      <div className="space-y-4">
        {filteredFeatures.map((feature) => {
          const status = statusColors[feature.status];
          return (
            <div key={feature.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start gap-4">
                {/* Vote Button */}
                <button
                  onClick={() => handleVote(feature.id)}
                  className={`flex flex-col items-center p-3 rounded-lg border transition-colors ${
                    feature.voted
                      ? "bg-purple-50 border-purple-200 text-purple-600"
                      : "bg-gray-50 border-gray-200 text-gray-600 hover:border-purple-200"
                  }`}
                >
                  <ThumbsUp className={`w-5 h-5 ${feature.voted ? "fill-purple-600" : ""}`} />
                  <span className="font-semibold mt-1">{feature.votes}</span>
                </button>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{feature.title}</h3>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.bg} ${status.text}`}>
                      {status.label}
                    </span>
                  </div>
                  <p className="text-gray-600 mb-3">{feature.description}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">{feature.category}</span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-4 h-4" />
                      {feature.comments} comments
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
