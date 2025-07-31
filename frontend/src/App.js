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

/* Month helper → returns first & last day (YYYY-MM-DD) */
const monthBounds = (dateStr) => {
  const d = new Date(dateStr);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last  = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: formatDateLocal(first), end: formatDateLocal(last) };
};

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

  /* 1 state = the current month (Date set to the 1 st) */
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  

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
  const [personStats, setPersonStats] = useState({});
  const [people, setPeople] = useState(["Cillian", "Hosana", "Yuka","Yuuka","Hiroko","Hao","Manal","Satya"]);
  const [nameInput, setNameInput] = useState("");
  

  /* recompute + send settings whenever range changes */
  useEffect(() => {
    const buildAndSend = async () => {
      const { start: monthStart, end: monthEnd } = monthBounds(currentMonth);
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
        start_date: monthStart, // < - I want these values to be only the values within a single month
        end_date:   monthEnd, // < - I want these values to be only the values within a single month
        weekends,
        holidays: holidays.map((h) => h.date),
        cage_days: cageDays,
        workers: people,
      };
    console.log("Payload Start Date: ",payload["start_date"]) 
    console.log("Payload Stop Date: ",payload["end_date"])
    console.log("Payload Workers: ",payload["workers"])
      try {
        await axios.post("http://localhost:5000/calendar-settings", payload);
        setSent(true);
      } catch (e) {
        console.error("calendar-settings POST failed", e);
        setSent(false);
      }
    };
    buildAndSend();
  }, [range,people]);

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
    setCurrentMonth(new Date(arg.start.getFullYear(), arg.start.getMonth(), 1));
    const start = formatDateLocal(arg.start);
    const end   = formatDateLocal(arg.end);
    setRange({ start, end });
    setSent(false);           // disable button until POST succeeds again
  };




  const addPerson = () => {
    const trimmed = nameInput.trim();
    if (trimmed && !people.includes(trimmed)) setPeople([...people, trimmed]);
    setNameInput("");
  };

  const removePerson = (name) => {
    setPeople(people.filter((p) => p !== name));
  };

  return (
  <div className="App">

    <button
      className="GenerateSchedule"
      onClick={generateSchedule}
      disabled={loading || !settingsSent}
    >
      {loading ? "Loading…" : "Generate Schedule"}
    </button>

    {/* ─── calendar + table side‑by‑side ─── */}
    <div className="calendar-row">

      {/* calendar panel (left) */}
      <div className="calendar-wrapper">
        <FullCalendar
          height="100%"                 /* fills 70 vh wrapper */
          plugins={[dayGridPlugin, interactionPlugin]}
          events={[...events, ...highlightEvents]}
          datesSet={handleDatesSet}
          editable
        />
      </div>

      {/* people summary panel (right) */}
      <div className="people-section">
        <h3 className="text-lg font-semibold mb-2">People</h3>

        <table className="border-collapse w-full">
          <caption className="sr-only">Personnel assignment counts</caption>
          <thead>
            <tr>
              <th className="border px-4 py-1 bg-gray-100">#</th>
              <th className="border px-4 py-1 bg-gray-100">Name</th>
              <th className="border px-4 py-1 bg-gray-100">Week‑days</th>
              <th className="border px-4 py-1 bg-gray-100">Fridays</th>
              <th className="border px-4 py-1 bg-gray-100">Weekend / Hol.</th>
              <th className="border px-4 py-1 bg-gray-100"></th>
            </tr>
          </thead>

          <tbody>
            {people.map((p, idx) => {
              const s = personStats[p] || { weekday: 0, friday: 0, weekendHoliday: 0 };
              return (
                <tr key={p}>
                  <td className="border px-4 py-1">{idx + 1}</td>
                  <td className="border px-4 py-1 text-left">{p}</td>
                  <td className="border px-4 py-1 text-center">{s.weekday}</td>
                  <td className="border px-4 py-1 text-center">{s.friday}</td>
                  <td className="border px-4 py-1 text-center">{s.weekendHoliday}</td>
                  <td className="border px-4 py-1 text-center">
                    <button onClick={() => removePerson(p)} title="Remove">✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* add‑name input */}
        <div className="input-row">
          <input
            //className="border px-2 py-1"
            placeholder="New name…"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPerson()}
          />
          <button className="btn" onClick={addPerson}>Add</button>
        </div>
      </div>

    </div> {/* end .calendar-row */}
  </div>
);

}