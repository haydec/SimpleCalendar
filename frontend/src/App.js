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

function getWeekends(startStr, endStr) {
  const weekends = [];
  const start = new Date(startStr);
  const end = new Date(endStr);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) {
      weekends.push(formatDateLocal(d));
    }
  }
  return weekends;
}

async function getHolidays(startStr, endStr) {
  const holidays = [];
  const start = new Date(startStr);
  const end = new Date(endStr);
  const year = start.getFullYear();

  try {
    const res = await axios.get(`https://date.nager.at/api/v3/PublicHolidays/${year}/JP`);
    const allHolidays = res.data;
    for (const h of allHolidays) {
      const holidayDate = new Date(h.date);
      if (holidayDate >= start && holidayDate <= end) {
        holidays.push({ date: h.date, name: h.localName });
      }
    }
  } catch (err) {
    console.error("Failed to fetch holidays", err);
  }

  return holidays;
}

function formatDateLocal(date) {
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

function App() {
  const [events, setEvents] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(false);

  const today = new Date();
  const startDateStr = formatDateLocal(new Date(today.getFullYear(), today.getMonth(), 1));
  const endDateRaw = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const endDateInclusive = new Date(endDateRaw);
  endDateInclusive.setDate(endDateRaw.getDate() + 1);
  const endDateStr = formatDateLocal(endDateInclusive);

  const [settingsSent, setSettingsSent] = useState(false);

  const generateSchedule = async () => {
    if (!settingsSent) {
      console.warn("Schedule generation blocked: settings not sent yet.");
      return;
    }
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

  useEffect(() => {
    getHolidays(startDateStr, endDateStr).then(setHolidays);
  }, []);

  useEffect(() => {
    if (holidays.length === 0) return;
    const payload = {
      start_date: startDateStr,
      end_date: endDateStr,
      weekends: getWeekends(startDateStr, endDateStr),
      holidays: holidays.map((h) => h.date),
      nth_fridays: [2, 4],
    };
    axios
      .post("http://localhost:5000/calendar-settings", payload)
      .then((res) => {
        console.log("Calendar settings sent.", res.data);
        setSettingsSent(true);
      })
      .catch((err) => {
        console.error("Calendar settings error", err);
        setSettingsSent(false);
      });
  }, [holidays]);
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
              const dateStr = new Date(Date.UTC(arg.date.getFullYear(), arg.date.getMonth(), arg.date.getDate()))
                .toISOString()
                .substring(0, 10);
              const isWeekend = arg.date.getDay() === 0 || arg.date.getDay() === 6;
              const isCageChanging = isCageChangingF(arg.date, 2) || isCageChangingF(arg.date, 4);
              const holiday = holidays.find((h) => h.date === dateStr);
              const el = arg.el;

              if (isCageChanging) {
                el.style.backgroundColor = "#FFD6D6";
                el.title = "Cage Change Friday";
              } else if (holiday) {
                el.style.backgroundColor = "#C8FACC";
                el.title = holiday.name;
              } else if (isWeekend) {
                el.style.backgroundColor = "#D0E6FF";
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
