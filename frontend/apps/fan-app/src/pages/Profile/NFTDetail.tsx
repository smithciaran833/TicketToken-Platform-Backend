import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Share2, Download, Calendar, MapPin } from "lucide-react";

const mockNFT = {
  id: "1",
  eventTitle: "Japanese Breakfast",
  eventSubtitle: "Jubilee Tour 2025",
  date: "Saturday, July 15, 2025",
  venue: "The Fillmore",
  city: "San Francisco, CA",
  image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80",
  rarity: "rare",
  tokenId: "0x1234567890abcdef1234567890abcdef12345678",
  contractAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
  mintedAt: "Jul 3, 2025",
  attributes: [
    { trait: "Event Type", value: "Concert" },
    { trait: "Ticket Type", value: "General Admission" },
    { trait: "Section", value: "Floor" },
    { trait: "Edition", value: "127 of 500" },
  ],
};

const rarityStyles = {
  common: { bg: "bg-gray-100", text: "text-gray-600", glow: "" },
  rare: { bg: "bg-blue-100", text: "text-blue-600", glow: "ring-4 ring-blue-200" },
  legendary: { bg: "bg-amber-100", text: "text-amber-600", glow: "ring-4 ring-amber-200" },
};

export default function NFTDetail() {
  const { nftId: _nftId } = useParams();
  const navigate = useNavigate();

  const rarity = rarityStyles[mockNFT.rarity as keyof typeof rarityStyles];

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">NFT Details</h1>
          </div>
          <button className="p-2 rounded-full hover:bg-gray-100 transition-colors">
            <Share2 className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* NFT Image */}
        <div className={`aspect-square rounded-3xl overflow-hidden ${rarity.glow}`}>
          <img
            src={mockNFT.image}
            alt={mockNFT.eventTitle}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Title & Rarity */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${rarity.bg} ${rarity.text} capitalize`}>
              {mockNFT.rarity}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{mockNFT.eventTitle}</h2>
          {mockNFT.eventSubtitle && (
            <p className="text-gray-500">{mockNFT.eventSubtitle}</p>
          )}
        </div>

        {/* Event Details */}
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-gray-400" />
            <span className="text-gray-900">{mockNFT.date}</span>
          </div>
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-gray-400" />
            <span className="text-gray-900">{mockNFT.venue}, {mockNFT.city}</span>
          </div>
        </div>

        {/* Attributes */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">Attributes</h3>
          <div className="grid grid-cols-2 gap-3">
            {mockNFT.attributes.map((attr) => (
              <div key={attr.trait} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">{attr.trait}</p>
                <p className="font-medium text-gray-900 mt-1">{attr.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Blockchain Info */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">Blockchain Details</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Token ID</span>
              <span className="font-mono text-sm text-gray-900">
                {mockNFT.tokenId.slice(0, 8)}...{mockNFT.tokenId.slice(-6)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Minted</span>
              <span className="text-gray-900">{mockNFT.mintedAt}</span>
            </div>
            <a
              href="#"
              className="flex items-center justify-center gap-2 w-full py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View on Etherscan
            </a>
          </div>
        </div>

        {/* Actions */}
        <button className="flex items-center justify-center gap-2 w-full py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors">
          <Download className="w-5 h-5" />
          Download Image
        </button>
      </div>
    </div>
  );
}
