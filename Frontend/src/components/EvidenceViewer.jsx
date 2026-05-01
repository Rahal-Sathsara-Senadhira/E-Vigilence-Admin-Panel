import React from "react";
import { Image, Video, Music, Maximize2, X, AlertCircle, Play, Clock } from "lucide-react";

export default function EvidenceViewer({ images = [], videos = [], audios = [] }) {
  const [activeTab, setActiveTab] = React.useState("images");
  const [imageErrors, setImageErrors] = React.useState({});
  const [videoErrors, setVideoErrors] = React.useState({});
  const [audioErrors, setAudioErrors] = React.useState({});
  const [videoDurations, setVideoDurations] = React.useState({});
  const [audioDurations, setAudioDurations] = React.useState({});

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

  const handleVideoLoadedMetadata = (idx, duration) => {
    setVideoDurations(prev => ({ ...prev, [idx]: duration }));
  };

  const handleAudioLoadedMetadata = (idx, duration) => {
    setAudioDurations(prev => ({ ...prev, [idx]: duration }));
  };

  const formatDuration = (seconds) => {
    if (!seconds || !Number.isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
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
        <div className="flex gap-1 border-b border-slate-800 mb-6 -mx-6 px-6 overflow-x-auto">
          {imageCount > 0 && (
            <button
              onClick={() => setActiveTab("images")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
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
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
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
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
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
                    className="group relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950 aspect-square transition-all hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/20"
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
              <p className="text-xs text-slate-500 text-center mt-4">Click any image to view fullscreen</p>
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
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {videoDurations[idx] && (
                        <>
                          <Clock className="h-3 w-3" />
                          <span>{formatDuration(videoDurations[idx])}</span>
                        </>
                      )}
                    </div>
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
                        className="w-full rounded-lg bg-black shadow-lg hover:shadow-xl transition-shadow"
                        controlsList="nodownload"
                        onContextMenu={handleContextMenu}
                        onError={() => handleVideoError(idx)}
                        onLoadedMetadata={(e) => handleVideoLoadedMetadata(idx, e.target.duration)}
                      >
                        Your browser does not support the video tag.
                      </video>
                    )}
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500 text-center mt-4">Full video controls: play, pause, seek, volume, and fullscreen</p>
            </div>
          )}

          {/* Audios Tab */}
          {activeTab === "audios" && audioCount > 0 && (
            <div className="space-y-3">
              {audios.map((audioUrl, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-700 bg-gradient-to-r from-slate-950/80 to-slate-900/60 overflow-hidden hover:border-slate-600 transition-colors hover:shadow-lg hover:shadow-cyan-500/10"
                >
                  <div className="px-4 py-3 border-b border-slate-800 bg-gradient-to-r from-slate-900/40 to-transparent flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Music className="h-4 w-4 text-cyan-400" />
                      <p className="text-sm font-medium text-slate-200">Audio {idx + 1}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {audioDurations[idx] && (
                        <>
                          <Clock className="h-3 w-3" />
                          <span>{formatDuration(audioDurations[idx])}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="p-4 bg-black/20">
                    {audioErrors[idx] ? (
                      <div className="bg-slate-900 rounded-lg p-4 flex items-center gap-3">
                        <AlertCircle className="h-6 w-6 text-red-400 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm text-red-400">Failed to load audio</p>
                          <p className="text-xs text-slate-500 mt-1 truncate">{audioUrl}</p>
                        </div>
                      </div>
                    ) : (
                      <audio
                        src={audioUrl}
                        controls
                        className="w-full h-10 rounded-lg bg-gradient-to-r from-slate-800 to-slate-700 hover:from-slate-700 hover:to-slate-600 transition-colors"
                        style={{
                          accentColor: "#06b6d4", // Cyan accent
                        }}
                        controlsList="nodownload"
                        onContextMenu={handleContextMenu}
                        onError={() => handleAudioError(idx)}
                        onLoadedMetadata={(e) => handleAudioLoadedMetadata(idx, e.target.duration)}
                      >
                        Your browser does not support the audio tag.
                      </audio>
                    )}
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500 text-center mt-4">Click play to listen • Use volume control and timeline to navigate</p>
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


    </div>
  );
}
