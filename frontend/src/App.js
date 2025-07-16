import React, { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import axios from "axios";
import "./App.css";

const holidays = ["2025-07-17"];

function isSecondFriday(date) {
  if (date.getDay() !== 5) return false;
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  let count = 0;
  for (let d = new Date(first); d <= date; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 5) count++;
    if (d.toDateString() === date.toDateString()) break;
  }
  return count === 2;
}

function App() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const generateSchedule = async () => {
    setLoading(true);
    try {
      const res = await axios.get("http://localhost:5000/generate-schedule");
      setEvents(res.data);
    } catch (err) {
      console.error("Failed to generate schedule", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <h2>Optimized Schedule for July 2025</h2>
      <button onClick={generateSchedule} disabled={loading}>
        {loading ? "Generating..." : "Generate Schedule"}
      </button>

      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView="dayGridMonth"
        events={events}
        dayCellDidMount={(arg) => {
          const dateStr = arg.date.toISOString().split("T")[0];
          const el = arg.el;

          if (arg.date.getDay() === 0 || arg.date.getDay() === 6) {
            el.style.backgroundColor = "#D0E6FF"; // Blue for weekends
          }
          if (holidays.includes(dateStr)) {
            el.style.backgroundColor = "#C8FACC"; // Green for holidays
          }
          if (isSecondFriday(arg.date)) {
            el.style.backgroundColor = "#FFD6D6"; // Red for 2nd Fridays
          }
        }}
      />
    </div>
  );
}

export default App;
