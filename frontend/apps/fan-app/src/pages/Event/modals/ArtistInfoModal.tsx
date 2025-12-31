import { Users, Calendar, ExternalLink } from "lucide-react";
import Modal from "../../../components/ui/Modal";

interface ArtistInfo {
  id: string;
  name: string;
  image: string;
  genres: string[];
  bio: string;
  followers: number;
  streamingLinks?: {
    spotify?: string;
    appleMusic?: string;
    youtube?: string;
  };
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    tiktok?: string;
  };
}

interface ArtistInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  artist: ArtistInfo;
  isFollowing?: boolean;
  onFollow?: () => void;
}

export default function ArtistInfoModal({
  isOpen,
  onClose,
  artist,
  isFollowing = false,
  onFollow,
}: ArtistInfoModalProps) {
  const formatFollowers = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="md">
      <div className="-mx-6 -mt-4">
        {/* Artist Image */}
        <div className="aspect-square w-full max-h-64">
          <img
            src={artist.image}
            alt={artist.name}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="px-6 py-5">
          {/* Artist Name & Genres */}
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-900">{artist.name}</h2>
            <div className="flex flex-wrap gap-2 mt-2">
              {artist.genres.map((genre) => (
                <span
                  key={genre}
                  className="px-2.5 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded-full"
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>

          {/* Followers */}
          <div className="flex items-center gap-2 text-gray-500 mb-4">
            <Users className="w-4 h-4" />
            <span>{formatFollowers(artist.followers)} followers</span>
          </div>

          {/* Bio */}
          <p className="text-gray-600 leading-relaxed mb-6">{artist.bio}</p>

          {/* Streaming Links */}
          {artist.streamingLinks && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Listen On
              </h3>
              <div className="flex gap-3">
                {artist.streamingLinks.spotify && (
                  
                    <a
                      href={artist.streamingLinks.spotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-[#1DB954] text-white rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Spotify
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {artist.streamingLinks.appleMusic && (
                  
                    <a
                      href={artist.streamingLinks.appleMusic}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#FA2D48] to-[#A833B9] text-white rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Apple Music
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {artist.streamingLinks.youtube && (
                  
                    <a
                      href={artist.streamingLinks.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-[#FF0000] text-white rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    YouTube
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Social Links */}
          {artist.socialLinks && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Follow
              </h3>
              <div className="flex gap-3">
                {artist.socialLinks.instagram && (
                  
                    <a
                      href={artist.socialLinks.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    Instagram
                  </a>
                )}
                {artist.socialLinks.twitter && (
                  
                    <a
                      href={artist.socialLinks.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    Twitter
                  </a>
                )}
                {artist.socialLinks.tiktok && (
                  
                    <a
                      href={artist.socialLinks.tiktok}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    TikTok
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onFollow}
              className={`flex-1 py-3 rounded-xl font-semibold transition-colors ${
                isFollowing
                  ? "bg-gray-100 text-gray-900 hover:bg-gray-200"
                  : "bg-purple-600 text-white hover:bg-purple-700"
              }`}
            >
              {isFollowing ? "Following" : "Follow Artist"}
            </button>
            
              <a
                href={`/search?artist=${artist.id}`}
              className="flex items-center justify-center gap-2 flex-1 py-3 bg-gray-100 text-gray-900 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              <Calendar className="w-5 h-5" />
              All Events
            </a>
          </div>
        </div>
      </div>
    </Modal>
  );
}
