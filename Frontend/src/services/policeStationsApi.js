import axios from "axios";

const API = "http://localhost:8081/api/police-stations";

export async function findNearestPoliceStations({ lat, lng, limit = 3 }) {
  const res = await axios.get(`${API}/nearest`, { params: { lat, lng, limit } });
  return res.data;
}