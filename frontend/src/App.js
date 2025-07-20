import React, { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";
import "./App.css";

/*************************************
  Helper utilities
*************************************/
const formatDateLocal = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const getWeekends = (startStr, endStr) => {
  const res = [];
  const start = new Date(startStr);
  const end = new Date(endStr);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) res.push(formatDateLocal(d));
  }
  return res;
};

const getCageChangingDays = (startStr, endStr, nths = [2, 4]) => {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const fridays = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 5) fridays.push(new Date(d));
  }
  return nths
    .map((n) => fridays[n - 1])
    .filter(Boolean)
    .map(formatDateLocal);
};

const fetchHolidays = async (startStr, endStr) => {
  const holidays = [];
  const year = new Date(startStr).getFullYear();
  try {
    const { data } = await axios.get(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/JP`
    );
    data.forEach((h) => {
      if (h.date >= startStr && h.date <= endStr)
        holidays.push({ date: h.date, name: h.localName });
    });
  } catch (e) {
    console.error("Holiday fetch error", e);
  }
  return holidays;
};

/*************************************
  React component
*************************************/
export default function App() {
  /* visible range */
  const [range, setRange] = useState(() => {
    const today = new Date();
    console.log("Start Date: ",formatDateLocal(new Date(today.getFullYear(), today.getMonth(), 1)))
    console.log("Stop Date: ",formatDateLocal(new Date(today.getFullYear(), today.getMonth() + 1, 0)))
    return {
      start: formatDateLocal(new Date(today.getFullYear(), today.getMonth(), 1)),
      end:   formatDateLocal(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  });

  /* highlight bg events */
  const [highlightEvents, setHighlightEvents] = useState([]);

  /* schedule events */
  const [events, setEvents]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [settingsSent, setSent]   = useState(false);

  /* recompute + send settings whenever range changes */
  useEffect(() => {
    const buildAndSend = async () => {
      const weekends = getWeekends(range.start, range.end);
      const cageDays = getCageChangingDays(range.start, range.end);
      const holidays = await fetchHolidays(range.start, range.end);

      /* build bg events */
      const bg = [
        ...weekends.map((d) => ({ start: d, display: "background", backgroundColor: "#D0E6FF" })),
        ...cageDays.map((d) => ({ start: d, display: "background", backgroundColor: "#FFD6D6" })),
        ...holidays.map((h) => ({ start: h.date, title: h.name, display: "background", backgroundColor: "#C8FACC" })),
      ];
      setHighlightEvents(bg);

      /* send settings to back‑end */
      const payload = {
        start_date: range.start,
        end_date:   range.end,
        weekends,
        holidays: holidays.map((h) => h.date),
        cage_days: cageDays,
      };
    console.log("Range Start Date: ",range.start)
    console.log("Range Stop Date: ",range.end)
      try {
        await axios.post("http://localhost:5000/calendar-settings", payload);
        setSent(true);
      } catch (e) {
        console.error("calendar-settings POST failed", e);
        setSent(false);
      }
    };
    buildAndSend();
  }, [range]);

  /* schedule generation */
  const generateSchedule = async () => {
    if (!settingsSent) return; // guard – shouldn’t happen due to disabled btn
    setLoading(true);
    try {
      const { data } = await axios.get("http://localhost:5000/generate-schedule");
      setEvents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  /* range change from calendar */
  const handleDatesSet = (arg) => {
    const start = formatDateLocal(arg.start);
    const end   = formatDateLocal(arg.end);
    setRange({ start, end });
    setSent(false);           // disable button until POST succeeds again
  };

  return (
    <div className="App p-4 space-y-4">
      <button className="btn" onClick={generateSchedule} disabled={loading || !settingsSent}>
        {loading ? "Loading…" : "Generate Schedule"}
      </button>

      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        events={[...events, ...highlightEvents]}
        datesSet={handleDatesSet}
        editable
      />
    </div>
  );
}