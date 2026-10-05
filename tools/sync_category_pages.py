#!/usr/bin/env python3
"""Keep the Weeknight / Sunday / Single Night pages in step with recipes/recipes.json.

For each page, every recipe whose "category" (or "alsoIn") matches gets a card.
Existing cards are left exactly as written; missing ones are appended using the
recipe's title, image and excerpt. The page's ItemList structured data is then
rebuilt from the cards so it always matches what visitors see.

Cards for recipes that no longer belong on a page are reported, never removed.

Run from the site root:  python3 tools/sync_category_pages.py
"""
import html
import json
import re
import sys

SITE = "https://commontablekitchen.com.au/"
PAGES = [
    ("weeknight.html", "weeknight", "Weeknight Recipes"),
    ("sunday.html", "sunday", "Sunday Recipes"),
    ("singlenight.html", "single night", "Single Night Recipes"),
]

CARD_RE = re.compile(
    r'        <a class="card section-card" href="(recipes/[^"]+)">.*?<h2>(.*?)</h2>.*?</a>\n\n',
    re.S,
)


def build_card(recipe):
    tag = (recipe.get("tags") or ["Recipe"])[0].title()
    e = lambda text: html.escape(text, quote=True)
    return (
        f'        <a class="card section-card" href="{recipe["url"]}">\n'
        f'            <img class="section-card-image" src="{e(recipe["image"])}" alt="{e(recipe["title"])}" loading="lazy">\n'
        f'            <div class="section-card-content">\n'
        f'                <h2>{e(recipe["title"])}</h2>\n'
        f'                <p>{e(recipe.get("excerpt", ""))}</p>\n'
        f'                <span class="tag">{e(tag)}</span>\n'
        f'            </div>\n'
        f'        </a>\n\n'
    )


def rebuild_item_list(page, list_name, cards):
    match = re.search(
        r'("@type": "ItemList",\s*"name": "' + re.escape(list_name) + r'".*?"itemListElement": \[\n)(.*?)(\n\s*\])',
        page,
        re.S,
    )
    if not match:
        sys.exit(f"Couldn't find the {list_name} ItemList")
    indent = re.match(r"\s*", match.group(2)).group(0)
    items = ",\n".join(
        f'{indent}{{"@type": "ListItem", "position": {i}, "name": {json.dumps(html.unescape(title), ensure_ascii=False)}, "url": "{SITE}{url}"}}'
        for i, (url, title) in enumerate(cards, 1)
    )
    return page[: match.start(2)] + items + page[match.end(2):]


def main():
    recipes = json.load(open("recipes/recipes.json", encoding="utf-8"))
    for filename, category, list_name in PAGES:
        page = open(filename, encoding="utf-8").read()
        wanted = [r for r in recipes if r.get("category") == category or category in r.get("alsoIn", [])]
        cards = CARD_RE.findall(page)
        if not cards:
            sys.exit(f"No recipe cards found in {filename}")
        on_page = {url for url, _ in cards}

        missing = [r for r in wanted if r["url"] not in on_page]
        if missing:
            last_card_end = list(CARD_RE.finditer(page))[-1].end()
            page = page[:last_card_end] + "".join(build_card(r) for r in missing) + page[last_card_end:]
            cards = CARD_RE.findall(page)

        page = rebuild_item_list(page, list_name, cards)
        open(filename, "w", encoding="utf-8").write(page)

        stray = sorted(on_page - {r["url"] for r in wanted})
        print(f"{filename}: {len(cards)} cards, added {len(missing)}"
              + (f" ({', '.join(r['title'] for r in missing)})" if missing else ""))
        for url in stray:
            print(f"  note: {url} is on this page but its category says otherwise (add it to alsoIn to make that explicit)")


if __name__ == "__main__":
    main()
