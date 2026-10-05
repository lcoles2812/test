#!/usr/bin/env python3
"""Render a standard Common Table recipe page from a JSON spec.

    python3 tools/recipe_page.py tools/recipes/<slug>.json

Writes recipes/<slug>.html with the shared nav, hero, share buttons, scaling
ingredient list, method, nutrients, swaps, optional related recipes, footer and
Recipe + BreadcrumbList structured data. See tools/recipes/ for example specs.

Ingredients are [amount, unit, name]. Units that are words ("tbsp", "batch")
get a space before them automatically; "g" and "ml" don't.
"""
import html
import json
import sys
from urllib.parse import quote

SITE = "https://commontablekitchen.com.au/"
SHORT_UNITS = {"", "g", "kg", "ml", "l"}

NAV = '<body>\n\n<nav>\n  <div class="nav-container">\n    <a class="logo" href="/">Common Table</a>\n    <button class="nav-toggle-btn" type="button" aria-label="Toggle navigation" aria-expanded="false" aria-controls="site-nav">☰</button>\n\n    <div class="nav-links" id="site-nav">\n      <a href="/">Home</a>\n      <div class="nav-dropdown">\n        <button type="button" class="nav-dropdown-trigger" aria-expanded="false" aria-haspopup="true" aria-controls="navRecipesPanel">\n          Recipes\n          <svg class="nav-dropdown-chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>\n        </button>\n      </div>\n      <a href="../meal-planner.html">Meal Planner</a>\n      <form class="nav-search" action="/" method="GET" role="search">\n        <input type="search" name="q" class="nav-search-input" placeholder="Search recipes..." aria-label="Search recipes">\n      </form>\n    </div>\n<div class="nav-dropdown-panel" id="navRecipesPanel">\n      <div class="nav-dropdown-col">\n        <p class="nav-dropdown-heading">By Time of Week</p>\n        <a href="../weeknight.html">Weeknight</a>\n        <a href="../singlenight.html">Single Night</a>\n        <a href="../sunday.html">Sunday</a>\n      </div>\n      <div class="nav-dropdown-col">\n        <p class="nav-dropdown-heading">By What You\'re After</p>\n        <a href="../high-protein.html">High Protein</a>\n        <a href="../fresh.html">Fresh</a>\n        <a href="../fast.html">Fast</a>\n        <a href="../slow-cook.html">Slow Cook</a>\n        <a href="../meal-prep.html">Meal Prep</a>\n        <a href="../dinner-for-two.html">Dinner for Two</a>\n        <a href="../party-food.html">Party Food</a>\n      </div>\n    </div>\n\n  </div>\n</nav>\n\n'
FOOTER = '<footer>\n    <div class="footer-social" aria-label="Common Table on social media">\n        <a href="https://instagram.com/commontablekitchen" target="_blank" rel="noopener noreferrer" aria-label="Instagram">\n            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none"/></svg>\n        </a>\n        <a href="https://pinterest.com/commontablekitchen" target="_blank" rel="noopener noreferrer" aria-label="Pinterest">\n            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">\n                <circle cx="12" cy="12" r="9.3"/>\n                <text x="12" y="16.5" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="12" font-weight="700" fill="currentColor" stroke="none">P</text>\n            </svg>\n        </a>\n        <a href="mailto:commontableadmin@gmail.com" aria-label="Email">\n            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 6.5l8 6.2 8-6.2"/></svg>\n        </a>\n    </div>\n    <p class="footer-contact">\n        <a href="mailto:commontableadmin@gmail.com">commontableadmin@gmail.com</a>\n    </p>\n    <p class="footer-copy">© 2026 Common Table • Built for real cooking</p>\n</footer>\n\n<script src="../scripts/chat-config.js?v=20260808"></script>\n<script src="../scripts/nav.js?v=20260808"></script>\n</body>\n</html>\n'
ICONS = '<link rel="icon" href="/favicon.ico" sizes="any">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n\n'
GTAG = '<!-- Google tag (gtag.js) -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-TDM7SCTG3K"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag("js", new Date());\n\n  gtag("config", "G-TDM7SCTG3K");\n</script>\n'

SCALE_SCRIPT = """<!-- SCRIPT -->
<script>
const baseServings = %d;

const slider = document.getElementById("servings");
const display = document.getElementById("servingValue");
const ingredients = document.querySelectorAll("#ingredients li");

function updateIngredients() {
    const servings = parseInt(slider.value);
    display.textContent = servings;

    const multiplier = servings / baseServings;

    ingredients.forEach(item => {
        const baseAmount = parseFloat(item.dataset.amount);
        const unit = item.dataset.unit || "";
        const name = item.dataset.name;

        let newAmount = baseAmount * multiplier;
        newAmount = Math.round(newAmount * 10) / 10;

        item.textContent = `${newAmount}${unit} ${name}`;
    });
}

slider.addEventListener("input", updateIngredients);
updateIngredients();
</script>

"""


def esc(text):
    return html.escape(text, quote=True)


def txt(text):
    return html.escape(text, quote=False)


def fmt(amount):
    return str(int(amount)) if float(amount) == int(amount) else str(amount)


def unit_attr(unit):
    return unit if unit in SHORT_UNITS else " " + unit


