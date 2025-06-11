const form = document.getElementById('scrapeForm');
const tableBody = document.querySelector('#resultsTable tbody');
const boxPapersFilter = document.getElementById('boxPapersFilter');
const countryFilter = document.getElementById('countryFilter');
const headers = document.querySelectorAll('th.sortable');

let scrapedResults = [];
let currentSort = { key: null, asc: true };

form.onsubmit = async (e) => {
  e.preventDefault();
  tableBody.innerHTML = '';
  scrapedResults = [];

  const searchQuery = document.getElementById('searchQuery').value;
  const lookbackDays = document.getElementById('lookbackDays').value;

  const response = await fetch('/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ searchQuery, lookbackDays })
  });

  const data = await response.json();
  scrapedResults = data.results || [];
  applyFiltersAndDisplay();
};

document.getElementById('captchaButton').onclick = async () => {
  await fetch('/captcha-done', { method: 'POST' });
};

function applyFiltersAndDisplay() {
  const filterBox = boxPapersFilter.value;
  const filterCountry = countryFilter.value;
  const filtered = scrapedResults.filter(row => {
    const hasBox = row.Box.toLowerCase().includes('yes');
    const hasPapers = row.Papers.toLowerCase().includes('yes');
    const country = row.Country.trim().toLowerCase();

    let boxMatch = true;
    if (filterBox === 'boxOnly') boxMatch = hasBox && !hasPapers;
    else if (filterBox === 'papersOnly') boxMatch = !hasBox && hasPapers;
    else if (filterBox === 'both') boxMatch = hasBox && hasPapers;
    else if (filterBox === 'neither') boxMatch = !hasBox && !hasPapers;

    let countryMatch = true;
    if (filterCountry === 'usOnly') countryMatch = country === 'united states';
    else if (filterCountry === 'excludeJapan') countryMatch = country !== 'japan';

    return boxMatch && countryMatch;
  });

  displayResults(filtered);
}

function parseSortableValue(key, value) {
  if (key === 'Price') {
    const match = value.replace(/,/g, '').match(/[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
  }
  if (key === 'LastSeenDate') {
    return new Date(value).getTime() || 0;
  }
  if (key === 'ListedFor') {
    const match = value.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }
  return value.toLowerCase();
}

function displayResults(results) {
  tableBody.innerHTML = '';
  for (const row of results) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.Brand}</td><td>${row.Model}</td><td>${row.Reference}</td><td>${row.Price}</td>
      <td>${row.Seller}</td><td>${row.Country}</td><td>${row.LastSeenDate}</td>
      <td>${row.Box}</td><td>${row.Papers}</td><td>${row.ListedFor}</td>
      <td><a href="${row.URL}" target="_blank">Link</a></td>`;
    tableBody.appendChild(tr);
  }
}

headers.forEach(th => {
  th.addEventListener('click', () => {
    const key = th.getAttribute('data-key');
    if (!key) return;

    if (currentSort.key === key) {
      currentSort.asc = !currentSort.asc;
    } else {
      currentSort.key = key;
      currentSort.asc = true;
    }

    scrapedResults.sort((a, b) => {
      const valA = parseSortableValue(key, a[key] || '');
      const valB = parseSortableValue(key, b[key] || '');
      if (valA < valB) return currentSort.asc ? -1 : 1;
      if (valA > valB) return currentSort.asc ? 1 : -1;
      return 0;
    });

    applyFiltersAndDisplay();
  });
});

boxPapersFilter.onchange = applyFiltersAndDisplay;
countryFilter.onchange = applyFiltersAndDisplay;
