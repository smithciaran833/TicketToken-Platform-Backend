import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles} from "lucide-react";

interface NFT {
  id: string;
  eventTitle: string;
  date: string;
  venue: string;
  image: string;
  rarity: "common" | "rare" | "legendary";
  tokenId: string;
}

const mockNFTs: NFT[] = [
  {
    id: "1",
    eventTitle: "Japanese Breakfast",
    date: "Jul 15, 2025",
    venue: "The Fillmore",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80",
    rarity: "rare",
    tokenId: "0x1234...5678",
  },
  {
    id: "2",
    eventTitle: "Khruangbin",
    date: "Aug 3, 2025",
    venue: "The Greek Theatre",
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&q=80",
    rarity: "common",
    tokenId: "0x2345...6789",
  },
  {
    id: "3",
    eventTitle: "Bon Iver",
    date: "Mar 22, 2025",
    venue: "Chase Center",
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&q=80",
    rarity: "legendary",
    tokenId: "0x3456...7890",
  },
];

const rarityStyles = {
  common: { bg: "bg-gray-100", text: "text-gray-600", label: "Common" },
  rare: { bg: "bg-blue-100", text: "text-blue-600", label: "Rare" },
  legendary: { bg: "bg-amber-100", text: "text-amber-600", label: "Legendary" },
};

export default function NFTCollection() {
  const navigate = useNavigate();
  const [nfts] = useState(mockNFTs);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">NFT Collection</h1>
        </div>
      </header>

      <div className="px-5 py-6">
        {/* Info Banner */}
        <div className="bg-purple-50 rounded-xl p-4 mb-6 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-purple-600 mt-0.5" />
          <div>
            <p className="font-medium text-purple-900">Collectible Ticket NFTs</p>
            <p className="text-sm text-purple-700 mt-1">
              Each ticket you purchase becomes a unique digital collectible on the blockchain.
            </p>
          </div>
        </div>

        {nfts.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">No NFTs yet</h2>
            <p className="text-gray-500 mb-6">Your ticket NFTs will appear here</p>
            <Link
              to="/"
              className="inline-block px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
            >
              Browse Events
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {nfts.map((nft) => {
              const rarity = rarityStyles[nft.rarity];
              return (
                <Link
                  key={nft.id}
                  to={`/profile/nfts/${nft.id}`}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="aspect-square relative">
                    <img
                      src={nft.image}
                      alt={nft.eventTitle}
                      className="w-full h-full object-cover"
                    />
                    <span className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-semibold ${rarity.bg} ${rarity.text}`}>
                      {rarity.label}
                    </span>
                  </div>
                  <div className="p-3">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{nft.eventTitle}</h3>
                    <p className="text-xs text-gray-500 mt-1">{nft.date}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
