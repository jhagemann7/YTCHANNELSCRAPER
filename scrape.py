import asyncio
from playwright.async_api import async_playwright
import csv
import re
import time
import os

# ===== Rotation settings =====
KEYWORDS_PER_RUN = 5
INDEX_FILE = "keyword_index.txt"

# Ordered list of 50 gaming keywords
ALL_KEYWORDS = [
    "minecraft lets play",
    "minecraft hardcore",
    "minecraft smp",
    "roblox obby",
    "roblox roleplay",
    "roblox tycoon",
    "roblox funny moments",
    "valorant montage",
    "valorant tips and tricks",
    "fortnite zero build",
    "fortnite creative map",
    "fortnite trickshots",
    "indie horror game",
    "phasmophobia gameplay",
    "pokemon showdown",
    "pokemon nuzlocke",
    "rocket league freestyle",
    "rocket league ranked",
    "gta 5 roleplay",
    "gta 5 stunts",
    "gta online money guide",
    "terraria calamity mod",
    "terraria master mode",
    "apex legends ranked",
    "apex legends tips",
    "call of duty warzone",
    "call of duty zombies",
    "call of duty trickshots",
    "league of legends highlights",
    "league of legends guide",
    "csgo competitive",
    "csgo case opening",
    "overwatch funny moments",
    "overwatch 2 ranked",
    "animal crossing island tour",
    "stardew valley farm design",
    "the sims 4 build challenge",
    "fifa 24 ultimate team",
    "nba 2k mycareer",
    "retro gaming review",
    "retro speedrun",
    "speedrun world record",
    "asmr gaming",
    "gaming setup tour",
    "pc build guide",
    "unreal engine game dev",
    "unity game dev",
    "virtual reality gameplay",
    "oculus quest 3 gameplay",
    "nintendo switch games",
    "playstation 5 gameplay",
    "xbox series x gameplay",
]

def get_next_keywords():
    """Return next 5 keywords; create/repair keyword_index.txt as needed; loop at end."""
    # Seed file if missing
    if not os.path.exists(INDEX_FILE):
        with open(INDEX_FILE, "w") as f:
            f.write("0")

    # Read index (repair if bad)
    try:
        with open(INDEX_FILE, "r") as f:
            start_index_raw = f.read().strip()
        start_index = int(start_index_raw) if start_index_raw != "" else 0
    except Exception:
        start_index = 0
        with open(INDEX_FILE, "w") as f:
            f.write("0")

    total = len(ALL_KEYWORDS)
    start_index %= total  # safety if corrupted/out-of-range

    end_index = start_index + KEYWORDS_PER_RUN
    if end_index <= total:
        selected = ALL_KEYWORDS[start_index:end_index]
        next_index = end_index % total
    else:
        wrap = end_index - total
        selected = ALL_KEYWORDS[start_index:] + ALL_KEYWORDS[:wrap]
        next_index = wrap

    # Persist next index for next run
    with open(INDEX_FILE, "w") as f:
        f.write(str(next_index))

    print(f"\n📅 Using {len(selected)} keywords today (start={start_index}, next={next_index}):")
    for q in selected:
        print(f" • {q}")

    return selected

# ===== Scraper settings =====
DELAY_BETWEEN_QUERIES = 5  # seconds
SCROLL_TIMES = 20

async def scrape(search_query, page):
    url = f"https://www.youtube.com/results?search_query={search_query.replace(' ', '+')}&sp=EgIQAg%253D%253D"  # channel filter
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
                 found.add(href.lstrip('/'))

    print(f"✅ Found {len(found)} channels for '{search_query}'")
    return found

# ===== Google Sheets push =====
import gspread
from oauth2client.service_account import ServiceAccountCredentials

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

    queries = get_next_keywords()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        for idx, query in enumerate(queries):
            handles = await scrape(query, page)
            all_handles.update(handles)

            if idx < len(queries) - 1:
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

    # Push to Google Sheet
    update_google_sheet(all_handles)

if __name__ == "__main__":
    asyncio.run(run())
