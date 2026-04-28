import React from "react";
import { Image, Video, Music, Maximize2, X, AlertCircle, Play } from "lucide-react";

export default function EvidenceViewer({ images = [], videos = [], audios = [] }) {
  const [activeTab, setActiveTab] = React.useState("images");
  const [selectedImage, setSelectedImage] = React.useState(null);
  const [imageErrors, setImageErrors] = React.useState({});
  const [videoErrors, setVideoErrors] = React.useState({});
  const [audioErrors, setAudioErrors] = React.useState({});

  // Count evidence items
  const imageCount = Array.isArray(images) ? images.length : 0;
  const videoCount = Array.isArray(videos) ? videos.length : 0;
  const audioCount = Array.isArray(audios) ? audios.length : 0;
  const hasEvidence = imageCount + videoCount + audioCount > 0;

  // Prevent right-click and context menu on media
  const handleContextMenu = (e) => {
    e.preventDefault();
    return false;
  };

  const handleImageError = (idx) => {
    setImageErrors(prev => ({ ...prev, [idx]: true }));
  };

  const handleVideoError = (idx) => {
    setVideoErrors(prev => ({ ...prev, [idx]: true }));
  };

  const handleAudioError = (idx) => {
    setAudioErrors(prev => ({ ...prev, [idx]: true }));
  };

  if (!hasEvidence) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/50 to-slate-950/50 p-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-800/50">
            <Image className="h-5 w-5 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300">Evidence</p>
            <p className="text-xs text-slate-500 mt-1">No evidence (images, videos, or audios) available.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/60 to-slate-950/60 overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4 bg-gradient-to-r from-slate-900/40 to-transparent">
        <p className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <Image className="h-4 w-4 text-cyan-400" />
          Evidence Materials
        </p>
        <p className="text-xs text-slate-500 mt-1">View attached images, videos, and audio files</p>
      </div>

      <div className="p-6">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-800 mb-6 -mx-6 px-6">
          {imageCount > 0 && (
            <button
              onClick={() => setActiveTab("images")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === "images"
                  ? "border-cyan-500 text-cyan-300 bg-cyan-500/10"
                  : "border-transparent text-slate-400 hover:text-slate-300"
              }`}
            >
              <Image className="h-4 w-4" />
              <span>Photos</span>
              <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-800/50 text-xs text-slate-300">
                {imageCount}
              </span>
            </button>
          )}

          {videoCount > 0 && (
            <button
              onClick={() => setActiveTab("videos")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === "videos"
                  ? "border-cyan-500 text-cyan-300 bg-cyan-500/10"
                  : "border-transparent text-slate-400 hover:text-slate-300"
              }`}
            >
              <Video className="h-4 w-4" />
              <span>Videos</span>
              <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-800/50 text-xs text-slate-300">
                {videoCount}
              </span>
            </button>
          )}

          {audioCount > 0 && (
            <button
              onClick={() => setActiveTab("audios")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === "audios"
                  ? "border-cyan-500 text-cyan-300 bg-cyan-500/10"
                  : "border-transparent text-slate-400 hover:text-slate-300"
              }`}
            >
              <Music className="h-4 w-4" />
              <span>Audio</span>
              <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-800/50 text-xs text-slate-300">
                {audioCount}
              </span>
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="mt-4">
          {/* Images Tab */}
          {activeTab === "images" && imageCount > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {images.map((imageUrl, idx) => (
                  <div
                    key={idx}
                    className="group relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950 aspect-square cursor-pointer transition-all hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/20"
                    onClick={() => !imageErrors[idx] && setSelectedImage(imageUrl)}
                  >
                    {imageErrors[idx] ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/50">
                        <AlertCircle className="h-6 w-6 text-red-400 mb-2" />
                        <p className="text-xs text-red-400 text-center px-2">Failed to load</p>
                      </div>
                    ) : (
                      <>
                        <img
                          src={imageUrl}
                          alt={`Evidence ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          onContextMenu={handleContextMenu}
                          draggable={false}
                          onError={() => handleImageError(idx)}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
                          <div className="flex items-center gap-2 text-white">
                            <Maximize2 className="h-5 w-5" />
                            <span className="text-xs font-medium">View</span>
                          </div>
                        </div>
                      </>
                    )}
                    <p className="absolute top-2 right-2 bg-black/70 px-2 py-1 rounded text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                      {idx + 1}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Videos Tab */}
          {activeTab === "videos" && videoCount > 0 && (
            <div className="space-y-4">
              {videos.map((videoUrl, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-700 bg-slate-950/60 overflow-hidden hover:border-slate-600 transition-colors"
                >
                  <div className="px-4 py-3 border-b border-slate-800 bg-gradient-to-r from-slate-900/40 to-transparent flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Play className="h-4 w-4 text-cyan-400" />
                      <p className="text-sm font-medium text-slate-200">Video {idx + 1}</p>
                    </div>
                    <p className="text-xs text-slate-400">MP4 Video</p>
                  </div>
                  <div className="p-4 bg-black/30">
                    {videoErrors[idx] ? (
                      <div className="w-full bg-slate-900 rounded-lg p-6 flex flex-col items-center justify-center">
                        <AlertCircle className="h-8 w-8 text-red-400 mb-3" />
                        <p className="text-sm text-red-400">Failed to load video</p>
                        <p className="text-xs text-slate-500 mt-1">{videoUrl}</p>
                      </div>
                    ) : (
                      <video
                        src={videoUrl}
                        controls
                        className="w-full rounded-lg bg-black shadow-lg"
                        controlsList="nodownload"
                        onContextMenu={handleContextMenu}
                        onError={() => handleVideoError(idx)}
                      >
                        Your browser does not support the video tag.
                      </video>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Audios Tab */}
          {activeTab === "audios" && audioCount > 0 && (
            <div className="space-y-3">
              {audios.map((audioUrl, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-700 bg-slate-950/60 overflow-hidden hover:border-slate-600 transition-colors"
                >
                  <div className="px-4 py-3 border-b border-slate-800 bg-gradient-to-r from-slate-900/40 to-transparent flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Music className="h-4 w-4 text-cyan-400" />
                      <p className="text-sm font-medium text-slate-200">Audio {idx + 1}</p>
                    </div>
                    <p className="text-xs text-slate-400">MP3 Audio</p>
                  </div>
                  <div className="p-4 bg-black/30">
                    {audioErrors[idx] ? (
                      <div className="bg-slate-900 rounded-lg p-4 flex items-center gap-3">
                        <AlertCircle className="h-6 w-6 text-red-400 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-red-400">Failed to load audio</p>
                          <p className="text-xs text-slate-500 mt-1 truncate">{audioUrl}</p>
                        </div>
                      </div>
                    ) : (
                      <audio
                        src={audioUrl}
                        controls
                        className="w-full rounded-lg"
                        controlsList="nodownload"
                        onContextMenu={handleContextMenu}
                        onError={() => handleAudioError(idx)}
                      >
                        Your browser does not support the audio tag.
                      </audio>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security Notice */}
        <div className="mt-6 pt-4 border-t border-slate-800">
          <p className="text-xs text-slate-500 flex items-center gap-2">
            <span className="inline-block w-1 h-1 rounded-full bg-cyan-400"></span>
            View-only access • Download disabled • Right-click protection enabled
          </p>
        </div>
      </div>

      {/* Fullscreen Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={selectedImage}
              alt="Fullscreen view"
              className="w-full h-full object-contain rounded-lg"
              onContextMenu={handleContextMenu}
              draggable={false}
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-10 right-0 bg-slate-800/80 hover:bg-slate-700 rounded-lg p-2 text-white transition-colors"
              title="Close (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
            <p className="absolute bottom-4 left-4 text-sm text-slate-400">Click to close • Press Esc</p>
          </div>
        </div>
      )}
    </div>
  );
}
