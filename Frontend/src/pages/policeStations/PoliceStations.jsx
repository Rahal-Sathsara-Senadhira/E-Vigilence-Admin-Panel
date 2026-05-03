import React from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { MapPin, AlertCircle, Loader } from "lucide-react";

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
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-slate-300">
          <Loader className="h-5 w-5 animate-spin" />
          <span>Loading police stations...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Police Stations</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage and view evidence by police station
        </p>
      </div>

      {/* Search */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <input
          type="text"
          placeholder="Search by station name or area..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none transition"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-900/30 bg-red-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">Error</p>
            <p className="text-sm text-red-400/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Stations Grid */}
      {!error && filteredStations.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
          <MapPin className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No police stations found</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredStations.map((station) => (
            <button
              key={station._id || station.id}
              onClick={() => navigate(`/police-stations/${station._id || station.id}`)}
              className="text-left rounded-2xl border border-slate-800 bg-slate-900/40 p-4 hover:border-cyan-600 hover:bg-slate-900/60 transition group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-sm text-slate-400">Station</p>
                  <h3 className="text-lg font-semibold text-slate-100 mt-1 group-hover:text-cyan-300 transition">
                    {station.name || "Unknown Station"}
                  </h3>
                  {station.area && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-slate-400">
                      <MapPin className="h-4 w-4" />
                      <span>{station.area}</span>
                    </div>
                  )}
                </div>
                <div className="text-cyan-400 group-hover:translate-x-0.5 transition">
                  →
                </div>
              </div>
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
