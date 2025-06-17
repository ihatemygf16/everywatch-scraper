const fs = require('fs');
const { chromium } = require('playwright');

function parseLastSeenDate(text) {
  const match = text.match(/[A-Za-z]{3,9} \d{1,2}, \d{4}/);
  return match ? new Date(match[0]) : null;
}

async function waitForCaptchaSignal(isCaptchaSolvedFn) {
  console.log('[WAIT] Waiting for captcha solved signal...');
  while (!isCaptchaSolvedFn()) {
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('[WAIT] Captcha solve confirmed. Continuing...');
}

async function checkAndWaitForCaptcha(page, isCaptchaSolvedFn) {
  const hasRecaptcha = await page.$('iframe[title="reCAPTCHA"]');
  const hasCollectorsMessage = await page.evaluate(() => {
    return !!Array.from(document.querySelectorAll('body *'))
      .some(el => el.textContent?.toLowerCase().includes("only collectors beyond this point"));
  });

  if (hasRecaptcha || hasCollectorsMessage) {
    console.log('[CAPTCHA] Detected – waiting for user to solve...');
    await waitForCaptchaSignal(isCaptchaSolvedFn);
    await page.waitForSelector('.price, .ew-tab-option', { timeout: 15000 });
  }
}

async function scrapeEverywatch(
  searchQuery,
  lookbackDays,
  isCaptchaSolvedFn,
  sendStepFn = () => {}
) {
  sendStepFn(0);

  sendStepFn(1);
  const path = require('path');
  const browser = await chromium.launch({
    headless: false,
    executablePath: path
      .resolve(__dirname, 'playwright-browsers', 'chromium-1169', 'chrome-win', 'chrome.exe')
      .replace(/\\/g, '/'),
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const results = [];
  const seenUrls = new Set();
  const now = new Date();

  await page.addInitScript(() => {
    const kill = () => {
      const popup = document.querySelector('div.general-popup-outer.ew-paywall-outer');
      if (popup) popup.remove();

      const popular = document.querySelector('div.ew-popular-section');
      if (popular) popular.remove();

      const body = document.body;
      if (body) {
        body.style.overflow = 'auto';
        body.classList.remove('overflow-hidden');
        body.classList.add('overflow-auto');
      }
    };

    kill();
    setInterval(kill, 300);
  });

  sendStepFn(2);
  await page.goto('https://everywatch.com/');
  await page.waitForSelector('input[placeholder*="Search over"]');

  async function checkCaptchaAtStart() {
    const captcha = await page.$('iframe[title="reCAPTCHA"]');
    if (captcha) {
      console.log('[CAPTCHA] Detected - waiting for manual solve');
      await waitForCaptchaSignal(isCaptchaSolvedFn);
      await page.waitForTimeout(3000); // static wait like before
    }
  }

  await checkCaptchaAtStart();

  await page.fill('input[placeholder*="Search over"]', searchQuery);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(5000);

  async function getTabCounts() {
    return await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.ew-tab-option'));
      const counts = {};
      for (const item of items) {
        const label = item.querySelector('.ew-tab-option-label')?.textContent?.trim();
        const count = item.querySelector('.ew-tab-option-count')?.textContent?.match(/\d+/);
        if (label && count) counts[label.toLowerCase()] = parseInt(count[0], 10);
      }
      return counts;
    });
  }

  async function detectActiveTab() {
    return await page.evaluate(() => {
      const active = document.querySelector(
        '.ew-select-dropdown__single-value .ew-tab-option-label'
      );
      return active?.textContent?.trim()?.toLowerCase() || '';
    });
  }

  async function performSearch(type, initial = false, skipClick = false) {
    if (type === 'Historical' && !skipClick) {
      await page.click('.ew-select-dropdown__control');
      await page.waitForSelector('.ew-tab-option-label:text("Historical")', { timeout: 5000 });
      
      const tab = await page.locator('.ew-tab-option-label', { hasText: 'Historical' });
      await tab.click();
      await page.waitForTimeout(300); // give dropdown time to close
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000); // let it reload naturally
    }

    const suffix =
      type === 'Historical' ? '&unsold=false&pageSize=999' : '&pageSize=999';

    await page.evaluate((suf) => {
      const url = new URL(window.location.href);
      if (!url.href.includes('pageSize')) {
        const newUrl = url.href.includes('?')
          ? url.href + suf
          : url.href + '?' + suf.replace(/^&/, '');
        history.replaceState({}, '', newUrl);
      }
    }, suffix);

    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.waitForSelector('a.ew-grid-item.ew-grid-watch-card', { timeout: 10000 });

    return await page.evaluate(({ lookbackDays, nowISO, isHist }) => {
      const n = new Date(nowISO);
      const cards = Array.from(document.querySelectorAll('a.ew-grid-item.ew-grid-watch-card'));

      return cards.flatMap((c) => {
        const href = c.getAttribute('href');
        const lastSeenEl = c.querySelector('.last-seen');
        const listedEl = c.querySelector('.days-on-market b');
        const sourceEl = c.querySelector('.location-date-details .location');

        if (!sourceEl || !sourceEl.getAttribute('title')?.toLowerCase().includes('chrono24')) {
          return [];
        }

        let days = null;

        if (isHist && lastSeenEl) {
          const m = lastSeenEl.innerText.match(/[A-Za-z]{3,9} \d{1,2}, \d{4}/);
          if (m) days = (n - new Date(m[0])) / (1000 * 60 * 60 * 24);
        } else if (!isHist && listedEl) {
          const m = listedEl.innerText.match(/\d+/);
          if (m) days = parseInt(m[0], 10);
        }

        return days !== null && days <= lookbackDays ? [href] : [];
      });
    }, {
      lookbackDays,
      nowISO: now.toISOString(),
      isHist: type === 'Historical',
    });
  }

  sendStepFn(3);
  const tabCounts = await getTabCounts();
  const active = await detectActiveTab();

  let availLinks = [];
  let histLinks = [];

  if (tabCounts.available > 0) {
    if (active !== 'available') await performSearch('Available');
    availLinks = await performSearch('Available', false, true);
  }
  if (tabCounts.historical > 0) {
    if (active !== 'historical') await performSearch('Historical');
    histLinks = await performSearch('Historical', false, true);
  }

  const allLinks = [...availLinks, ...histLinks];

  sendStepFn(4);

  async function extractDetailField(label) {
    return await page.evaluate((lbl) => {
      const items = Array.from(document.querySelectorAll('.awd-desc-items'));
      for (const it of items) {
        const t = it.querySelector('.awd-title');
        const v = it.querySelector('.awd-detail');
        if (t && v && t.textContent.trim().replace(':', '') === lbl) {
          return v.textContent.trim();
        }
      }
      return '';
    }, label);
  }

  async function extractListedDaysAgo() {
    return await page.evaluate(() => {
      const div = Array.from(document.querySelectorAll('.awd-desc-items')).find((d) =>
        d.querySelector('.awd-title')?.textContent.includes('Listed')
      );
      if (!div) return '';
      const txt = div.querySelector('.awd-detail')?.textContent || '';
      const m = txt.match(/\d+\s*Days/i);
      return m ? m[0].replace(/\s+/, ' ') : '';
    });
  }

  async function extractPriceField(label) {
    return await page.evaluate((lbl) => {
      const items = Array.from(document.querySelectorAll('.price-analysis-item'));
      for (const it of items) {
        const t = it.querySelector('.title-wrapper');
        const v = it.querySelector('.price');
        if (t && v && t.textContent.trim() === lbl) {
          return v.textContent.trim();
        }
      }
      return '';
    }, label);
  }

  async function extractAvailablePrice() {
    return await page.evaluate(() => {
      const el = document.querySelector('.price-analysis-item .price');
      return el ? el.textContent.trim() : '';
    });
  }

  async function extractReference() {
    return await page.evaluate(() => {
      const h1 = document.querySelector('h1.flex-wrap');
      if (!h1) return '';
      const a = h1.querySelectorAll('a');
      return a.length ? a[a.length - 1].textContent.trim() : '';
    });
  }

  async function extractFirstImageURL() {
    return await page.evaluate(() => {
      const img = document.querySelector('.swiper-slide img');
      if (!img) return '';

      const srcset = img.getAttribute('srcset');
      if (!srcset) return img.src || '';

      const entries = srcset
        .split(',')
        .map((s) => s.trim().split(' ')[0])
        .filter(Boolean);

      return entries[0] || img.src || '';
    });
  }

  async function scrapeListings(links, type) {
    for (const url of links) {
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      try {
        await page.goto(`https://everywatch.com${url}`, {
          waitUntil: 'domcontentloaded',
        });

        await checkAndWaitForCaptcha(page, isCaptchaSolvedFn);

        await page.waitForSelector('.price, .awd-desc-items', { timeout: 10000 });

        const isChrono24 = await page.evaluate(() => {
          const label = Array.from(document.querySelectorAll('.awd-desc-items')).find((el) =>
            el.querySelector('.awd-title')?.textContent.includes('Source')
          );
          const detail = label?.querySelector('.awd-detail a')?.textContent || '';
          return detail.includes('Chrono24');
        });
        if (!isChrono24) {
          console.log(`[SKIP] Not Chrono24: ${url}`);
          continue;
        }

        const box = await extractDetailField('Box');
        const papers = await extractDetailField('Papers');
        const country = await extractDetailField('Location');
        const seller = await extractDetailField('Source');
        const listedFor =
          type === 'Historical'
            ? await extractDetailField('Listed For')
            : await extractListedDaysAgo();
        const price =
          type === 'Historical'
            ? await extractPriceField('Last seen price')
            : await extractAvailablePrice();
        const lastSeen =
          type === 'Historical'
            ? await extractPriceField('Last seen date')
            : '';
        const brand = await page.locator('.brand span').first().innerText().catch(() => '');
        const model = await page.locator('.lot-detail div').nth(1).innerText().catch(() => '');
        const ref = await extractReference();
        const condition = await extractDetailField('Condition');
        const imageUrl = await extractFirstImageURL();

        results.push({
          Brand: brand,
          Model: model,
          Reference: ref,
          Price: price,
          Seller: seller,
          Country: country,
          LastSeenDate: lastSeen,
          Box: box,
          Papers: papers,
          ListedFor: listedFor,
          Condition: condition,
          Image: imageUrl,
          URL: `https://everywatch.com${url}`,
        });
      } catch (err) {
        console.warn(`[ERROR] Skipping ${url}:`, err.message);
      }
    }
  }

  if (availLinks.length) await scrapeListings(availLinks, 'Available');
  if (histLinks.length) await scrapeListings(histLinks, 'Historical');

  const scrapedUrls = new Set(results.map(r => new URL(r.URL).pathname));
  const missingUrls = allLinks.filter(u => !scrapedUrls.has(new URL(`https://everywatch.com${u}`).pathname));

  if (missingUrls.length > 0) {
    console.log(`[RETRY] ${missingUrls.length} listings skipped. Retrying once...`);
    await scrapeListings(missingUrls, 'Retry');
  }

  sendStepFn(5);
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));

  await browser.close();
}

module.exports = scrapeEverywatch;