def render(spec):
    slug = spec["slug"]
    url = f"{SITE}recipes/{slug}.html"
    image_url = f"{SITE}images/{spec['image']}"
    title, desc = spec["title"], spec["description"]
    ingredients = [(fmt(a), unit_attr(u), n) for a, u, n in spec["ingredients"]]
    ingredient_text = [f"{a}{u} {n}" for a, u, n in ingredients]

    recipe = {
        "@context": "https://schema.org/",
        "@type": "Recipe",
        "name": title,
        "datePublished": spec["datePublished"],
        "description": desc,
        "image": image_url,
        "author": {"@type": "Person", "name": "Common Table"},
        "prepTime": spec["prepTime"],
        "cookTime": spec["cookTime"],
        "totalTime": spec["totalTime"],
        "recipeYield": str(spec["servings"]),
        "recipeCategory": spec["recipeCategory"],
        "recipeCuisine": spec["recipeCuisine"],
        "keywords": spec["keywords"],
        "recipeIngredient": ingredient_text,
        "recipeInstructions": [{"@type": "HowToStep", "text": f"{h}: {t}"} for h, t in spec["steps"]],
    }
    if spec.get("calories"):
        recipe["nutrition"] = {"@type": "NutritionInformation", "calories": f"{spec['calories']} calories"}
    crumbs = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE.rstrip("/")},
            {"@type": "ListItem", "position": 2, "name": title, "item": url},
        ],
    }
    pin = (
        "https://www.pinterest.com/pin/create/button/?url=" + quote(url, safe="")
        + "&media=" + quote(image_url, safe="") + "&description=" + quote(desc, safe="")
    )

    out = [f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)} | Common Table</title>

<meta name="description" content="{esc(desc)}">
<meta property="og:title" content="{esc(title)} | Common Table">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{image_url}">
<meta property="og:url" content="{url}">
<meta property="og:type" content="article">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)} | Common Table">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{image_url}">

<link rel="canonical" href="{url}">
{ICONS}<script type="application/ld+json">
{json.dumps(recipe, ensure_ascii=False, indent=2)}
</script>

<script type="application/ld+json">
{json.dumps(crumbs, ensure_ascii=False, indent=2)}
</script>
<link rel="stylesheet" href="../styles.css?v={spec.get('cssVersion', '20261005')}">
{GTAG}</head>

{NAV}<section class="recipe-hero">
  <div class="recipe-hero-copy">
    <h1>{txt(title)}</h1>
    <p class="hero-text">
        """ + "\n        <br><br>\n        ".join(txt(p) for p in spec["intro"]) + f"""
    </p>
<div class="recipe-share">
    <a class="share-btn" href="{esc(pin)}" target="_blank" rel="noopener noreferrer" aria-label="Pin this recipe on Pinterest">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9.3"/><text x="12" y="16.5" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="12" font-weight="700" fill="currentColor" stroke="none">P</text></svg>
        <span>Pin it</span>
    </a>
    <button type="button" class="share-btn" data-share-copy aria-label="Copy link to this recipe">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9.5 14.5l5-5"/><path d="M11 7l1.5-1.5a3 3 0 0 1 4.24 4.24L15 11.5"/><path d="M13 17l-1.5 1.5a3 3 0 0 1-4.24-4.24L9 12.5"/></svg>
        <span class="share-btn-label">Copy link</span>
    </button>
</div>
  </div>
  <img class="recipe-hero-image" src="../images/{esc(spec['image'])}" alt="{esc(spec['alt'])}" loading="eager" fetchpriority="high">
</section>

<div class="container">

<!-- SERVINGS -->
<h2 class="section-title">Servings</h2>

<input id="servings" type="range" min="1" max="{spec.get('maxServings', 8)}" value="{spec['servings']}">
<p><span id="servingValue">{spec['servings']}</span> servings</p>

<!-- QUICK STATS -->
<h2 class="section-title">Quick Stats</h2>
<p>{txt(spec['quickStats'])} • Base: {spec['servings']} servings</p>

<!-- INGREDIENTS -->
<h2 class="section-title">Ingredients</h2>

<ul id="ingredients">

"""]
    for (a, u, n), text in zip(ingredients, ingredient_text):
        out.append(f'  <li data-amount="{a}" data-unit="{u}" data-name="{esc(n)}">{html.escape(text, quote=False)}</li>\n')
    out.append("""
</ul>

<!-- METHOD -->
<h2 class="section-title">Method</h2>

<ol>
""")
    for heading, text in spec["steps"]:
        out.append(f"""
  <li>
    <strong>{txt(heading)}:</strong><br>
    {txt(text)}
  </li>
""")
    out.append(f"""
</ol>

<!-- KEY NUTRIENTS -->
<h2 class="section-title">Key Nutrients & Benefits</h2>
<p class="text-muted">
{txt(spec['nutrients'])}
</p>
""" + (f"""<p class="text-muted"><strong>Approx. calories:</strong> about {spec['calories']} kcal per serve</p>
""" if spec.get("calories") else "") + f"""
<!-- SMART SWAPS -->
<h2 class="section-title">Smart Swaps & Variations</h2>

<ul class="text-muted">
""")
    for bold, text in spec["swaps"]:
        out.append(f"  <li><strong>{txt(bold)}</strong>: {txt(text)}</li>\n")
    out.append("</ul>\n")
    if spec.get("related"):
        out.append("""
<!-- RELATED -->
<h2 class="section-title">Related Recipes</h2>

<ul class="text-muted">
""")
        for rel_slug, rel_title, why in spec["related"]:
            out.append(f'  <li><a href="{rel_slug}.html">{txt(rel_title)}</a> — {txt(why)}</li>\n')
        out.append("</ul>\n")
    out.append("\n</div>\n\n" + SCALE_SCRIPT % spec["servings"] + FOOTER)
    return "".join(out)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    path = f"recipes/{spec['slug']}.html"
    open(path, "w", encoding="utf-8").write(render(spec))
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
