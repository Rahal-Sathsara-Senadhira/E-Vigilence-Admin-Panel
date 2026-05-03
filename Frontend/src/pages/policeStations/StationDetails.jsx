import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../services/api";
import { MapPin, AlertCircle, Loader, ArrowLeft, Image, Video } from "lucide-react";
import EvidenceViewer from "../../components/EvidenceViewer";

export default function StationDetails() {
  const navigate = useNavigate();
  const { stationId } = useParams();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [station, setStation] = React.useState(null);
  const [violations, setViolations] = React.useState([]);
  const [allEvidence, setAllEvidence] = React.useState({
    images: [],
    videos: [],
    audios: [],
  });

  React.useEffect(() => {
    loadData();
  }, [stationId]);

  async function loadData() {
    try {
      setError("");
      setLoading(true);

      const res = await api.get(`/api/police-stations/${stationId}/violations`);

      const stationData = res?.station || res?.data?.station;
      const violationsData = res?.violations || res?.data?.violations || [];

      if (!stationData) {
        setError("Station not found");
        return;
      }

      setStation(stationData);
      setViolations(violationsData);

      // Aggregate all evidence from all violations
      const images = [];
      const videos = [];
      const audios = [];

      violationsData.forEach((violation) => {
        if (Array.isArray(violation.images)) {
          images.push(...violation.images.map(img => ({
            url: img,
            violationId: violation._id,
            violationTitle: violation.title,
          })));
        }
        if (Array.isArray(violation.videos)) {
          videos.push(...violation.videos.map(vid => ({
            url: vid,
            violationId: violation._id,
            violationTitle: violation.title,
          })));
        }
        if (Array.isArray(violation.audios)) {
          audios.push(...violation.audios.map(aud => ({
            url: aud,
            violationId: violation._id,
            violationTitle: violation.title,
          })));
        }
      });

      setAllEvidence({
        images: images.map(img => img.url),
        videos: videos.map(vid => vid.url),
        audios: audios.map(aud => aud.url),
      });
    } catch (e) {
      console.error("Error loading station data:", e);
      setError(e.message || "Failed to load station details");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-slate-300">
          <Loader className="h-5 w-5 animate-spin" />
          <span>Loading station details...</span>
        </div>
      </div>
    );
  }

  if (error || !station) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate("/police-stations")}
          className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Stations
        </button>

        <div className="rounded-2xl border border-red-900/30 bg-red-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">Error</p>
            <p className="text-sm text-red-400/80 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const imageCount = allEvidence.images.length;
  const videoCount = allEvidence.videos.length;
  const audioCount = allEvidence.audios.length;
  const totalEvidence = imageCount + videoCount + audioCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate("/police-stations")}
          className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Stations
        </button>

        <h1 className="text-2xl font-bold text-slate-100">{station.name}</h1>
        {station.area && (
          <div className="flex items-center gap-2 mt-2 text-slate-400">
            <MapPin className="h-4 w-4" />
            <span>{station.area}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-400">Assigned Violations</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{violations.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-400">Total Evidence Files</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{totalEvidence}</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-400">Evidence Types</p>
          <div className="flex gap-2 mt-2">
            {imageCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/50 text-xs text-slate-300">
                <Image className="h-3 w-3" />
                {imageCount}
              </span>
            )}
            {videoCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/50 text-xs text-slate-300">
                <Video className="h-3 w-3" />
                {videoCount}
              </span>
            )}
            {totalEvidence === 0 && (
              <span className="text-xs text-slate-500">No evidence</span>
            )}
          </div>
        </div>
      </div>

      {/* Evidence Gallery */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Evidence Gallery</h2>

        {totalEvidence === 0 ? (
          <div className="text-center py-8">
            <Image className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No evidence files available for this station</p>
          </div>
        ) : (
          <EvidenceViewer
            images={allEvidence.images}
            videos={allEvidence.videos}
            audios={allEvidence.audios}
          />
        )}
      </div>

      {/* Violations List */}
      <div>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Assigned Violations</h2>

        {violations.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center">
            <p className="text-slate-400">No violations assigned to this station</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {violations.map((violation) => (
              <div
                key={violation._id}
                className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 hover:border-cyan-600/50 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-medium text-slate-100">{violation.title}</h3>
                    {violation.description && (
                      <p className="text-sm text-slate-400 mt-1">{violation.description}</p>
                    )}

                    <div className="flex gap-2 mt-2 flex-wrap">
                      <span className="inline-flex items-center px-2 py-1 rounded-lg bg-slate-800/50 text-xs text-slate-300">
                        Status: {violation.status}
                      </span>

                      {violation.type && (
                        <span className="inline-flex items-center px-2 py-1 rounded-lg bg-slate-800/50 text-xs text-slate-300">
                          Type: {violation.type}
                        </span>
                      )}

                      {(violation.images?.length > 0 || violation.videos?.length > 0) && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-900/30 text-xs text-cyan-300">
                          {violation.images?.length || 0} photos, {violation.videos?.length || 0} videos
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/violations/${violation._id}`)}
                    className="text-cyan-400 hover:text-cyan-300 transition text-sm font-medium"
                  >
                    View Details →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
