import React from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { MapPin } from "lucide-react";
import { Card, LoadingState, ErrorState, EmptyState } from "../../components/ui";

export default function PoliceStations() {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [stations, setStations] = React.useState([]);
  const [searchTerm, setSearchTerm] = React.useState("");

  React.useEffect(() => {
    loadStations();
  }, []);

  async function loadStations() {
    try {
      setError("");
      setLoading(true);

      const res = await api.get("/api/police-stations");
      const data = res?.data || res || [];

      setStations(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error loading stations:", e);
      setError(e.message || "Failed to load police stations");
    } finally {
      setLoading(false);
    }
  }

  const filteredStations = stations.filter(station =>
    station.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    station.area?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <LoadingState label="Loading police stations..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Police Stations</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Manage and view evidence by police station
        </p>
      </div>

      {/* Search */}
      <Card>
        <input
          type="text"
          placeholder="Search by station name or area..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:border-brand-blue focus:outline-none transition"
        />
      </Card>

      {/* Error */}
      {error && <ErrorState message={error} />}

      {/* Stations Grid */}
      {!error && filteredStations.length === 0 ? (
        <Card>
          <EmptyState icon={MapPin} title="No police stations found" />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredStations.map((station) => (
            <button
              key={station._id || station.id}
              onClick={() => navigate(`/police-stations/${station._id || station.id}`)}
              className="text-left"
            >
              <Card interactive className="h-full">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Station</p>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-1 group-hover:text-brand-blue transition">
                      {station.name || "Unknown Station"}
                    </h3>
                    {station.area && (
                      <div className="flex items-center gap-2 mt-2 text-sm text-slate-600 dark:text-slate-400">
                        <MapPin className="h-4 w-4" />
                        <span>{station.area}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-brand-blue group-hover:translate-x-0.5 transition">
                    →
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* Count */}
      {!error && (
        <div className="text-center text-sm text-slate-500 py-4">
          Showing {filteredStations.length} of {stations.length} stations
        </div>
      )}
    </div>
  );
}
