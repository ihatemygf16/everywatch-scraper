import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { WatchModal } from "./components/WatchModal";
import  StatBox  from "./components/StatBox";
import Select from 'react-select';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function StepLoader({ loading, messages, index }) {
  return (
    <div className="flex justify-center">
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="border bg-[#030712] text-[#F9FAFA] shadow-md rounded p-3 w-64"
          >
            <ul className="space-y-1">
              {messages.map((m, i) => {
                const done = i < index;
                const isCurrent = i === index;
                return (
                  <li
                    key={i}
                    className={`flex items-center text-sm ${
                      done
                        ? "text-green-600"
                        : isCurrent
                        ? "text-[#F9FAFA] font-semibold"
                        : "text-[#6B727D]"
                    }`}
                  >
                    <span className="w-5 inline-flex justify-center">
                      {done ? "✔️" : isCurrent ? "⏳" : "○"}
                    </span>
                    <span>{m.text}</span>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [lookbackDays, setLookbackDays] = useState("");
  const [boxPapersFilter, setBoxPapersFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState([]);
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [results, setResults] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, asc: true });
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [activeWatch, setActiveWatch] = useState(null);

  const stepMessages = [
    { text: "Sending request to server" },
    { text: "Launching browser" },
    { text: "Navigating to EveryWatch" },
    { text: "Extracting listing data" },
    { text: "Processing listings" },
    { text: "Saving results" },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    setResults([]);
    setStepIndex(0);
    setLoading(true);

    const url = new URL("http://localhost:3001/scrape-stream");
    url.searchParams.set("searchQuery", searchQuery);
    url.searchParams.set("lookbackDays", lookbackDays);

    const es = new EventSource(url.toString());

    es.addEventListener("step", (evt) => {
      const idx = parseInt(evt.data, 10);
      if (!Number.isNaN(idx)) setStepIndex(idx);
    });

    es.addEventListener("result", (evt) => {
      try {
        setResults(JSON.parse(evt.data));
      } catch (err) {
        console.error("Failed to parse results:", err);
      }
      setLoading(false);
      es.close();
    });

    es.addEventListener("error", (evt) => {
      console.error("⚠️ SSE error", evt);
      setLoading(false);
      es.close();
    });
  };

  const handleCaptchaSolved = () => {
    fetch("http://localhost:3001/captcha-done", { method: "POST" }).catch((err) =>
      console.error("CAPTCHA signal failed:", err)
    );
  };

  const parseSortableValue = (key, value) => {
    if (key === "Price") {
      const m = value.replace(/,/g, "").match(/\d+(\.\d+)?/);
      return m ? parseFloat(m[0]) : 0;
    }
    if (key === "LastSeenDate") return new Date(value).getTime() || 0;
    if (key === "ListedFor") {
      const m = value.match(/\d+/);
      return m ? parseInt(m[0]) : 0;
    }
    return value?.toString().toLowerCase() || "";
  };

  const handleSort = (key) => {
    const asc = sortConfig.key === key ? !sortConfig.asc : true;
    const sorted = [...results].sort((a, b) => {
      const aV = parseSortableValue(key, a[key] || "");
      const bV = parseSortableValue(key, b[key] || "");
      if (aV < bV) return asc ? -1 : 1;
      if (aV > bV) return asc ? 1 : -1;
      return 0;
    });
    setResults(sorted);
    setSortConfig({ key, asc });
  };

  const applyFilters = () =>
    results.filter((row) => {
      const hasBox = row.Box?.toLowerCase().includes("yes");
      const hasPapers = row.Papers?.toLowerCase().includes("yes");
      const country = row.Country?.trim().toLowerCase();
      const condition = row.Condition?.toLowerCase();

      let boxMatch = true;
      if (boxPapersFilter === "boxOnly") boxMatch = hasBox && !hasPapers;
      else if (boxPapersFilter === "papersOnly") boxMatch = !hasBox && hasPapers;
      else if (boxPapersFilter === "both") boxMatch = hasBox && hasPapers;
      else if (boxPapersFilter === "neither") boxMatch = !hasBox && !hasPapers;

      let countryMatch = true;
      if (countryFilter === "usOnly") countryMatch = country === "united states";
      else if (countryFilter === "excludeJapan") countryMatch = country !== "japan";

      let conditionMatch = true;
      if (conditionFilter.length > 0) {
        conditionMatch = conditionFilter.some((c) => {
          if (c === "Fair") return condition.includes("fair");
          if (c === "Good") return condition.includes("good");
          if (c === "Very Good") return condition.includes("very good");
          if (c === "Like New") return condition.includes("like new") || condition.includes("unworn");
          return false;
        });
      }

      let availabilityMatch = true;
      if (availabilityFilter === "available") {
        availabilityMatch = !row.LastSeenDate;
      } else if (availabilityFilter === "historical") {
        availabilityMatch = !!row.LastSeenDate;
      }

      return boxMatch && countryMatch && conditionMatch && availabilityMatch;
    });

  const filteredResults = applyFilters();
  const getPrice = (str) => {
    const m = str?.replace(/,/g, "").match(/\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };

  const prices = filteredResults
    .map(r => getPrice(r.Price))
    .filter(v => typeof v === "number");

  const listedDays = filteredResults
    .map(r => {
      const m = r.ListedFor?.match(/\d+/);
      return m ? parseInt(m[0]) : null;
    })
    .filter(v => typeof v === "number");

  const median = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  };

  const formatPrice = (num) =>
    typeof num === "number" ? `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—";

  const medianPrice = prices.length ? median(prices) : null;
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const medianDaysListed = listedDays.length ? median(listedDays) : "—";
  const now = new Date();
  const nowTime = now.getTime();

  const historicalPoints = filteredResults
    .filter(r => r.LastSeenDate)
    .map(r => {
      const priceMatch = r.Price?.replace(/,/g, "").match(/\d+(\.\d+)?/);
      const price = priceMatch ? parseFloat(priceMatch[0]) : null;
      const date = new Date(r.LastSeenDate).getTime();
      return price && date ? { x: date, y: price, url: r.URL, image: r.Image } : null;
    })
    .filter(Boolean);

  const availablePoints = filteredResults
    .filter(r => !r.LastSeenDate && r.ListedFor)
    .map(r => {
      const priceMatch = r.Price?.replace(/,/g, "").match(/\d+(\.\d+)?/);
      const price = priceMatch ? parseFloat(priceMatch[0]) : null;
      const days = parseInt(r.ListedFor.match(/\d+/)?.[0], 10);
      const date = nowTime - days * 24 * 60 * 60 * 1000;
      return price && days ? { x: date, y: price, url: r.URL, image: r.Image } : null;
    })
    .filter(Boolean);

  const listedDaysVsPricePoints = filteredResults
  .map((r) => {
    const priceMatch = r.Price?.replace(/,/g, "").match(/\d+(\.\d+)?/);
    const price = priceMatch ? parseFloat(priceMatch[0]) : null;
    const days = r.ListedFor?.match(/\d+/);
    const listedFor = days ? parseInt(days[0]) : null;
    return price && listedFor !== null
      ? { x: listedFor, y: price, url: r.URL, image: r.Image }
      : null;
  })
  .filter(Boolean);

  const availableDaysVsPricePoints = listedDaysVsPricePoints.filter(
    (p) => !historicalPoints.some((h) => h.url === p.url)
  );

  const xMaxDays = listedDaysVsPricePoints.length
    ? Math.max(...listedDaysVsPricePoints.map((p) => p.x)) + 1
    : 30;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length > 0) {
      const p = payload[0].payload;
      return (
        <div className="bg-white text-black p-2 border rounded shadow text-sm w-48">
          <div className="font-medium mb-1">
            {new Date(p.x).toLocaleDateString()} – ${p.y}
          </div>
          {p.image && (
            <img
              src={p.image}
              alt="Watch"
              className="w-full h-32 object-contain rounded bg-white"
            />
          )}
        </div>
      );
    }
  return null;
  };

  const handlePointClick = (data) => {
    if (data && data.url) {
      window.open(data.url, "_blank");
    }
  };

  const allDates = [...historicalPoints, ...availablePoints].map((d) => d.x);
  const xDomain = allDates.length
    ? [Math.min(...allDates) - 30 * 24 * 60 * 60 * 1000, nowTime]
    : [now - 30 * 24 * 60 * 60 * 1000, now];

  return (
    <div className="p-6 w-full bg-[#030712] text-[#F9FAFA] min-h-screen">
      <div className="max-w-7xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="searchQuery" className="block font-medium">
              Search Query:
            </label>
            <input
              id="searchQuery"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              required
              className="border w-full p-2 rounded bg-[#030712] text-[#F9FAFA]"
            />
          </div>
          <div>
            <label htmlFor="lookbackDays" className="block font-medium">
              Lookback Days:
            </label>
            <input
              id="lookbackDays"
              type="number"
              value={lookbackDays}
              onChange={(e) => setLookbackDays(e.target.value)}
              required
              className="border w-full p-2 rounded bg-[#030712] text-[#F9FAFA]"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="boxPapersFilter" className="block font-medium">
                Box/Papers:
              </label>
              <select
                id="boxPapersFilter"
                value={boxPapersFilter}
                onChange={(e) => setBoxPapersFilter(e.target.value)}
                className="border w-full p-2 rounded bg-[#202456] text-[#F9FAFA]"
              >
                <option value="all">All</option>
                <option value="boxOnly">Box Only</option>
                <option value="papersOnly">Papers Only</option>
                <option value="both">Both</option>
                <option value="neither">Neither</option>
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="countryFilter" className="block font-medium">
                Country:
              </label>
              <select
                id="countryFilter"
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="border w-full p-2 rounded bg-[#202456] text-[#F9FAFA]"
              >
                <option value="all">All</option>
                <option value="usOnly">US Only</option>
                <option value="excludeJapan">Exclude Japan</option>
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="conditionFilter" className="block font-medium">
                Condition:
              </label>
              <Select
                isMulti
                id="conditionFilter"
                options={[
                  { value: "Fair", label: "Fair" },
                  { value: "Good", label: "Good" },
                  { value: "Very Good", label: "Very Good" },
                  { value: "Like New", label: "Like New" },
                ]}
                value={conditionFilter.map((v) => ({ value: v, label: v }))}
                onChange={(selected) => setConditionFilter(selected.map((opt) => opt.value))}
                className="text-black"
                styles={{
                  control: (base) => ({
                    ...base,
                    backgroundColor: "#202456",
                    borderColor: "#ccc",
                    minHeight: "38px",
                  }),
                  multiValue: (base) => ({
                    ...base,
                    backgroundColor: "#081C20",
                    border: "1px solid #0C302D",
                    borderRadius: "4px"
                  }),
                  multiValueLabel: (base) => ({
                    ...base,
                    color: "#2DD391",
                  }),
                  multiValueRemove: (base) => ({
                    ...base,
                    color: "#2DD391",
                    ":hover": {
                      backgroundColor: "#0C302D",
                      color: "#ffffff"
                    }
                  }),
                  singleValue: (base) => ({
                    ...base,
                    color: "#F9FAFA",
                  }),
                  input: (base) => ({
                    ...base,
                    color: "#F9FAFA",
                  }),
                  menu: (base) => ({
                    ...base,
                    backgroundColor: "#202456",
                    color: "#F9FAFA",
                  }),
                  option: (base, { isFocused }) => ({
                    ...base,
                    backgroundColor: isFocused ? "#374151" : "#202456",
                    color: "#F9FAFA",
                  }),
                }}
              />
            </div>
            <div className="flex-1">
              <label htmlFor="availabilityFilter" className="block font-medium">
                Availability:
              </label>
              <select
                id="availabilityFilter"
                value={availabilityFilter}
                onChange={(e) => setAvailabilityFilter(e.target.value)}
                className="border w-full p-2 rounded bg-[#202456] text-[#F9FAFA]"
              >
                <option value="all">All</option>
                <option value="available">Available</option>
                <option value="historical">Historical</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <button
              type="submit"
              className="px-4 py-2 rounded transition-transform duration-150 hover:scale-105 active:scale-95"
              style={{ backgroundColor: "#1C1B12", color: "#EAB30B", border: "1px solid #342F12" }}
            >
              Scrape
            </button>

            <div className="flex gap-2 ml-4">
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(results, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "results.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-4 py-2 rounded transition-transform duration-150 hover:scale-105 active:scale-95"
                style={{ backgroundColor: "#1C1B12", color: "#EAB30B", border: "1px solid #342F12" }}
              >
                Export
              </button>

              <label
                htmlFor="importFile"
                className="px-4 py-2 rounded transition-transform duration-150 hover:scale-105 active:scale-95 cursor-pointer"
                style={{ backgroundColor: "#1C1B12", color: "#EAB30B", border: "1px solid #342F12" }}
              >
                Import
                <input
                  id="importFile"
                  type="file"
                  accept="application/json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file || file.name !== "results.json") {
                      alert("Please upload a valid results.json file.");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      try {
                        const parsed = JSON.parse(event.target.result);
                        if (Array.isArray(parsed)) setResults(parsed);
                        else throw new Error("File format is invalid.");
                      } catch (err) {
                        alert("Failed to import file: " + err.message);
                      }
                    };
                    reader.readAsText(file);
                  }}
                />
              </label>
            </div>
          </div>
        </form>

        <button
          onClick={handleCaptchaSolved}
          className="mt-4 px-4 py-2 rounded transition-transform duration-150 hover:scale-105 active:scale-95"
          style={{ backgroundColor: "#081C20", color: "#2DD391", border: "1px solid #0C302D" }}
        >
          CAPTCHA Solved
        </button>
        <div className="flex flex-nowrap justify-between gap-4 mt-6 overflow-x-auto">
        <StatBox label="Listings Loaded" value={filteredResults.length} />
        <StatBox label="Median Price" value={formatPrice(medianPrice)} />
        <StatBox label="Min Price" value={formatPrice(minPrice)} />
        <StatBox label="Max Price" value={formatPrice(maxPrice)} />
        <StatBox label="Median Days Listed" value={medianDaysListed} />
      </div>
        <div className="mt-6">
          <StepLoader loading={loading} messages={stepMessages} index={stepIndex} />
        </div>

        {(historicalPoints.length > 0 || availablePoints.length > 0 || listedDaysVsPricePoints.length > 0) && (
          <div className="space-y-12 mt-10">
            {(historicalPoints.length > 0 || availablePoints.length > 0) && (
              <>
                <h2 className="text-lg font-semibold mb-2 text-[#F9FAFA]">
                  Price vs. Date
                </h2>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 20 }}>
                      <CartesianGrid stroke="#6B727D" />
                      <XAxis
                        dataKey="x"
                        type="number"
                        tickFormatter={(t) => new Date(t).toLocaleDateString()}
                        domain={xDomain}
                        stroke="#F9FAFA"
                      />
                      <YAxis dataKey="y" stroke="#F9FAFA" />
                      <Tooltip content={<CustomTooltip />} />
                      <Scatter
                        name="Historical"
                        data={historicalPoints}
                        fill="#6366F1"
                        onClick={(data) => {
                          const match = filteredResults.find((r) => r.URL === data.url);
                          if (match) setActiveWatch(match);
                        }}
                      />
                      <Scatter
                        name="Available"
                        data={availablePoints}
                        fill="#EAB30B"
                        onClick={(data) => {
                          const match = filteredResults.find((r) => r.URL === data.url);
                          if (match) setActiveWatch(match);
                        }}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {listedDaysVsPricePoints.length > 0 && (
              <>
                <h2 className="text-lg font-semibold text-[#F9FAFA]">
                  Price vs. Listed Days
                </h2>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 20 }}>
                      <CartesianGrid stroke="#6B727D" />
                      <XAxis
                        dataKey="x"
                        type="number"
                        domain={[0, xMaxDays]}
                        tickFormatter={(t) => `${t}d`}
                        stroke="#F9FAFA"
                      />
                      <YAxis dataKey="y" stroke="#F9FAFA" />
                      <Tooltip content={<CustomTooltip />} />
                      <Scatter
                        name="Available"
                        data={availableDaysVsPricePoints}
                        fill="#EAB30B"
                        onClick={(data) => {
                          const match = filteredResults.find((r) => r.URL === data.url);
                          if (match) setActiveWatch(match);
                        }}
                      />
                      <Scatter
                        name="Other"
                        data={listedDaysVsPricePoints.filter(
                          (p) => !availableDaysVsPricePoints.includes(p)
                        )}
                        fill="#2DD391"
                        onClick={(data) => {
                          const match = filteredResults.find((r) => r.URL === data.url);
                          if (match) setActiveWatch(match);
                        }}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {filteredResults.length > 0 && (
          <div className="overflow-x-auto mt-8">
            <table className="w-full table-auto border border-[#6B727D]">
              <thead>
                <tr>
                  {["Brand", "Model", "Reference", "Price", "Seller", "Country", "LastSeenDate", "Box", "Papers", "ListedFor", "Condition"].map((key) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="border border-[#6B727D] px-2 py-1 cursor-pointer hover:bg-[#202456]"
                    >
                      {key}
                    </th>
                  ))}
                  <th className="border border-[#6B727D] px-2 py-1">Link</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((row, i) => (
                  <tr key={i} className="border-t border-[#6B727D]">
                    <td className="border border-[#6B727D] px-2 py-1">{row.Brand}</td>
                    <td className="border border-[#6B727D] px-2 py-1">{row.Model}</td>
                    <td className="border border-[#6B727D] px-2 py-1">{row.Reference}</td>
                    <td className="border border-[#6B727D] px-2 py-1">{row.Price}</td>
                    <td className="border border-[#6B727D] px-2 py-1">{row.Seller}</td>
                    <td className="border border-[#6B727D] px-2 py-1">{row.Country}</td>
                    <td className="border border-[#6B727D] px-2 py-1">{row.LastSeenDate}</td>
                    <td className="border border-[#6B727D] px-2 py-1">{row.Box}</td>
                    <td className="border border-[#6B727D] px-2 py-1">{row.Papers}</td>
                    <td className="border border-[#6B727D] px-2 py-1">{row.ListedFor}</td>
                    <td className="border border-[#6B727D] px-2 py-1">{row.Condition}</td>
                    <td className="border border-[#6B727D] px-2 py-1">
                      <a href={row.URL} target="_blank" rel="noreferrer" className="text-[#6366F1] underline">
                        Link
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <WatchModal watch={activeWatch} onClose={() => setActiveWatch(null)} />
    </div>
  );
}