import asyncio
from playwright.async_api import async_playwright
import csv
import re
import time

# ✅ New imports for Google Sheets
import gspread
from oauth2client.service_account import ServiceAccountCredentials

SEARCH_QUERIES = [
    "gaming",
    "minecraft gameplay",
    "roblox funny moments",
    "cod zombies",
    "terraria let's play"
]

DELAY_BETWEEN_QUERIES = 5  # seconds
SCROLL_TIMES = 20

async def scrape(search_query, page):
    url = f"https://www.youtube.com/results?search_query={search_query.replace(' ', '+')}&sp=EgIQAg%253D%253D"  # Channel filter
    print(f"\n🔍 Searching: {search_query}")
    await page.goto(url)
    await page.wait_for_timeout(2000)

    found = set()

    for _ in range(SCROLL_TIMES):
        await page.mouse.wheel(0, 3000)
        await page.wait_for_timeout(1000)

        elements = await page.query_selector_all("a")
        for el in elements:
            href = await el.get_attribute("href")
            if href and re.match(r"^/@[a-zA-Z0-9_.-]+$", href):
                found.add(href)

    print(f"✅ Found {len(found)} channels for '{search_query}'")
    return found

# ✅ New function to push to Google Sheets
def update_google_sheet(channel_handles, sheet_name="Sub Count 1"):
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name("creds.json", scope)
    client = gspread.authorize(creds)

    sheet = client.open("YTCHANNELMONITOR").worksheet(sheet_name)

    existing = set(h.strip() for h in sheet.col_values(1)[1:])  # skip header
    new_rows = [[handle] for handle in sorted(channel_handles) if handle not in existing]

    if new_rows:
        sheet.append_rows(new_rows)
        print(f"🟢 Added {len(new_rows)} new handles to Google Sheet.")
    else:
        print("✅ No new handles to add.")

async def run():
    all_handles = set()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        for idx, query in enumerate(SEARCH_QUERIES):
            handles = await scrape(query, page)
            all_handles.update(handles)

            if idx < len(SEARCH_QUERIES) - 1:
                print(f"⏸️ Waiting {DELAY_BETWEEN_QUERIES}s before next query...")
                time.sleep(DELAY_BETWEEN_QUERIES)

        await browser.close()

    # Save to CSV (optional backup)
    with open("channels.csv", "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["channel_handle"])
        for h in sorted(all_handles):
            writer.writerow([h])

    print(f"\n📁 Saved {len(all_handles)} total handles to channels.csv")

    # ✅ Push to Google Sheet
    update_google_sheet(all_handles)

if __name__ == "__main__":
    asyncio.run(run())
