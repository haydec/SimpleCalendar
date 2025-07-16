import React, { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";
import "./App.css";

function isCageChangingF(date, n) {
  if (date.getDay() !== 5) return false;

  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  let fridayCount = 0;

  for (let d = new Date(firstDay); d <= date; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 5) fridayCount++;
    if (d.toDateString() === date.toDateString()) break;
  }

  return fridayCount === n;
}

function formatDateLocal(date) {
  return date.getFullYear() + "-" +
         String(date.getMonth() + 1).padStart(2, '0') + "-" +
         String(date.getDate()).padStart(2, '0');
}

function App() {
  const [events, setEvents] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(false);

  const today = new Date();
  const startDateStr = formatDateLocal(new Date(today.getFullYear(), today.getMonth(), 1));
  const endDateRaw = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const endDateInclusive = new Date(endDateRaw);
  endDateInclusive.setDate(endDateRaw.getDate() + 1); // add 1 day
  const endDateStr = formatDateLocal(endDateInclusive);



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

  const fetchHolidays = async () => {
    try {
      const res = await axios.get("https://date.nager.at/api/v3/PublicHolidays/2025/JP");
      const formatted = res.data.map(h => ({
        date: h.date,         // e.g. "2025-07-15"
        name: h.localName     // e.g. "海の日"
      }));
      setHolidays(formatted);
    } catch (err) {
      console.error("Failed to fetch Japanese holidays", err);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, []);

  const handleEventDrop = async (info) => {
    const { event } = info;
    const updatedEvent = {
      title: event.title,
      date: event.startStr,
    };

    try {
      await axios.post("http://localhost:5000/update-assignment", updatedEvent);
    } catch (err) {
      console.error("Failed to update assignment", err);
      info.revert();
    }
  };

  return (
    <div className="App">
      <h2>Optimized Schedule for July 2025</h2>
      <button onClick={generateSchedule} disabled={loading}>
        {loading ? "Generating..." : "Generate Schedule"}
      </button>

      {holidays.length > 0 && (
        <div className="calendar-wrapper">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          initialDate={startDateStr}
          validRange={{ start: startDateStr, end: endDateStr }}
          events={events}
          editable={true}
          eventDrop={handleEventDrop}
          fixedWeekCount={false} 
          dayCellDidMount={(arg) => {
            const dateStr = new Date(Date.UTC(
              arg.date.getFullYear(),
              arg.date.getMonth(),
              arg.date.getDate()
            )).toISOString().substring(0, 10);
            const isWeekend = arg.date.getDay() === 0 || arg.date.getDay() === 6;
            const isCageChanging = isCageChangingF(arg.date, 2) || isCageChangingF(arg.date, 4);
            const holiday = holidays.find(h => h.date === dateStr);
            const el = arg.el;

            if (isCageChanging) {
              console.log("Second Friday", dateStr);
              el.style.backgroundColor = "#FFD6D6"; // Red
              el.title = "Second Friday";
            } else if (holiday) {
              console.log("Holiday", dateStr);
              el.style.backgroundColor = "#C8FACC"; // Green
              el.title = holiday.name;
            } else if (isWeekend) {
              console.log("Weekend", dateStr);
              el.style.backgroundColor = "#D0E6FF"; // Blue
              el.title = "Weekend";
            }
          }}
        />
        </div>
      )}
    </div>
  );
}

export default App;
