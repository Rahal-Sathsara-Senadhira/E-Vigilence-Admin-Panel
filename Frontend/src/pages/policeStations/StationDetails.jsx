import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../services/api";
import { MapPin, ArrowLeft, Image, Video } from "lucide-react";
import EvidenceViewer from "../../components/EvidenceViewer";
import { Card, Badge, LoadingState, ErrorState, EmptyState } from "../../components/ui";

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
    return <LoadingState label="Loading station details..." />;
  }

  if (error || !station) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate("/police-stations")}
          className="flex items-center gap-2 text-brand-blue dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Stations
        </button>

        <ErrorState message={error || "Station not found"} />
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
          className="flex items-center gap-2 text-brand-blue dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200 transition mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Stations
        </button>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{station.name}</h1>
        {station.area && (
          <div className="flex items-center gap-2 mt-2 text-slate-600 dark:text-slate-400 font-semibold">
            <MapPin className="h-4 w-4" />
            <span>{station.area}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Assigned Violations</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{violations.length}</p>
        </Card>

        <Card>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Total Evidence Files</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{totalEvidence}</p>
        </Card>

        <Card>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Evidence Types</p>
          <div className="flex gap-2 mt-2">
            {imageCount > 0 && (
              <Badge tone="neutral" className="gap-1">
                <Image className="h-3 w-3" />
                {imageCount}
              </Badge>
            )}
            {videoCount > 0 && (
              <Badge tone="neutral" className="gap-1">
                <Video className="h-3 w-3" />
                {videoCount}
              </Badge>
            )}
            {totalEvidence === 0 && (
              <span className="text-xs text-slate-500">No evidence</span>
            )}
          </div>
        </Card>
      </div>

      {/* Evidence Gallery */}
      <Card bodyClassName="">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Evidence Gallery</h2>

        {totalEvidence === 0 ? (
          <EmptyState icon={Image} title="No evidence files available for this station" />
        ) : (
          <EvidenceViewer
            images={allEvidence.images}
            videos={allEvidence.videos}
            audios={allEvidence.audios}
          />
        )}
      </Card>

      {/* Violations List */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Assigned Violations</h2>

        {violations.length === 0 ? (
          <Card>
            <EmptyState title="No violations assigned to this station" />
          </Card>
        ) : (
          <div className="grid gap-3">
            {violations.map((violation) => (
              <Card key={violation._id} interactive>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{violation.title}</h3>
                    {violation.description && (
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-1">{violation.description}</p>
                    )}

                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Badge tone="neutral">Status: {violation.status}</Badge>

                      {violation.type && (
                        <Badge tone="neutral">Type: {violation.type}</Badge>
                      )}

                      {(violation.images?.length > 0 || violation.videos?.length > 0) && (
                        <Badge tone="blue" className="gap-1">
                          {violation.images?.length || 0} photos, {violation.videos?.length || 0} videos
                        </Badge>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/violations/${violation._id}`)}
                    className="text-brand-blue dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200 transition text-sm font-medium"
                  >
                    View Details →
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
