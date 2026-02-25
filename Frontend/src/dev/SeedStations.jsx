import axios from "axios";
import policeStations from "../services/policeStations"; // your hardcoded array

export default function SeedStations() {
  const seed = async () => {
    try {
      const res = await axios.post(
        "http://localhost:8081/api/stations/bulk",
        policeStations
      );
      alert("Seed done: " + JSON.stringify(res.data, null, 2));
      console.log(res.data);
    } catch (e) {
      console.error(e);
      alert("Seed failed. Check console.");
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Seed Police Stations</h2>
      <button onClick={seed}>Seed Now</button>
      <p>After successful seed, delete this page + remove hardcoded stations file.</p>
    </div>
  );
}